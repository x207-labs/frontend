/* x207 draft v2 — "Epoch replay": one canvas scene that plays an epoch from its real data.
   Depends on x207.js (X207, fmt, labelOf, memberCount, recompute, STATUS).
   progress p runs 0..5:  0-1 Open · 1-2 Clearing · 2-3 Commit · 3-4 Payment window · 4-5 Finalized
   v4 app: `new EpochScene(root, data)` plays injected data { edges, outcome, names?, reported?, until?, start?, labels? }; without data it plays the epoch 8 snapshot X207. */

import { X207, fmt, signed, labelOf, memberCount, recompute, STATUS } from "./x207.js";

const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeIO = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]);

/* What the sizes were tuned for: the largest net position (2.25) and the largest debt (5.00) of epoch 8, in hundredths. Other data is scaled so its largest figure looks the same. */
const REF_NET = 225, REF_EDGE = 500;

/* The cleared amounts of the API form a circulation. Split it into the loops the solver cancelled.
   v4 app: live data may not be a clean circulation (sample data, or an epoch read before its clearing was applied), so whatever cannot sit on a loop is dropped first. */
function findCycles(edges) {
  const rem = new Map();
  edges.forEach(([d, c, , cl], i) => { if (cl > 0) rem.set(d + ">" + c, { d, c, i, v: cl }); });
  const cycles = [];
  const prune = () => {
    for (let again = true; again; ) {
      again = false;
      const out = new Set(), inn = new Set();
      rem.forEach((e) => { out.add(e.d); inn.add(e.c); });
      rem.forEach((e, k) => { if (!out.has(e.c) || !inn.has(e.d)) { rem.delete(k); again = true; } });
    }
  };
  prune();
  while (rem.size) {
    const start = Math.min(...[...rem.values()].map((e) => e.d));
    const path = [start], seen = new Map([[start, 0]]);
    let cur = start, loop;
    for (;;) {
      const next = [...rem.values()].filter((e) => e.d === cur).sort((a, b) => a.c - b.c)[0];
      if (seen.has(next.c)) { loop = path.slice(seen.get(next.c)); break; }
      seen.set(next.c, path.length); path.push(next.c); cur = next.c;
    }
    const es = loop.map((m, k) => rem.get(m + ">" + loop[(k + 1) % loop.length]));
    const amount = Math.min(...es.map((e) => e.v));
    cycles.push({ members: loop, edgeIdx: es.map((e) => e.i), amount });
    es.forEach((e) => { e.v -= amount; if (e.v === 0) rem.delete(e.d + ">" + e.c); });
    prune();
  }
  return cycles;
}

const PHASES = [
  ["Open", "Agents pay each other with signed vouchers. Nothing moves on chain yet."],
  ["Clearing", "A solver finds debts that run in a loop. The contract checks each loop and cancels it."],
  ["Commit", "The contract nets every member. Each one is left with a single amount."],
  ["Payment window", "Six members pay in. One does not, and 0.55 comes out of its stake."],
  ["Finalized", "Eight members are paid. Three have claimed; five can claim when they like."]
];

const times = (n, one, many) => n + " " + (n === 1 ? one : many);

/* v4 app: the five captions for injected data, with the counts of that epoch (the epoch 8 snapshot keeps PHASES, which are worded for its own numbers). */
function phasesFor(sc) {
  const at = (list, o) => list.filter((i) => sc.outcome[i] === o);
  const debtors = sc.debtors.length, creditors = sc.creditors.length;
  const paid = at(sc.debtors, "paid").length, due = at(sc.debtors, "due").length, defaulted = at(sc.debtors, "defaulted");
  const stake = defaulted.reduce((s, i) => s - sc.r.net[i], 0), claimed = at(sc.creditors, "claimed").length;
  const pay = debtors === 0 ? "Every member nets to zero, so nobody has to pay in."
    : times(debtors, "member owes", "members owe") + " after netting."
      + (paid ? " " + paid + " paid in." : "")
      + (due ? " " + times(due, "member can", "members can") + " still pay before the window closes." : "")
      + (defaulted.length ? " " + times(defaulted.length, "member did", "members did") + " not pay, and " + fmt(stake) + " comes out of " + (defaulted.length === 1 ? "its" : "their") + " stake." : "");
  const fin = creditors === 0 ? "Nobody is owed anything after netting."
    : times(creditors, "member is", "members are") + " paid. " + claimed + " claimed, " + (creditors - claimed) + " can claim when they like.";
  return [PHASES[0], PHASES[1], PHASES[2], ["Payment window", pay], ["Finalized", fin]];
}

