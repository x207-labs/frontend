/* x207 draft v4 — the epoch-8 story in 3D (canvas 2D with a perspective camera, no WebGL).
   Same model as scene.js (EpochScene: reveal, cancel, net, pay, the real loops); only the geometry is new:
   the circle lies on a floor, agents float above it as orbs with eyes, debts arch between them, the circle contract stands in the middle.
   Like the production theatre (frontend/src/landing/brain/scene.ts): the camera turns with the scroll and follows the pointer,
   rises over the circle during clearing and commit, and the visitor can drag to turn the circle.
   Depends on x207.js (signed, labelOf, STATUS) and scene.js (EpochScene, hud, mountScene, clamp, easeIO).
   v4 app: `new EpochScene3D(root, data)` and `mountScene3D(root, { data })` play injected data (see scene.js); without data it is the epoch 8 snapshot. */

import { signed, labelOf, STATUS } from "./x207.js";
import { clamp, easeIO, EpochScene, hud, mountScene } from "./scene.js";

const S3 = (() => {
  const hexRgb = (h) => [1, 3, 5].map((k) => parseInt(h.slice(k, k + 2), 16));
  const mixHex = (a, b, t) => { if (!a || !b || a[0] !== "#" || b[0] !== "#") return b || a; const A = hexRgb(a), B = hexRgb(b); return `rgb(${A.map((v, k) => Math.round(v + (B[k] - v) * t)).join(",")})`; };
  const smooth = (t) => t * t * (3 - 2 * t);
  /* camera pitch along the story: low at open, over the circle at clearing and commit, back down at the end */
  const PITCH = [[0, 0.42], [0.9, 0.5], [1.7, 0.92], [2.6, 1.12], [3.5, 0.86], [5, 0.58]];
  const pitchAt = (p) => { for (let k = 1; k < PITCH.length; k++) { const [p0, v0] = PITCH[k - 1], [p1, v1] = PITCH[k]; if (p <= p1) return v0 + (v1 - v0) * smooth(clamp((p - p0) / (p1 - p0))); } return PITCH[PITCH.length - 1][1]; };
  const LIFT = 0.13;           // agents float this high above the floor
  return { mixHex, pitchAt, LIFT };
})();

