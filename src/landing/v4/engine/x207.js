/* x207 draft — shared data and behaviour.
   Epoch 8 data is real: copied on 2026-11-10 from
   https://x207.boxd.sh/x207/circles/agents-main/epochs/8 and /epochs/8/obligations.
   Amounts are in hundredths of a credit (400 = 4.00). */

const X207 = {
  circle: "agents-main",
  contract: "x207-v013.testnet",
  codeHash: "DTw5rUUdJSbWjD361MmBxKW4nm4ETnNkex63mfUCjsjh",
  api: "https://x207.boxd.sh/x207/circles/agents-main",
  epoch: 8,
  committedAt: "2026-11-04T08:35:13Z",
  paymentDeadline: "2026-11-04T08:50:13Z",
  // [debtor, creditor, amount, cleared by the solver]
  edges: [
    [0,1,400,285],[1,2,250,250],[1,5,95,35],[2,0,300,250],[2,10,130,0],[3,4,120,120],
    [4,3,75,65],[4,12,65,65],[5,6,500,215],[6,7,350,215],[6,13,205,0],[7,8,425,180],
    [7,14,80,35],[8,5,180,180],[8,9,115,0],[9,10,240,65],[9,11,60,0],[10,4,40,10],
    [10,11,110,55],[11,3,55,55],[12,9,90,65],[13,12,170,0],[14,0,35,35],[14,13,45,0]
  ],
  // settlement outcome per member, as the read API reports it
  outcome: ["paid","claimable","paid","claimable","claimable","paid","defaulted","paid",
            "claimed","paid","claimed","claimable","claimed","claimable","flat"],
  // figures the API reports, used to check the recomputation below
  reported: { gross: 4135, cleared: 2180, net: 775, transfers: 14 }
};