class EpochScene {
  constructor(root, data) {
    this.root = root;
    this.canvas = root.querySelector("canvas");
    this.ctx = this.canvas.getContext("2d");
    this.tip = root.querySelector(".scene-tip");
    this.setup(data);
    this.target = this.p = clamp(this.data.start == null ? 0 : this.data.start, 0, this.max); this.playing = false; this.hover = null; this.last = 0; this.visible = true;
    this.reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
    this.listeners = [];
    this.dead = false;
    this.readTheme();
    // v4 port: every observer and listener is kept, so destroy() can undo it when React unmounts the section.
    this.ro = new ResizeObserver(() => this.resize()); this.ro.observe(this.canvas);
    this.io = new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; if (this.visible) this.kick(); }); this.io.observe(this.canvas);
    this.onMove = (e) => this.onPointer(e);
    this.onLeave = () => this.setHover(null);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerleave", this.onLeave);
    this.resize();
  }

  /* Everything derived from the data: no canvas needed, so EpochScene.model(data) can answer stateAt(p) where nothing can be drawn. */
  setup(data) {
    this.data = data || X207;
    this.E = this.data.edges;
    this.n = Math.max(1, memberCount(this.data));
    this.outcome = Array.from({ length: this.n }, (_, i) => (this.data.outcome && this.data.outcome[i]) || "flat");
    this.names = this.data.names;
    this.r = recompute(this.data);
    this.cycles = findCycles(this.E);
    this.K = Math.max(1, this.cycles.length);          // loops share the clearing step; epoch 8 has 6
    this.max = clamp(this.data.until == null ? 5 : this.data.until, 0, 5);   // an epoch that is not finalized stops where it has got to
    const maxEdge = Math.max(0, ...this.E.map((e) => e[2])), maxNet = Math.max(0, ...this.r.net.map(Math.abs));
    this.ak = maxEdge > 0 ? REF_EDGE / maxEdge : 1;     // line widths follow the debt, scaled so the largest looks like epoch 8's
    this.vk = maxNet > 0 ? Math.sqrt(REF_NET / maxNet) : 1;   // orb and net line sizes follow the net position
    this.rs = clamp(18 / this.n, 0.35, 1);              // members shrink once the ring holds more than 18
    this.showLabels = this.data.labels == null ? this.n <= 24 : !!this.data.labels;
    const m = Math.max(1, this.E.length);
    this.order = this.E.map((_, i) => i).sort((a, b) => ((a * 7) % m) - ((b * 7) % m));
    this.rank = []; this.order.forEach((i, k) => (this.rank[i] = k));
    this.debtors = this.r.net.map((v, i) => [v, i]).filter(([v]) => v < 0).map(([, i]) => i);
    this.creditors = this.r.net.map((v, i) => [v, i]).filter(([v]) => v > 0).map(([, i]) => i);
    this.phases = this.data === X207 ? PHASES : phasesFor(this);
  }
  /** The model of `data` without a canvas: loops, figures and stateAt(p). Use it to show the end figures where the scene cannot run (no 2D canvas). */
  static model(data) { const m = Object.create(EpochScene.prototype); m.setup(data); return m; }

  onState(fn) { this.listeners.push(fn); fn(this.stateAt(this.p)); }
  /* v4 port: reads the --ds-* tokens of src/ds/tokens.css (the draft read unprefixed names). */
  readTheme() {
    const cs = getComputedStyle(document.documentElement), v = (k) => cs.getPropertyValue(k).trim();
    this.c = { ink: v("--ds-ink"), ink2: v("--ds-ink-2"), ink3: v("--ds-ink-3"), paper: v("--ds-paper"), surface: v("--ds-surface"), rule: v("--ds-rule"),
      settled: v("--ds-settled"), due: v("--ds-due"), bad: v("--ds-default"), claim: v("--ds-claim") };
    this.font = getComputedStyle(document.body).fontFamily;
    this.mono = v("--ds-font-mono");
  }
  /** Stops the loop and detaches everything the constructor attached. Safe to call twice. */
  destroy() {
    this.dead = true;
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ro.disconnect(); this.io.disconnect();
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerleave", this.onLeave);
    this.listeners.length = 0;
  }
  resize() {
    const b = this.canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    this.W = b.width; this.H = b.height;
    this.canvas.width = Math.round(b.width * dpr); this.canvas.height = Math.round(b.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cx = this.W / 2; this.cy = this.H / 2;
    this.R = Math.max(90, Math.min(this.W, this.H) * 0.5 - 62);
    this.pos = Array.from({ length: this.n }, (_, i) => { const a = (i / this.n) * 2 * Math.PI - Math.PI / 2; return [this.cx + this.R * Math.cos(a), this.cy + this.R * Math.sin(a), a]; });
    this.kick();
  }

  /* ---- time ---- */
  setTarget(p, instant) { this.target = clamp(p, 0, this.max); if (instant || this.reduced) this.p = this.target; this.kick(); }
  play() { if (this.target >= this.max - 0.001) this.setTarget(0, true); this.playing = true; this.kick(); this.emit(); }
  pause() { this.playing = false; this.emit(); }
  kick() { if (!this.raf && !this.dead) this.raf = requestAnimationFrame((t) => this.frame(t)); }
  frame(now) {
    this.raf = 0;
    if (this.dead) return;
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000); this.last = now;
    if (this.playing) { this.target = Math.min(this.max, this.target + dt / (this.reduced ? 1.2 : 3.4)); if (this.target >= this.max) this.playing = false; }
    this.p = this.reduced ? this.target : this.p + (this.target - this.p) * (1 - Math.exp(-dt * 7));
    if (Math.abs(this.target - this.p) < 0.0005) this.p = this.target;
    this.draw(this.p, now / 1000);
    this.emit();
    const flowing = !this.reduced && this.p > 2.98; // payment flows keep moving so direction stays readable
    if (this.visible && (this.playing || this.p !== this.target || flowing)) this.kick(); else this.last = 0;
  }
  emit() { const s = this.stateAt(this.p); s.playing = this.playing; s.target = this.target; this.listeners.forEach((f) => f(s)); }

  /* ---- the model: every figure on screen is derived from the vouchers (24 for epoch 8) ---- */
  reveal(i, p) { const T = this.E.length + 3; return p >= 1 ? 1 : easeOut(clamp((p - this.rank[i] / T) / (4 / T))); }
  cancelOf(k, p) { if (p >= 2) return 1; if (p <= 1) return 0; return easeIO(clamp(((p - 1) * this.K - k - 0.45) / 0.55)); }
  glowOf(k, p) { if (p <= 1 || p >= 2) return 0; const u = (p - 1) * this.K - k; return u > 0 && u < 1 ? Math.sin(Math.PI * u) : 0; }
  amountOf(i, p) { let a = this.E[i][2] * this.reveal(i, p); this.cycles.forEach((c, k) => { if (c.edgeIdx.includes(i)) a -= c.amount * this.cancelOf(k, p); }); return Math.max(0, a); }
  payOf(i, p) {           // share of member i's net amount that has moved, 0..1
    const net = this.r.net[i]; if (net === 0) return 0;
    // the stagger between members is squeezed when there are many, so the last one still finishes inside its step
    if (net < 0) { if (p <= 3) return 0; const f = p - 3, k = this.debtors.indexOf(i), out = this.outcome[i], nd = this.debtors.length;
      if (out === "due") return 0;                    // 402: unpaid, still inside the payment window
      return out === "defaulted" ? easeIO(clamp((f - 0.58) / 0.4)) : easeIO(clamp(f * 1.7 - k * (nd > 1 ? Math.min(0.11, 0.7 / (nd - 1)) : 0.11))); }
    const nc = this.creditors.length;
    if (p <= 4) return 0; return easeIO(clamp((p - 4) * 1.7 - this.creditors.indexOf(i) * (nc > 1 ? Math.min(0.09, 0.7 / (nc - 1)) : 0.09)));
  }
  stateAt(p) {
    let owed = 0, cancelled = 0, paidIn = 0, stake = 0, paidOut = 0, waiting = 0, due = 0;
    this.E.forEach((e, i) => (owed += e[2] * this.reveal(i, p)));
    this.cycles.forEach((c, k) => (cancelled += c.amount * c.members.length * this.cancelOf(k, p)));
    this.r.net.forEach((v, i) => { const q = this.payOf(i, p), o = this.outcome[i];
      if (v < 0) { if (o === "defaulted") stake += -v * q; else if (o === "due") due += p >= 3 ? -v : 0; else paidIn += -v * q; }
      else if (v > 0) { if (o === "claimed") paidOut += v * q; else waiting += v * q; } });
    const phase = Math.min(4, Math.floor(p + 1e-6));
    return { p, phase, name: this.phases[phase][0], caption: this.phases[phase][1], owed, cancelled, net: this.r.payIn * easeIO(clamp(p - 2)), paidIn, stake, paidOut, waiting, due,
      vouchers: this.E.filter((_, i) => this.reveal(i, p) > 0.02).length, loops: this.cycles.filter((_, k) => this.cancelOf(k, p) > 0.5).length };
  }

  /* ---- drawing ---- */
  bez(i, bend) { const [d, c] = this.E[i], P = this.pos[d], Q = this.pos[c], mx = (P[0] + Q[0]) / 2, my = (P[1] + Q[1]) / 2;
    return [P, [mx + (this.cx - mx) * bend, my + (this.cy - my) * bend], Q]; }
  pt([P, C, Q], t) { const u = 1 - t; return [u * u * P[0] + 2 * u * t * C[0] + t * t * Q[0], u * u * P[1] + 2 * u * t * C[1] + t * t * Q[1]]; }
  stroke(B, t0, t1, w, color, alpha, dash) {
    if (alpha <= 0.005 || t1 <= t0) return; const x = this.ctx;
    x.beginPath(); for (let s = 0; s <= 22; s++) { const [px, py] = this.pt(B, t0 + ((t1 - t0) * s) / 22); s ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.lineWidth = w; x.strokeStyle = color; x.globalAlpha = alpha; x.setLineDash(dash || []); x.lineCap = "round"; x.stroke(); x.setLineDash([]); x.globalAlpha = 1;
  }
  head(B, t, w, color, alpha) {
    if (alpha <= 0.02) return; const x = this.ctx, a = this.pt(B, t), b = this.pt(B, t - 0.04), ang = Math.atan2(a[1] - b[1], a[0] - b[0]), s = 4.5 + w * 0.9;
    x.save(); x.translate(a[0], a[1]); x.rotate(ang); x.beginPath(); x.moveTo(s, 0); x.lineTo(-s * 0.7, s * 0.62); x.lineTo(-s * 0.7, -s * 0.62); x.closePath();
    x.fillStyle = color; x.globalAlpha = alpha; x.fill(); x.restore(); x.globalAlpha = 1;
  }
  dot(xy, r, color, alpha) { const x = this.ctx; x.beginPath(); x.arc(xy[0], xy[1], r, 0, 6.2832); x.fillStyle = color; x.globalAlpha = alpha; x.fill(); x.globalAlpha = 1; }
  touches(i) { return this.hover == null || this.E[i][0] === this.hover || this.E[i][1] === this.hover; }

  draw(p, time) {
    const x = this.ctx, c = this.c, w = (a) => Math.max(0.8, Math.min(7.5, (a * this.ak) / 62)), small = this.W < 520;
    x.clearRect(0, 0, this.W, this.H);
    const collapse = easeIO(clamp(p - 2));

    // faint ring the members sit on: the "circle"
    x.beginPath(); x.arc(this.cx, this.cy, this.R, 0, 6.2832); x.strokeStyle = c.rule; x.lineWidth = 1; x.globalAlpha = 0.7; x.stroke(); x.globalAlpha = 1;

    // 1. debts between members
    if (p < 3) {
      const bend = 0.55 + 0.45 * collapse, tEnd = 1 - 13 / (this.R * 1.2);
      this.E.forEach((e, i) => {
        const rv = this.reveal(i, p); if (rv <= 0) return;
        const B = this.bez(i, bend), amt = this.amountOf(i, p), dim = this.touches(i) ? 1 : 0.1, fade = (1 - collapse) * dim;
        let glow = 0; this.cycles.forEach((cy, k) => { if (cy.edgeIdx.includes(i)) glow = Math.max(glow, this.glowOf(k, p)); });
        const end = tEnd * (p < 1 ? rv : 1);
        if (amt > 0.5) { this.stroke(B, 0, end, w(amt) * (1 - collapse * 0.5), c.ink, 0.62 * fade); if (p >= 1 || rv > 0.98) this.head(B, end, w(amt), c.ink, 0.8 * fade); }
        if (glow > 0) { this.stroke(B, 0, tEnd, w(e[2]) + 2.5, c.settled, 0.85 * glow * dim); this.head(B, tEnd, w(e[2]) + 2, c.settled, glow * dim); }
        if (p < 1 && rv > 0 && rv < 1 && !this.reduced) this.dot(this.pt(B, end), 3.2, c.ink, dim); // the voucher in flight
      });
      // a pulse runs round the loop that is being cancelled
      if (!this.reduced) this.cycles.forEach((cy, k) => { const g = this.glowOf(k, p); if (g <= 0) return;
        const u = (((p - 1) * this.K - k) * 2.2) % 1, pos = u * cy.edgeIdx.length, idx = Math.floor(pos);
        this.dot(this.pt(this.bez(cy.edgeIdx[idx], 0.55), (pos - idx) * (1 - 13 / (this.R * 1.2))), 4.2, c.settled, g); });
    }

    // 2. one line per member to the contract
    if (collapse > 0) {
      const hubR = 30;
      this.r.net.forEach((v, i) => {
        if (v === 0) return;
        const P = this.pos[i], ang = P[2], out = this.outcome[i], q = this.payOf(i, p), dim = this.hover == null || this.hover === i ? 1 : 0.14;
        const a = [this.cx + (this.R - 12) * Math.cos(ang), this.cy + (this.R - 12) * Math.sin(ang)], b = [this.cx + hubR * Math.cos(ang), this.cy + hubR * Math.sin(ang)];
        const from = v < 0 ? a : b, to = v < 0 ? b : a, col = out === "defaulted" ? c.bad : v < 0 ? c.due : out === "claimed" ? c.settled : c.claim, lw = Math.max(1.2, Math.sqrt(Math.abs(v)) * 0.42 * this.vk);
        const seg = (t0, t1, alpha, dash, width) => { x.beginPath(); x.moveTo(from[0] + (to[0] - from[0]) * t0, from[1] + (to[1] - from[1]) * t0); x.lineTo(from[0] + (to[0] - from[0]) * t1, from[1] + (to[1] - from[1]) * t1);
          x.lineWidth = width; x.strokeStyle = col; x.globalAlpha = alpha * dim; x.setLineDash(dash); x.lineCap = "butt"; x.stroke(); x.setLineDash([]); x.globalAlpha = 1; };
        seg(0, 1, 0.38 * collapse, [2, 5], 1.2);                                   // what is due
        if (q > 0) seg(0, q, 0.95, out === "claimable" ? [5, 4] : [], lw);         // what has moved (dashed while it waits to be claimed)
        if (q > 0.02 && !this.reduced && out !== "claimable") for (let k = 0; k < 3; k++) { const t = ((time * 0.55 + k / 3 + i * 0.13) % 1) * q;
          this.dot([from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t], 2.4, col, 0.9 * dim); }
      });
      // the circle contract
      x.beginPath(); x.arc(this.cx, this.cy, hubR * (0.9 + 0.1 * collapse), 0, 6.2832); x.fillStyle = c.ink; x.globalAlpha = collapse; x.fill();
      x.fillStyle = c.paper; x.font = `500 11px ${this.font}`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText("contract", this.cx, this.cy); x.globalAlpha = 1;
    }

    // 3. members
    this.pos.forEach(([px, py, ang], i) => {
      const v = this.r.net[i], out = this.outcome[i], dim = this.hover == null || this.hover === i || this.E.some((e) => (e[0] === this.hover && e[1] === i) || (e[1] === this.hover && e[0] === i)) ? 1 : 0.3;
      const col = v === 0 ? c.ink3 : out === "defaulted" ? c.bad : v < 0 ? c.due : out === "claimed" ? c.settled : c.claim;
      const rad = ((small ? 5 : 6) + Math.sqrt(Math.abs(v)) * 0.62 * this.vk * collapse * Math.min(1, this.R / 240)) * this.rs;
      x.globalAlpha = dim;
      x.beginPath(); x.arc(px, py, rad, 0, 6.2832); x.fillStyle = c.surface; x.fill();
      if (collapse > 0 && v !== 0) { x.globalAlpha = dim * collapse * (0.25 + 0.75 * (p > 3 ? this.payOf(i, p) : 0)); x.fillStyle = col; x.fill(); x.globalAlpha = dim; }
      x.lineWidth = this.hover === i ? 2.5 : 1.5; x.strokeStyle = collapse > 0.5 && v !== 0 ? col : c.ink; x.stroke();
      const lx = this.cx + (this.R + rad + (small ? 15 : 22)) * Math.cos(ang), ly = this.cy + (this.R + rad + (small ? 13 : 18)) * Math.sin(ang);
      if (this.showLabels) {                          // a crowded ring has no labels: the tip names the member under the pointer
        x.fillStyle = c.ink; x.font = `500 ${small ? 10 : 11.5}px ${this.mono}`; x.textAlign = "center"; x.textBaseline = "middle"; x.fillText(labelOf(i, this.names), lx, ly - (collapse > 0.5 ? 6 : 0));
        if (collapse > 0.5) { x.globalAlpha = dim * (collapse - 0.5) * 2; x.fillStyle = v === 0 ? c.ink3 : col; x.font = `600 ${small ? 10 : 11.5}px ${this.font}`;
          x.fillText(p > 4.6 ? (STATUS[out] || STATUS.flat)[1] + " " + (v === 0 ? "flat" : signed(v)) : v === 0 ? "flat" : signed(v), lx, ly + 7); }
      }
      x.globalAlpha = 1;
    });
  }

  /* ---- pointer ---- */
  onPointer(e) {
    const b = this.canvas.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top; let best = null, bd = 30;
    this.pos.forEach(([px, py], i) => { const d = Math.hypot(px - mx, py - my); if (d < bd) { bd = d; best = i; } });
    this.setHover(best);
  }
  setHover(i) {
    if (i === this.hover) return; this.hover = i; this.canvas.style.cursor = i == null ? "default" : "pointer";
    if (this.tip) {
      if (i == null) this.tip.hidden = true;
      else { const [cls, code, label] = STATUS[this.outcome[i]] || STATUS.flat, v = this.r.net[i], [px, py] = this.pos[i];
        this.tip.innerHTML = `<b class="mono">${esc(labelOf(i, this.names))}</b><dl><dt>Owed to others</dt><dd>${fmt(this.r.owes[i])}</dd><dt>Owed by others</dt><dd>${fmt(this.r.owed[i])}</dd><dt>Net</dt><dd>${v === 0 ? "0.00" : signed(v)}</dd></dl><span class="code ${cls}"><b>${code}</b>${label}</span>`;
        this.tip.hidden = false; this.tip.style.left = clamp(px, 96, this.W - 96) + "px"; this.tip.style.top = (py > this.cy ? py - 18 : py + 18) + "px"; this.tip.dataset.side = py > this.cy ? "above" : "below"; }
    }
    document.querySelectorAll("#ledger tbody tr").forEach((tr) => tr.classList.toggle("is-hot", i != null && tr.dataset.m == i));
    this.kick();
  }
}