class EpochScene3D extends EpochScene {
  /* called by the base constructor before subclass fields exist: initialise lazily */
  ensure() {
    if (this.cam) return;
    this.cam = { yaw: -0.55, pitch: 0.42, user: 0, vel: 0, px: 0, py: 0, tx: 0, ty: 0 };
    this.world = Array.from({ length: this.n }, (_, i) => { const a = (i / this.n) * 2 * Math.PI - Math.PI / 2; return [Math.cos(a), S3.LIFT, Math.sin(a), a]; });
    this.pos = this.world.map(() => [0, 0, 0]);
    this.drag = null;
  }
  resize() {
    this.ensure();
    const b = this.canvas.getBoundingClientRect(), dpr = Math.min(2, devicePixelRatio || 1);
    this.W = b.width; this.H = b.height;
    this.canvas.width = Math.round(b.width * dpr); this.canvas.height = Math.round(b.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.cx = this.W / 2; this.cy = this.H * (this.flat ? 0.46 : 0.5);
    // the landing's story (flat) keeps the whole ring, its labels and the paying agents inside a shorter, wider canvas
    this.F = Math.max(100, Math.min(this.W * (this.W < 520 ? 0.36 : 0.44), this.H * (this.flat ? 0.44 : 0.56))); this.D = 3.3;
    this.R = this.F;                                   // used by the base tooltip code
    this.kick();
  }

  /* world -> screen. returns [x, y, k (perspective scale), z (toward the viewer)] */
  proj(x, y, z) {
    const c = this.cam, cy = Math.cos(c.yaw), sy = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const x1 = x * cy - z * sy, z1 = x * sy + z * cy, y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp, k = this.D / (this.D - z2);
    return [this.cx + x1 * this.F * k, this.cy + 0.12 * this.F - y2 * this.F * k, k, z2];
  }
  fog(k) { return clamp(0.42 + (k - 0.82) * 1.6, 0.35, 1); }

  /* ---- time: keep the camera alive while visible ---- */
  frame(now) {
    this.raf = 0;
    if (this.dead) return;
    const dt = Math.min(0.05, (now - (this.last || now)) / 1000); this.last = now;
    if (this.playing) { this.target = Math.min(this.max, this.target + dt / (this.reduced ? 1.2 : 3.4)); if (this.target >= this.max) this.playing = false; }
    this.p = this.reduced ? this.target : this.p + (this.target - this.p) * (1 - Math.exp(-dt * 7));
    if (Math.abs(this.target - this.p) < 0.0005) this.p = this.target;
    const c = this.cam, ease = this.reduced ? 1 : 1 - Math.exp(-dt * 4.5);
    if (!this.drag) { c.user += c.vel * dt; c.vel *= Math.exp(-dt * 3); }
    c.px += (c.tx - c.px) * ease; c.py += (c.ty - c.py) * ease;
    const spin = this.reduced ? 0 : (now / 1000) * 0.035;
    const yawT = -0.55 + this.p * 0.36 + spin + c.user + c.px * 0.32, pitchT = S3.pitchAt(this.p) + c.py * 0.1;
    c.yaw += (yawT - c.yaw) * (this.drag ? 1 : ease); c.pitch += (pitchT - c.pitch) * ease;
    this.draw(this.p, now / 1000);
    this.emit();
    if (this.visible && (!this.reduced || this.p !== this.target)) this.kick(); else this.last = 0;
  }

  /* ---- pointer: parallax, hover, drag to turn ---- */
  onPointer(e) {
    this.ensure();
    const b = this.canvas.getBoundingClientRect(), mx = e.clientX - b.left, my = e.clientY - b.top;
    if (this.drag) { const dx = mx - this.drag.x; this.cam.user += dx * 0.006; this.cam.vel = dx * 0.006 / Math.max(0.016, (e.timeStamp - this.drag.t) / 1000); this.drag = { x: mx, t: e.timeStamp }; this.kick(); return; }
    this.cam.tx = clamp((mx / this.W) * 2 - 1, -1, 1); this.cam.ty = clamp((my / this.H) * 2 - 1, -1, 1);
    let best = null, bd = 28; this.pos.forEach(([px, py], i) => { const d = Math.hypot(px - mx, py - my); if (d < bd) { bd = d; best = i; } });
    this.setHover(best);
  }
  bindDrag() {
    this.ensure();
    const cv = this.canvas;
    const down = (e) => { const b = cv.getBoundingClientRect(); this.drag = { x: e.clientX - b.left, t: e.timeStamp }; this.cam.vel = 0; cv.classList.add("is-dragging"); cv.setPointerCapture?.(e.pointerId); };
    const end = (e) => { if (!this.drag) return; this.drag = null; cv.classList.remove("is-dragging"); cv.releasePointerCapture?.(e.pointerId); this.cam.vel = clamp(this.cam.vel, -1.6, 1.6); };
    const leave = () => { this.cam.tx = 0; this.cam.ty = 0; };
    cv.addEventListener("pointerdown", down); cv.addEventListener("pointerup", end); cv.addEventListener("pointercancel", end); cv.addEventListener("pointerleave", leave);
    // v4 port: the base destroy() also removes these.
    this.unbindDrag = () => { cv.removeEventListener("pointerdown", down); cv.removeEventListener("pointerup", end); cv.removeEventListener("pointercancel", end); cv.removeEventListener("pointerleave", leave); };
  }
  destroy() { if (this.unbindDrag) this.unbindDrag(); super.destroy(); }

  /* ---- drawing ---- */
  ring(r, y, style, width, alpha, dash) {
    const x = this.ctx; x.beginPath();
    for (let s = 0; s <= 72; s++) { const a = (s / 72) * 2 * Math.PI, [px, py] = this.proj(r * Math.cos(a), y, r * Math.sin(a)); s ? x.lineTo(px, py) : x.moveTo(px, py); }
    x.strokeStyle = style; x.lineWidth = width; x.globalAlpha = alpha; x.setLineDash(dash || []); x.stroke(); x.setLineDash([]); x.globalAlpha = 1;
  }
  arch(i, lift) {                     // 3D quadratic arch from debtor to creditor, sampled and projected
    const [d, cr] = this.E[i], P = this.world[d], Q = this.world[cr];
    const mx = (P[0] + Q[0]) / 2 * 0.55, mz = (P[2] + Q[2]) / 2 * 0.55, my = S3.LIFT + lift;
    const pts = []; for (let s = 0; s <= 20; s++) { const t = s / 20, u = 1 - t;
      pts.push(this.proj(u * u * P[0] + 2 * u * t * mx + t * t * Q[0], u * u * P[1] + 2 * u * t * my + t * t * Q[1], u * u * P[2] + 2 * u * t * mz + t * t * Q[2])); }
    return pts;
  }
  polyline(pts, t0, t1, width, color, alpha) {
    if (alpha <= 0.005 || t1 <= t0) return; const x = this.ctx, n = pts.length - 1, a = Math.floor(t0 * n), b = Math.ceil(t1 * n);
    x.beginPath(); for (let s = a; s <= b; s++) { const [px, py] = pts[Math.min(n, s)]; s === a ? x.moveTo(px, py) : x.lineTo(px, py); }
    x.lineWidth = width; x.strokeStyle = color; x.globalAlpha = alpha; x.lineCap = "round"; x.lineJoin = "round"; x.stroke(); x.globalAlpha = 1;
  }
  at(pts, t) { const n = pts.length - 1, f = t * n, s = Math.min(n - 1, Math.floor(f)), u = f - s, A = pts[s], B = pts[s + 1]; return [A[0] + (B[0] - A[0]) * u, A[1] + (B[1] - A[1]) * u, A[2] + (B[2] - A[2]) * u]; }
  arrow(pts, t, w, color, alpha) {
    if (alpha <= 0.02) return; const x = this.ctx, a = this.at(pts, t), b = this.at(pts, Math.max(0, t - 0.05)), ang = Math.atan2(a[1] - b[1], a[0] - b[0]), s = (4 + w * 0.9) * a[2];
    x.save(); x.translate(a[0], a[1]); x.rotate(ang); x.beginPath(); x.moveTo(s, 0); x.lineTo(-s * 0.7, s * 0.62); x.lineTo(-s * 0.7, -s * 0.62); x.closePath(); x.fillStyle = color; x.globalAlpha = alpha; x.fill(); x.restore(); x.globalAlpha = 1;
  }
  orb(px, py, rad, i, p, tint, mixT, dim, time, hot) {
    const x = this.ctx, out = this.outcome[i], v = this.r.net[i];
    x.globalAlpha = dim;
    let g;
    if (this.flat) g = tint ? S3.mixHex("#e8e8ec", tint, mixT * 0.6) : "#e8e8ec";   // landing story: solid faces, no gradient
    else { g = x.createRadialGradient(px - rad * 0.35, py - rad * 0.42, rad * 0.08, px, py, rad);
      g.addColorStop(0, tint ? S3.mixHex("#ffffff", tint, mixT * 0.3) : "#ffffff"); g.addColorStop(1, tint ? S3.mixHex("#c9d2ff", tint, mixT) : "#c9d2ff"); }
    x.beginPath(); x.arc(px, py, rad, 0, 6.2832); x.fillStyle = g; x.fill();
    if (hot) { x.beginPath(); x.arc(px, py, rad + 4, 0, 6.2832); x.lineWidth = 2.5; x.strokeStyle = "#c8f53c"; x.stroke(); }
    // eyes look at the pointer (or at the contract), blink now and then; happy when settled, cross when covered from stake
    const look = this.cam.tx || this.cam.ty ? [this.cx + this.cam.tx * this.W * 0.5, this.cy + this.cam.ty * this.H * 0.5] : this.proj(0, 0.3, 0);
    const dx = look[0] - px, dy = look[1] - py, dl = Math.hypot(dx, dy) || 1, lx = (dx / dl) * rad * 0.17, ly = (dy / dl) * rad * 0.17;
    const happy = p > 4.5 && v !== 0 && (out === "paid" || out === "claimed"), sad = p > 3.75 && out === "defaulted", blink = !this.reduced && (time * 0.23 + i * 0.137) % 1 < 0.03;
    x.fillStyle = x.strokeStyle = "#0e1330"; x.lineWidth = Math.max(1.3, rad * 0.12); x.lineCap = "round";
    for (const sx of [-1, 1]) { const ex = px + lx + sx * rad * 0.3, ey = py + ly - rad * 0.06; x.beginPath();
      if (happy) { x.arc(ex, ey + rad * 0.1, rad * 0.15, Math.PI * 1.15, Math.PI * 1.85); x.stroke(); }
      else if (sad) { x.moveTo(ex + sx * rad * 0.14, ey + rad * 0.08); x.lineTo(ex - sx * rad * 0.14, ey - rad * 0.08); x.stroke(); }
      else { x.ellipse(ex, ey, rad * 0.1, blink ? rad * 0.02 : rad * 0.17, 0, 0, 6.2832); x.fill(); } }
    // the mouth: a small smile, open when settled, a frown when covered from stake
    const mx = px + lx * 0.6, my = py + ly * 0.6 + rad * 0.3; x.beginPath();
    if (happy) { x.arc(mx, my - rad * 0.06, rad * 0.15, 0, Math.PI); x.closePath(); x.fill(); }
    else if (sad) { x.arc(mx, my + rad * 0.08, rad * 0.13, Math.PI * 1.22, Math.PI * 1.78); x.stroke(); }
    else { x.arc(mx, my - rad * 0.14, rad * 0.14, Math.PI * 0.22, Math.PI * 0.78); x.stroke(); }
    x.globalAlpha = 1;
  }

  draw(p, time) {
    this.ensure();
    const x = this.ctx, c = this.c, small = this.W < 520, collapse = easeIO(clamp(p - 2)), w = (a) => Math.max(0.8, Math.min(6.5, (a * this.ak) / 70));
    x.clearRect(0, 0, this.W, this.H);

    // the floor: guide rings, the circle of epoch 8, faint spokes
    this.ring(1.42, 0, c.rule, 1, 0.5, [2, 6]);
    this.ring(0.55, 0, c.rule, 1, 0.45);
    let g = "rgba(255,255,255,0.22)";
    if (!this.flat) { g = x.createLinearGradient(this.cx - this.F, 0, this.cx + this.F, 0); g.addColorStop(0, "rgba(169,203,255,0.7)"); g.addColorStop(0.5, "rgba(255,255,255,0.25)"); g.addColorStop(1, "rgba(47,91,255,0.8)"); }
    this.ring(1, 0, g, this.flat ? 1 : 1.6, 0.9);
    this.world.forEach(([wx, , wz]) => { const a = this.proj(wx * 0.62, 0, wz * 0.62), b = this.proj(wx * 0.95, 0, wz * 0.95); x.beginPath(); x.moveTo(a[0], a[1]); x.lineTo(b[0], b[1]); x.strokeStyle = c.rule; x.globalAlpha = 0.35; x.lineWidth = 1; x.stroke(); x.globalAlpha = 1; });

    // agents' shadows on the floor
    this.world.forEach(([wx, , wz]) => { const [sx, sy, k] = this.proj(wx, 0, wz), r = (small ? 8 : 11) * k * this.rs; x.beginPath(); x.ellipse(sx, sy, r * 0.95, r * 0.34, 0, 0, 6.2832); x.fillStyle = "rgba(0,0,0,0.5)"; x.fill(); });

    // net lines along the floor to the contract, and the payments flowing on them
    if (collapse > 0) {
      const hub = 0.12;
      this.r.net.forEach((v, i) => {
        if (v === 0) return;
        const [wx, , wz] = this.world[i], out = this.outcome[i], q = this.payOf(i, p), dim = this.hover == null || this.hover === i ? 1 : 0.14;
        const A = this.proj(wx * 0.94, 0.02, wz * 0.94), B = this.proj(wx * hub, 0.02, wz * hub), from = v < 0 ? A : B, to = v < 0 ? B : A;
        const col = out === "defaulted" ? c.bad : v < 0 ? c.due : out === "claimed" ? c.settled : c.claim, lw = Math.max(1.2, Math.sqrt(Math.abs(v)) * 0.42 * this.vk) * ((A[2] + B[2]) / 2);
        const seg = (t0, t1, alpha, dash, width) => { x.beginPath(); x.moveTo(from[0] + (to[0] - from[0]) * t0, from[1] + (to[1] - from[1]) * t0); x.lineTo(from[0] + (to[0] - from[0]) * t1, from[1] + (to[1] - from[1]) * t1);
          x.lineWidth = width; x.strokeStyle = col; x.globalAlpha = alpha * dim; x.setLineDash(dash); x.lineCap = "butt"; x.stroke(); x.setLineDash([]); x.globalAlpha = 1; };
        seg(0, 1, 0.38 * collapse, [2, 5], 1.2);
        if (q > 0) seg(0, q, 0.95, out === "claimable" ? [5, 4] : [], lw);
        if (q > 0.02 && !this.reduced && out !== "claimable") for (let k = 0; k < 3; k++) { const t = ((time * 0.55 + k / 3 + i * 0.13) % 1) * q;
          x.beginPath(); x.arc(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, 2.4 * from[2], 0, 6.2832); x.fillStyle = col; x.globalAlpha = 0.9 * dim; x.fill(); x.globalAlpha = 1; }
      });
    }

    // the circle contract: one glowing sphere in the middle (no light pillar, owner 2026-11-11), brightest once everything nets into it
    const core = this.proj(0, 0.3, 0), cr = 0.1 * this.F * core[2] * (0.9 + 0.15 * collapse);
    if (!this.flat) {   // the landing story (flat) draws its contract later, as a glass coin over the debts
      const halo = x.createRadialGradient(core[0], core[1], 0, core[0], core[1], cr * 3.2); halo.addColorStop(0, `rgba(91,227,160,${0.18 + 0.3 * collapse})`); halo.addColorStop(1, "rgba(91,227,160,0)");
      x.fillStyle = halo; x.beginPath(); x.arc(core[0], core[1], cr * 3.2, 0, 6.2832); x.fill();
      const cg = x.createRadialGradient(core[0] - cr * 0.3, core[1] - cr * 0.35, cr * 0.1, core[0], core[1], cr); cg.addColorStop(0, "#ffffff"); cg.addColorStop(1, S3.mixHex("#a9cbff", "#5be3a0", collapse));
      x.beginPath(); x.arc(core[0], core[1], cr, 0, 6.2832); x.fillStyle = cg; x.fill();
    }
    x.fillStyle = c.ink2; x.font = `500 ${small ? 10 : 11}px ${this.mono}`; x.textAlign = "center"; x.textBaseline = "middle"; if (!this.flat) x.fillText("circle contract", core[0], core[1] + cr + 16);

    // debts arch between the agents (far ones first)
    if (p < 3) {
      const lift = (a) => (0.16 + Math.min(0.42, (a * this.ak) / 950)) * (1 - collapse), tEnd = 0.93;
      const arches = this.E.map((e, i) => { const pts = this.arch(i, lift(e[2])); return { i, pts, z: pts[10][3] }; }).sort((a, b) => a.z - b.z);
      arches.forEach(({ i, pts }) => {
        const e = this.E[i], rv = this.reveal(i, p); if (rv <= 0) return;
        const amt = this.amountOf(i, p), dim = this.touches(i) ? 1 : 0.1, fade = (1 - collapse) * dim, k = pts[10][2], f = this.fog(k);
        let glow = 0; this.cycles.forEach((cy, kk) => { if (cy.edgeIdx.includes(i)) glow = Math.max(glow, this.glowOf(kk, p)); });
        const end = tEnd * (p < 1 ? rv : 1);
        if (amt > 0.5) { this.polyline(pts, 0, end, w(amt) * k, c.ink, 0.58 * fade * f); if (p >= 1 || rv > 0.98) this.arrow(pts, end, w(amt), c.ink, 0.8 * fade * f); }
        if (glow > 0) { this.polyline(pts, 0, tEnd, (w(e[2]) + 2.5) * k, c.settled, 0.85 * glow * dim); this.arrow(pts, tEnd, w(e[2]) + 2, c.settled, glow * dim); }
        if (p < 1 && rv > 0 && rv < 1 && !this.reduced) { const [bx, by, bk] = this.at(pts, end); x.beginPath(); x.arc(bx, by, 3.4 * bk, 0, 6.2832); x.fillStyle = "#dbe7ff"; x.globalAlpha = dim; x.fill(); x.globalAlpha = 1; }
      });
      if (!this.reduced) this.cycles.forEach((cy, kk) => { const gl = this.glowOf(kk, p); if (gl <= 0) return;
        const u = (((p - 1) * this.K - kk) * 2.2) % 1, pos = u * cy.edgeIdx.length, idx = Math.floor(pos), i = cy.edgeIdx[idx];
        const [bx, by, bk] = this.at(this.arch(i, lift(this.E[i][2])), (pos - idx) * tEnd); x.beginPath(); x.arc(bx, by, 4.6 * bk, 0, 6.2832); x.fillStyle = "#c8f53c"; x.globalAlpha = gl; x.fill(); x.globalAlpha = 1; });
    }

    if (this.flat) {   // the contract as a glass NEAR coin, over the debts so they show through it
      nearCoin(x, core[0], core[1], cr * 1.45, this.reduced ? 0.6 : time);
      x.fillStyle = c.ink2; x.font = `500 ${small ? 10 : 11}px ${this.mono}`; x.textAlign = "center"; x.textBaseline = "middle";
      x.fillText("circle contract", core[0], core[1] + cr * 1.45 + 20);
    }

    // agents: orbs with eyes, sorted far to near, labels outside the circle
    const order = this.world.map((wp, i) => { const s = this.proj(wp[0], wp[1], wp[2]); this.pos[i] = [s[0], s[1], wp[3]]; return { i, s }; }).sort((a, b) => a.s[3] - b.s[3]);
    order.forEach(({ i, s: [px, py, k] }) => {
      const v = this.r.net[i], out = this.outcome[i], hot = this.hover === i;
      const dim = this.hover == null || hot || this.E.some((e) => (e[0] === this.hover && e[1] === i) || (e[1] === this.hover && e[0] === i)) ? 1 : 0.3;
      const col = v === 0 ? null : out === "defaulted" ? c.bad : v < 0 ? c.due : out === "claimed" ? c.settled : c.claim;
      const paid = p > 3 ? this.payOf(i, p) : 0, mixT = col ? collapse * (0.4 + 0.6 * paid) : 0;
      const rad = ((small ? 9 : 12) + Math.sqrt(Math.abs(v)) * 0.45 * this.vk * collapse) * k * this.rs * (hot ? 1.12 : 1);
      this.orb(px, py, rad, i, p, col, mixT, dim * this.fog(k) ** 0.5, time, hot);
      const [ox, oy] = [px - this.cx, py - (this.cy + 0.12 * this.F)], ol = Math.hypot(ox, oy) || 1, ly = py + (oy / ol) * (rad + (small ? 12 : 16));
      const lx = clamp(px + (ox / ol) * (rad + (small ? 14 : 20)), small ? 34 : 44, this.W - (small ? 34 : 44));   // keep "200 −1.80" inside the canvas
      if (this.showLabels) {                          // a crowded ring has no labels: the tip names the agent under the pointer
        x.globalAlpha = dim * this.fog(k); x.textAlign = "center"; x.textBaseline = "middle";
        x.fillStyle = c.ink; x.font = `500 ${small ? 9.5 : 11}px ${this.mono}`; x.fillText(labelOf(i, this.names), lx, ly - (collapse > 0.5 ? 7 : 0));
        if (collapse > 0.5) { x.globalAlpha = dim * (collapse - 0.5) * 2 * this.fog(k); x.fillStyle = col || c.ink3; x.font = `600 ${small ? 9.5 : 11}px ${this.font}`;
          x.fillText(p > 4.6 ? (STATUS[out] || STATUS.flat)[1] + " " + (v === 0 ? "flat" : signed(v)) : v === 0 ? "flat" : signed(v), lx, ly + 7); }
      }
      x.globalAlpha = 1;
    });
  }
}

/* ---- the landing's contract: a glass coin with the NEAR mark, drawn in 2.5D and turning a little ---- */
// the NEAR "N" mark (near.org brand asset), in a 93 x 92 box
const NEAR_N = typeof Path2D === "undefined" ? null : new Path2D("M72.2 4.6 53.4 32.5c-1.3 1.9 1.2 4.2 3 2.6l18.5-16.1c.5-.4 1.2-.1 1.2.6v50.3c0 .7-.9 1-1.3.5l-56-67C17 1.2 14.4 0 11.7 0h-2C4.8 0 0 4.8 0 10.6v70.8C0 87.2 4.8 92 10.6 92c3.7 0 7.1-1.9 9.1-5.1l18.8-27.9c1.3-1.9-1.2-4.2-3-2.6l-18.5 16c-.5.4-1.2.1-1.2-.6V21.9c0-.7.9-1 1.3-.5l56 67c1.8 2.2 4.5 3.4 7.2 3.4h2c5.8 0 10.6-4.8 10.6-10.6V10.6C92.9 4.8 88.1 0 82.3 0c-3.7 0-7.2 1.9-10.1 4.6Z");
function nearCoin(x, cx, cy, r, time) {
  const s = 0.86 + 0.1 * Math.sin(time * 0.7);    // the face narrows and widens: the coin turns about its vertical axis
  const rx = r * s, t = r * 0.14;                  // half width of the face, thickness of the rim
  const face = () => { x.beginPath(); x.ellipse(cx, cy, rx, r, 0, 0, 6.2832); };
  x.save();
  // a soft shadow on the floor
  x.beginPath(); x.ellipse(cx - t * 0.4, cy + r * 1.3, r * 0.72, r * 0.12, 0, 0, 6.2832); x.fillStyle = "rgba(0,0,0,0.45)"; x.fill();
  // the glass rim: the face pushed back to the left, frosted, with fine reeding
  x.beginPath(); x.ellipse(cx - t, cy + t * 0.12, rx, r, 0, 1.5708, 4.7124); x.lineTo(cx, cy - r); x.ellipse(cx, cy, rx, r, 0, 4.7124, 1.5708, true); x.closePath();
  x.fillStyle = "rgba(220,224,235,0.22)"; x.fill();
  x.strokeStyle = "rgba(255,255,255,0.18)"; x.lineWidth = 1;
  for (let a = 1.7; a < 4.6; a += 0.11) { const ex = cx + rx * Math.cos(a), ey = cy + r * Math.sin(a); x.beginPath(); x.moveTo(ex, ey); x.lineTo(ex - t, ey + t * 0.12); x.stroke(); }
  // the glass face: mostly clear, frosted at the top left
  face(); const g = x.createLinearGradient(cx - rx, cy - r, cx + rx, cy + r);
  g.addColorStop(0, "rgba(255,255,255,0.34)"); g.addColorStop(0.5, "rgba(255,255,255,0.1)"); g.addColorStop(1, "rgba(255,255,255,0.05)");
  x.fillStyle = g; x.fill();
  // a diagonal sheen, clipped to the face
  x.save(); face(); x.clip();
  x.translate(cx, cy); x.rotate(-0.6 + 0.15 * Math.sin(time * 0.7));
  const sh = x.createLinearGradient(-r, 0, r, 0);
  sh.addColorStop(0.32, "rgba(255,255,255,0)"); sh.addColorStop(0.42, "rgba(255,255,255,0.32)"); sh.addColorStop(0.47, "rgba(255,255,255,0.08)"); sh.addColorStop(0.55, "rgba(255,255,255,0.18)"); sh.addColorStop(0.62, "rgba(255,255,255,0)");
  x.fillStyle = sh; x.fillRect(-r * 1.2, -r * 1.2, r * 2.4, r * 2.4);
  x.restore();
  // a bright edge and an inner ring, like the polished lip of a glass disc
  face(); x.strokeStyle = "rgba(255,255,255,0.75)"; x.lineWidth = 1.4; x.stroke();
  x.beginPath(); x.ellipse(cx, cy, rx * 0.84, r * 0.84, 0, 0, 6.2832); x.strokeStyle = "rgba(255,255,255,0.22)"; x.lineWidth = 1; x.stroke();
  // the NEAR mark, white, with a faint glow
  if (NEAR_N) {
    const k = (r * 0.78) / 92;
    x.translate(cx, cy); x.scale(s, 1); x.scale(k, k); x.translate(-46.5, -46);
    x.shadowColor = "rgba(255,255,255,0.55)"; x.shadowBlur = 14;
    x.fillStyle = "rgba(255,255,255,0.94)"; x.fill(NEAR_N);
  }
  x.restore();
}

/* ---- HUD + scroll wiring (same contract as scene.js mountScene / mountStory) ---- */
function mountStory3D(story, opts = {}) {
  const root = story.querySelector("[data-scene3d]"), scene = new EpochScene3D(root);
  scene.flat = !!opts.flat;   // the landing's story draws without gradients or glow
  if (scene.flat) scene.resize();
  scene.bindDrag();
  const chapters = [...root.querySelectorAll("[data-chapter]")], steps = [...story.querySelectorAll(".chapter")];
  hud(scene, root);
  const jumps = chapters.map((b, k) => {
    const jump = () => {
      const top = story.getBoundingClientRect().top + scrollY, span = story.offsetHeight - innerHeight;
      scrollTo({ top: top + (span * (k + 0.96)) / 5, behavior: scene.reduced ? "auto" : "smooth" });
    };
    b.addEventListener("click", jump);
    return [b, jump];
  });
  let ticking = false;
  const update = () => { ticking = false;
    const b = story.getBoundingClientRect(), span = b.height - innerHeight, t = clamp(-b.top / span);
    scene.setTarget(t * 5);
    steps.forEach((st, k) => st.classList.toggle("is-on", Math.min(4, Math.floor(t * 5 + 1e-6)) === k)); };
  const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener("scroll", onScroll, { passive: true });
  addEventListener("resize", update); update();
  // v4 port: destroy() also takes off the window listeners and the chapter buttons' clicks, so React can unmount and remount the story.
  const baseDestroy = scene.destroy.bind(scene);
  scene.destroy = () => {
    removeEventListener("scroll", onScroll); removeEventListener("resize", update);
    for (const [b, jump] of jumps) b.removeEventListener("click", jump);
    baseDestroy();
  };
  return scene;
}

/* ---- v4 app: the 3D scene on its own (no scroll story), driven by the play button, the range input and the chapter buttons inside `root`.
   opts: { data, subMoved } as in scene.js mountScene. destroy() undoes the drag and the controls. ---- */
function mountScene3D(root, opts = {}) {
  const scene = new EpochScene3D(root, opts.data);
  scene.bindDrag();
  return mountScene(root, { ...opts, scene });
}

export { EpochScene3D, mountStory3D, mountScene3D };