const fmt = (h) => (Math.abs(h) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const signed = (h) => (h === 0 ? "0.00" : (h < 0 ? "−" : "+") + fmt(h));
const name = (i) => "m" + String(i).padStart(2, "0");
/* v4 app: the label of member i. `names` comes with injected data; without it the member is m00, m01, ... like the epoch 8 snapshot.
   (`name` keeps one argument because the landing passes it straight to Array.map.) */
const labelOf = (i, names) => (names && names[i] != null ? names[i] : name(i));

/* v4 app: how many members a data object has: the longest of its outcome list, its names and the highest index an edge points at. 15 for the epoch 8 snapshot. */
function memberCount(data = X207) {
  let n = Math.max(data.outcome ? data.outcome.length : 0, data.names ? data.names.length : 0);
  for (const e of data.edges) n = Math.max(n, e[0] + 1, e[1] + 1);
  return n;
}

/* Recompute everything from the raw edges, in the browser. Without an argument it is the epoch 8 snapshot (24 edges, 15 members). */
function recompute(data = X207) {
  const n = memberCount(data), owes = Array(n).fill(0), owed = Array(n).fill(0);
  let gross = 0, cleared = 0;
  for (const [d, c, a, cl] of data.edges) { owes[d] += a; owed[c] += a; gross += a; cleared += cl; }
  const net = owes.map((o, i) => owed[i] - o);
  const payIn = net.reduce((s, v) => s + (v < 0 ? -v : 0), 0);
  const payOut = net.reduce((s, v) => s + (v > 0 ? v : 0), 0);
  return { owes, owed, net, gross, cleared, payIn, payOut, transfers: net.filter((v) => v !== 0).length, sum: net.reduce((s, v) => s + v, 0) };
}

const STATUS = {
  paid:      ["s200", "200", "Paid in"],
  claimed:   ["s200", "200", "Claimed"],
  claimable: ["s202", "202", "Ready to claim"],
  due:       ["s402", "402", "Payment due"],      // v4 app: unpaid, still inside the payment window
  defaulted: ["s409", "409", "Covered from stake"],
  flat:      ["s000", "200", "Nothing to settle"]
};

/* ---------- ledger ---------- */
function renderLedger(tbody, tfoot) {
  const r = recompute();
  tbody.innerHTML = r.net.map((v, i) => {
    const [cls, code, label] = STATUS[X207.outcome[i]];
    return `<tr data-m="${i}">
      <td class="acct">${name(i)}<small>.x207-v013-aux.testnet</small></td>
      <td class="r">${fmt(r.owes[i])}</td>
      <td class="r">${fmt(r.owed[i])}</td>
      <td class="r ${v < 0 ? "" : "zero"}">${v < 0 ? fmt(v) : "–"}</td>
      <td class="r ${v > 0 ? "" : "zero"}">${v > 0 ? fmt(v) : "–"}</td>
      <td><span class="code ${cls}"><b>${code}</b>${label}</span></td></tr>`;
  }).join("");
  tfoot.innerHTML = `<tr><td>15 members</td><td class="r">${fmt(r.gross)}</td><td class="r">${fmt(r.gross)}</td>
    <td class="r">${fmt(r.payIn)}</td><td class="r">${fmt(r.payOut)}</td><td>${r.transfers} settlement movements</td></tr>`;
}

/* ---------- self-check ---------- */
function renderChecks(ul) {
  const r = recompute(), R = X207.reported;
  const rows = [
    ["Gross obligations, summed from 24 vouchers", r.gross, R.gross, fmt],
    ["Net owed by the six debtors", r.payIn, R.net, fmt],
    ["Net due to the eight creditors", r.payOut, R.net, fmt],
    ["Cancelled in cycles by the solver", r.cleared, R.cleared, fmt],
    ["All net positions sum to zero", r.sum, 0, fmt],
    ["Members with something to settle", r.transfers, R.transfers, (x) => String(x)]
  ];
  ul.innerHTML = rows.map(([label, got, want, f]) =>
    `<li><span class="${got === want ? "ok" : "bad"}" aria-hidden="true">${got === want ? "✓" : "✗"}</span>
      <span>${label}<span class="sr">: ${got === want ? "matches" : "does not match"} the API</span></span><span>${f(got)}</span></li>`).join("");
}

/* ---------- graph ---------- */
const NS = "http://www.w3.org/2000/svg";
const el = (tag, attrs, text) => { const e = document.createElementNS(NS, tag); for (const k in attrs) e.setAttribute(k, attrs[k]); if (text != null) e.textContent = text; return e; };

function renderGraph(svg, mode) {
  const W = 560, H = 520, cx = W / 2, cy = H / 2, R = 200, n = 15, r = recompute();
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.replaceChildren();
  const pos = Array.from({ length: n }, (_, i) => { const a = (i / n) * 2 * Math.PI - Math.PI / 2; return [cx + R * Math.cos(a), cy + R * Math.sin(a)]; });
  const w = (a) => Math.max(1, Math.min(7, a / 70));
  // curve from debtor to creditor, stopping short of the creditor so the arrowhead stays visible
  const curve = (p, q, bend) => {
    const mx = (p[0] + q[0]) / 2, my = (p[1] + q[1]) / 2; const qx = mx + (cx - mx) * bend, qy = my + (cy - my) * bend;
    const dx = qx - q[0], dy = qy - q[1], len = Math.hypot(dx, dy) || 1, ex = q[0] + (dx / len) * 13, ey = q[1] + (dy / len) * 13;
    return `M${p[0]},${p[1]} Q${qx},${qy} ${ex},${ey}`;
  };
  const defs = el("defs", {});
  const mk = (id, cls) => { const m = el("marker", { id, viewBox: "0 0 10 10", refX: 5, refY: 5, markerWidth: 9, markerHeight: 9, orient: "auto", markerUnits: "userSpaceOnUse" }); m.append(el("path", { d: "M0,1 L9,5 L0,9 z", class: cls })); return m; };
  defs.append(mk("arr", "g-arrow"), mk("arr-c", "g-arrow is-cleared"));
  const edgesG = el("g", {});
  svg.append(defs, edgesG);

  if (mode === "net") {
    r.net.forEach((v, i) => {
      if (v === 0) return;
      const cls = X207.outcome[i] === "defaulted" ? "g-default" : v < 0 ? "g-pay" : "g-claim";
      const p = el("path", { d: `M${pos[i][0]},${pos[i][1]} L${cx},${cy}`, class: `g-edge ${cls}`, "stroke-width": w(Math.abs(v)) * 2.2, "data-a": i, "data-b": i });
      p.append(el("title", {}, `${name(i)} ${v < 0 ? "pays in" : "is paid"} ${fmt(v)}`));
      edgesG.append(p);
    });
    const hub = el("g", { class: "g-hub" });
    hub.append(el("rect", { x: cx - 52, y: cy - 15, width: 104, height: 30 }), el("text", { x: cx, y: cy + 4, "text-anchor": "middle" }, "circle contract"));
    svg.append(hub);
  } else {
    X207.edges.forEach(([d, c, a, cl]) => {
      const draw = (amount, cleared) => {
        if (amount <= 0) return;
        const p = el("path", { d: curve(pos[d], pos[c], 0.55), class: "g-edge" + (cleared ? " is-cleared" : ""), "stroke-width": w(amount), "data-a": d, "data-b": c, "marker-end": cleared ? "url(#arr-c)" : "url(#arr)" });
        p.append(el("title", {}, `${name(d)} owes ${name(c)} ${fmt(a)}${cl ? `, ${fmt(cl)} cancelled in a cycle` : ""}`));
        edgesG.append(p);
      };
      if (mode === "gross") draw(a, false);
      else { draw(cl, true); draw(a - cl, false); }
    });
  }

  pos.forEach(([x, y], i) => {
    const g = el("g", { class: "g-node", "data-m": i, tabindex: 0, role: "img", "aria-label": `${name(i)}, net ${signed(r.net[i])}` });
    const lx = cx + (R + 30) * Math.cos((i / n) * 2 * Math.PI - Math.PI / 2), ly = cy + (R + 30) * Math.sin((i / n) * 2 * Math.PI - Math.PI / 2);
    g.append(el("circle", { cx: x, cy: y, r: 7 }), el("text", { x: lx, y: ly + 4, "text-anchor": "middle" }, name(i)));
    svg.append(g);
  });
}

function wireHover(svg, tbody) {
  const set = (m) => {
    svg.querySelectorAll(".g-edge").forEach((e) => { const on = m == null || e.dataset.a == m || e.dataset.b == m; e.classList.toggle("is-dim", !on); e.classList.toggle("is-hot", m != null && on); });
    tbody && tbody.querySelectorAll("tr").forEach((tr) => tr.classList.toggle("is-hot", m != null && tr.dataset.m == m));
  };
  const over = (e) => { const t = e.target.closest("[data-m]"); set(t ? t.dataset.m : null); };
  svg.addEventListener("pointerover", over); svg.addEventListener("focusin", over);
  svg.addEventListener("pointerleave", () => set(null)); svg.addEventListener("focusout", () => set(null));
  if (tbody) { tbody.addEventListener("pointerover", over); tbody.addEventListener("pointerleave", () => set(null)); }
}

const GRAPH_NOTES = {
  gross: ["Before anything is netted", "Each line is one seller’s cumulative voucher from one buyer. Paid one by one, this epoch would need 24 transfers carrying 41.35.", [["Vouchers", "24"], ["Owed in total", "41.35"]]],
  cycles: ["After the solver removes cycles", "Dashed lines are debts that go round in a loop and cancel. Any solver may propose this; the contract checks it. It shrinks the record. It does not change what anyone pays.", [["Cancelled in cycles", "21.80"], ["Left on the record", "19.55"]]],
  net: ["What actually moves", "Each member settles one net amount with the circle contract. Six pay in, eight are paid, one is flat. One debtor did not pay and 0.55 came out of its stake.", [["Paid in", "7.75"], ["Paid out", "7.75"], ["Movements", "14"]]]
};

function initGraph(root) {
  const svg = root.querySelector("svg"), note = root.querySelector(".graphnote"), tbody = document.querySelector("#ledger tbody");
  const show = (mode) => {
    renderGraph(svg, mode);
    root.querySelectorAll(".seg button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
    if (note) { const [h, p, rows] = GRAPH_NOTES[mode]; note.innerHTML = `<h3>${h}</h3><p>${p}</p><dl>${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join("")}</dl>`; }
  };
  root.querySelectorAll(".seg button").forEach((b) => b.addEventListener("click", () => show(b.dataset.mode)));
  wireHover(svg, tbody);
  show(root.dataset.start || "gross");
}

/* ---------- draft controls: theme and type direction ---------- */
function initDraftBar() {
  const root = document.documentElement;
  const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
  const apply = (k, v) => { root.dataset[k] = v; write("x207draft-" + k, v); document.querySelectorAll(`.draftbar [data-${k}]`).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset[k] === v))); };
  const bar = document.createElement("div");
  bar.className = "draftbar";
  bar.innerHTML = `<b>Draft controls</b>
    <span class="seg" role="group" aria-label="Theme"><button data-theme="light">Light</button><button data-theme="dark">Dark</button></span>
    <span class="seg" role="group" aria-label="Type direction"><button data-type="a" title="IBM Plex Sans + Plex Mono">A Plex</button><button data-type="b" title="Geist + Geist Mono">B Geist</button><button data-type="c" title="Newsreader display + Geist">C Serif</button></span>`;
  document.body.append(bar);
  bar.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; if (b.dataset.theme) apply("theme", b.dataset.theme); if (b.dataset.type) apply("type", b.dataset.type); });
  apply("theme", read("x207draft-theme", matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  apply("type", read("x207draft-type", "a"));
}

// v4 landing (FE port): an ES module; the page mounts what it needs (no auto-run on load).
export { X207, fmt, signed, name, labelOf, memberCount, recompute, STATUS, renderLedger, renderChecks, el, initGraph };