/* ---- HUD wiring: the [data-k] read-outs, the caption and the chapter buttons. Shared by mountScene and mountStory3D (scene3d.js).
   opts.subMoved(state, scene) replaces the line under the "moved" figure; the default is worded for epoch 8. ---- */
function hud(scene, root, opts = {}) {
  const $ = (s) => root.querySelector(s), chapters = [...root.querySelectorAll("[data-chapter]")];
  const set = (el, t) => { if (el && el.textContent !== t) el.textContent = t; };
  const vouchers = scene.E.length, loops = scene.cycles.length;
  const subMoved = opts.subMoved || ((s) => (s.p < 3 ? (s.p >= 2 ? fmt(s.net) + " to settle" : "nothing yet") : s.p < 4 ? fmt(s.stake) + " from a stake" : fmt(s.paidOut) + " claimed, " + fmt(s.waiting) + " waiting"));
  scene.onState((s) => {
    set($("[data-k=owed]"), fmt(s.owed)); set($("[data-k=cancelled]"), fmt(s.cancelled));
    set($("[data-k=moved]"), fmt(s.paidIn + s.stake)); set($("[data-k=phase]"), s.name); set($("[data-k=caption]"), s.caption);
    set($("[data-k=sub-owed]"), s.vouchers + " of " + vouchers + (vouchers === 1 ? " voucher" : " vouchers")); set($("[data-k=sub-cancelled]"), s.loops + " of " + loops + (loops === 1 ? " loop" : " loops"));
    set($("[data-k=sub-moved]"), subMoved(s, scene));
    chapters.forEach((b, k) => b.setAttribute("aria-current", String(k === s.phase)));
    root.dataset.phase = s.phase;
  });
}

/* ---- HUD wiring: counters, caption, scrubber, play ----
   opts.data: play that data instead of the epoch 8 snapshot; opts.scene: an already built scene (a subclass); opts.subMoved: see hud().
   The returned scene's destroy() also takes off every listener this function put on the controls, so React can unmount and mount it again. */
function mountScene(root, opts = {}) {
  const scene = opts.scene || new EpochScene(root, opts.data), $ = (s) => root.querySelector(s);
  const range = $("input[type=range]"), playBtn = $("[data-play]"), chapters = [...root.querySelectorAll("[data-chapter]")];
  let scrubbing = false;
  hud(scene, root, opts);
  scene.onState((s) => {
    if (range && !scrubbing) range.value = String(Math.round((s.target ?? s.p) * 200));
    if (range) range.setAttribute("aria-valuetext", s.name);
    if (playBtn) { playBtn.textContent = s.playing ? "Pause" : s.p >= scene.max - 0.01 ? "Replay" : "Play"; }
  });
  const onInput = () => { scrubbing = true; scene.pause(); scene.setTarget(range.value / 200); }, onEnd = () => (scrubbing = false);
  const onPlay = () => (scene.playing ? scene.pause() : scene.play());
  const jumps = chapters.map((b, k) => [b, () => { if (opts.onChapter) return opts.onChapter(k); scene.pause(); scene.setTarget(k + 0.999); }]);
  if (range) { range.addEventListener("input", onInput); range.addEventListener("change", onEnd); range.addEventListener("pointerup", onEnd); }
  if (playBtn) playBtn.addEventListener("click", onPlay);
  jumps.forEach(([b, jump]) => b.addEventListener("click", jump));
  const baseDestroy = scene.destroy.bind(scene);
  scene.destroy = () => {
    if (range) { range.removeEventListener("input", onInput); range.removeEventListener("change", onEnd); range.removeEventListener("pointerup", onEnd); }
    if (playBtn) playBtn.removeEventListener("click", onPlay);
    jumps.forEach(([b, jump]) => b.removeEventListener("click", jump));
    baseDestroy();
  };
  return scene;
}

/* ---- scroll story: the page's scroll position is the timeline ---- */
function mountStory(story) {
  const steps = [...story.querySelectorAll(".chapter")];
  const scene = mountScene(story.querySelector("[data-scene]"), { onChapter: (k) => {
    const top = story.getBoundingClientRect().top + scrollY, span = story.offsetHeight - innerHeight;
    scrollTo({ top: top + (span * (k + 0.96)) / 5, behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); } });
  let ticking = false;
  const update = () => { ticking = false;
    const b = story.getBoundingClientRect(), span = b.height - innerHeight, t = clamp(-b.top / span);
    scene.setTarget(t * 5);
    steps.forEach((s, k) => s.classList.toggle("is-on", Math.min(4, Math.floor(t * 5 + 1e-6)) === k)); };
  addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  addEventListener("resize", update); update();
  return scene;
}

export { clamp, easeOut, easeIO, findCycles, PHASES, EpochScene, hud, mountScene, mountStory };
