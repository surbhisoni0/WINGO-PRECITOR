"use strict";
/* WinGo Analysis Platform - dashboard. All API text is rendered with textContent (never innerHTML). */
const $ = (s, r = document) => r.querySelector(s);
const NS = "http://www.w3.org/2000/svg";
const NAMES = { CumFreq: "Frequency", Recent50: "Recent pattern (50)", Markov1: "Transition (order 1)", Markov2: "Transition (order 2)",
  LogReg: "ML · Logistic regression", RandForest: "ML · Random forest", HistGB: "ML · Gradient boosting", Consensus: "Ensemble (unweighted consensus)" };
const METRICS = [["bs", "Big / Small"], ["color", "Colour"], ["top1", "Number (Top-1)"], ["top3", "Number (Top-3)"]];
const LINE_COLORS = { top1: "#2dd4bf", top3: "#5aa2ff", bs: "#f5b84b", color: "#b58cff" };
const COLOR_DETAIL = ["red+violet", "green", "red", "green", "red", "green+violet", "red", "green", "red", "green"];

function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k.startsWith("on")) e[k] = v; else e.setAttribute(k, v === true ? "" : v);
  }
  for (const c of kids.flat()) if (c != null) e.append(c.nodeType ? c : document.createTextNode(String(c)));
  return e;
}
function svg(tag, attrs = {}, text) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  if (text != null) e.textContent = text;
  return e;
}
const ballClass = n => (n === 0 ? "rv" : n === 5 ? "gv" : [1, 3, 7, 9].includes(n) ? "g" : "r");
const ball = (n, cls = "") => el("span", { class: `ball ${ballClass(n)} ${cls}`.trim(), title: `${n} · ${COLOR_DETAIL[n]} · ${n >= 5 ? "Big" : "Small"}` }, n);
const pct = x => (x == null ? "—" : (100 * x).toFixed(1) + "%");
const pp = x => (x >= 0 ? "+" : "") + (100 * x).toFixed(1);
const clear = e => { e.replaceChildren(); return e; };
const setBody = (card, ...kids) => { const h = card.querySelector("h2"); card.replaceChildren(h, ...kids.flat()); };

let API_KEY = () => $("#key").value.trim();
async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  if (opts.method === "POST" && API_KEY()) headers["X-API-Key"] = API_KEY();
  const r = await fetch(path, { ...opts, headers });
  let body = null;
  try { body = await r.json(); } catch (_) { /* non-JSON */ }
  if (!r.ok) {
    const d = body && (body.error || body.detail);
    throw new Error(Array.isArray(d) ? d.map(x => x.msg).join("; ") : d || `HTTP ${r.status}`);
  }
  return body;
}

/* ---------------------------------------------------------------- charts */
function barChart(host, labels, values, { expected = null, fmt = pct, colors = null, max = null } = {}) {
  const W = 600, H = 220, L = 34, B = 26, T = 12, n = values.length;
  const top = max || Math.max(...values, expected || 0) * 1.18 || 1;
  const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img" });
  const bw = (W - L) / n, y = v => T + (H - T - B) * (1 - v / top);
  [0, .5, 1].forEach(f => { s.append(svg("line", { x1: L, x2: W, y1: y(top * f), y2: y(top * f), stroke: "#1f2c4d" }), svg("text", { x: 2, y: y(top * f) + 3 }, fmt(top * f))); });
  values.forEach((v, i) => {
    s.append(svg("rect", { x: L + i * bw + bw * .18, y: y(v), width: bw * .64, height: Math.max(0, H - B - y(v)), rx: 4, fill: colors ? colors[i] : "#2dd4bf" }));
    s.append(svg("text", { x: L + i * bw + bw / 2, y: H - 9, "text-anchor": "middle", class: "lbl" }, labels[i]));
    s.append(svg("text", { x: L + i * bw + bw / 2, y: y(v) - 4, "text-anchor": "middle" }, fmt(v)));
  });
  if (expected != null) s.append(svg("line", { x1: L, x2: W, y1: y(expected), y2: y(expected), stroke: "#f5b84b", "stroke-dasharray": "5 4" }));
  clear(host).append(s);
}
function lineChart(host, series, emptyMsg) {
  const pts = series.flatMap(s => s.points);
  if (!pts.length) { clear(host).append(el("p", { class: "muted" }, emptyMsg)); return; }
  const W = 600, H = 230, L = 40, B = 20, T = 10, m = Math.max(0.02, ...pts.map(Math.abs)) * 1.15;
  const s = svg("svg", { viewBox: `0 0 ${W} ${H}`, width: "100%", role: "img" });
  const y = v => T + (H - T - B) * (1 - (v + m) / (2 * m));
  [-m, 0, m].forEach(v => s.append(svg("line", { x1: L, x2: W, y1: y(v), y2: y(v), stroke: v === 0 ? "#f5b84b" : "#1f2c4d", "stroke-dasharray": v === 0 ? "5 4" : "" }), svg("text", { x: 2, y: y(v) + 3 }, pp(v))));
  series.forEach(sr => {
    const n = sr.points.length, x = i => L + (W - L) * (n === 1 ? .5 : i / (n - 1));
    s.append(svg("polyline", { fill: "none", stroke: sr.color, "stroke-width": 2, points: sr.points.map((v, i) => `${x(i)},${y(v)}`).join(" ") }));
  });
  clear(host).append(s, el("div", { class: "legend" }, series.map(sr => el("span", {}, el("i", { style: `background:${sr.color}` }), sr.name)), el("span", {}, "y-axis: points above (+) or below (−) the random baseline")));
}

/* ---------------------------------------------------------------- dashboard (colour-first) */
let perfCache = null;
const GROUPS = ["Green", "Red", "Violet"], GROUP_OF = [2, 0, 1, 0, 1, 2, 1, 0, 1, 0];   // same mapping as the backend (index = number)
const GROUP = n => GROUPS[GROUP_OF[n]];
const DOT = n => (n === 0 ? "rv" : n === 5 ? "gv" : GROUP(n).toLowerCase());
const dot = n => el("span", { class: `dot ${DOT(n)}`, title: `${n} · ${COLOR_DETAIL[n]} · ${n >= 5 ? "Big" : "Small"}` });
const groupDot = g => el("span", { class: `dot ${g.toLowerCase()}` });
const pill = (g, text) => el("span", { class: "pill" }, groupDot(g), text || g);
function signalBadge(sig) { return el("span", { class: `sig ${sig.level}` }, sig.label); }
function meter(label, value, cls, note) {
  const w = value == null ? 0 : Math.max(0, Math.min(100, value * 100));
  return el("div", { class: "meter" }, el("div", { class: "mlabel" }, el("span", {}, label), el("b", {}, pct(value))),
    el("div", { class: "track" }, el("i", { class: cls || "", style: `width:${w}%` })), note ? el("div", { class: "bar-note" }, note) : null);
}
function pickFromScores(sc) {
  const t = [0, 0, 0]; sc.forEach((v, n) => { t[GROUP_OF[n]] += v; });
  return GROUPS[t.indexOf(Math.max(...t))];
}

const SIZES = ["Small", "Big"];
const sizeOf = n => (n >= 5 ? "Big" : "Small");
const chip = n => el("span", { class: `chip ${sizeOf(n).toLowerCase()}`, title: `${n} · ${COLOR_DETAIL[n]} · ${sizeOf(n)}` }, String(n));
const sizeChip = sz => el("span", { class: `chip wide ${sz.toLowerCase()}` }, sz);
function pickSize(sc) { let sm = 0, bg = 0; sc.forEach((v, n) => { if (n >= 5) bg += v; else sm += v; }); return bg > sm ? "Big" : "Small"; }

function renderNext(p, perf, stats) {
  const pick = $("#pick"), reality = $("#reality"), models = $("#models");
  if (!p.available) { [pick, reality, models].forEach(c => setBody(c, el("p", { class: "muted" }, p.reason))); return; }
  const sig = p.signal, none = sig.level === "none", bt = perf && perf.backtest, c = bt && bt.consensus.bs;
  setBody(pick,
    el("div", { class: "pickrow" }, el("span", { class: `orb size ${p.size.toLowerCase()} ${none ? "dim" : ""}` }, p.size.toUpperCase()),
      el("div", {}, el("div", { class: "pickname" }, p.size), el("div", { class: "muted" }, `next round ${p.target_period || "#" + p.target_seq} · Big = 5–9, Small = 0–4`),
        el("div", { style: "margin-top:8px" }, signalBadge(sig)))),
    p.size_probs ? el("div", {}, el("div", { class: "bar-note" }, "Estimated chance (an uncertain estimate, not a validated forecast):"),
      SIZES.map(g => meter(g, p.size_probs[g], g.toLowerCase()))) : null,
    el("p", { class: "bar-note" }, `Model v${p.engine_version} · trained on ${p.n_history} rounds · built after confirmed round ${p.latest_result ? (p.latest_result.period_id || "#" + p.latest_result.seq) : "—"} · status: ${p.status}${p.created_at ? " · saved " + String(p.created_at).replace("T", " ").slice(0, 19) + " UTC" : ""}`),
    none ? el("div", { class: "nosig" }, el("strong", {}, "No proven edge. "), "On rounds it had not seen, this pick did no better than flipping a coin.") : null,
    el("details", {}, el("summary", { class: "muted" }, "Why this label?"),
      el("ul", { class: "muted" }, (sig.reasons.length ? sig.reasons : ["Evidence rules satisfied — see the Accuracy tab."]).map(r => el("li", {}, r)),
        sig.validated_on ? el("li", {}, `Tested on ${sig.validated_on.data_n} rounds (${sig.validated_on.run_at}).`) : null)),
    el("p", { class: "bar-note" }, p.disclaimer));
  const live = perf && perf.live.metrics.bs;
  setBody(reality,
    meter("Your target", 0.8, "t"),
    meter(c ? `Measured on ${c.n} unseen rounds` : "Measured", c && c.rate, "", c ? `95% range ${pct(c.lo)} – ${pct(c.hi)}` : "No test yet — open the Accuracy tab and run the walk-forward test."),
    meter("Coin flip (always Big, or always Small)", 0.5, "b", "what you get with no information at all"),
    live && live.n ? meter(`Live picks (${live.n})`, live.rate, "", live.n < 100 ? "fewer than 100 — too few to mean anything" : null) : null,
    c ? el("div", { class: "verdict" }, `${pct(c.rate)} measured. ${c.hi < 0.8 ? "80% is far outside that range. " : ""}${stats && stats.interpretation ? stats.interpretation : ""}`) : null);
  const rows = Object.entries(p.model_scores).map(([k, sc]) => el("tr", {}, el("td", {}, NAMES[k] || k), el("td", {}, sizeChip(pickSize(sc))),
    el("td", {}, bt && bt.models[k] ? pct(bt.models[k].bs.rate) : "—")));
  rows.push(el("tr", {}, el("td", {}, el("strong", {}, NAMES.Consensus)), el("td", {}, sizeChip(p.size)), el("td", {}, c ? pct(c.rate) : "—")));
  setBody(models, el("div", { class: "tablewrap" }, el("table", {}, el("thead", {}, el("tr", {}, el("th", {}, "Model"), el("th", {}, "Picks"), el("th", {}, "Past accuracy"))), el("tbody", {}, rows))),
    el("p", { class: "bar-note" }, "Past accuracy is on unseen rounds. A coin flip scores 50%."));
  if (stats && stats.big_share != null) setBody($("#mix"), meter("Small", 1 - stats.big_share, "small", "expected 50%"), meter("Big", stats.big_share, "big", "expected 50%"));
}

const SYNC_TEXT = { ok: "Connected and up to date", stale: "Connected, but no new data for a while", error: "Cannot read the data source",
  disabled: "Automatic sync is off", not_configured: "No data source configured", needs_anchor: "Needs a starting round ID",
  gap_blocked: "Paused: rounds are missing", rejected: "Data rejected by validation", starting: "Starting…" };
const fmtAge = sec => (sec < 90 ? `${sec} s` : sec < 5400 ? `${Math.round(sec / 60)} min` : `${(sec / 3600).toFixed(1)} h`);
const numPill = n => el("span", { class: "pill" }, chip(n), `${n} · ${sizeOf(n)}`);
function showConn(kind, text) { const c = $("#conn"); c.className = `conn ${kind}`; c.textContent = text; c.hidden = false; }
function hideConn() { $("#conn").hidden = true; }
function stateBanner(st) {
  const warn = ["stale", "error", "gap_blocked", "needs_anchor", "rejected"];
  if (st && st.enabled && warn.includes(st.state)) showConn("warn", `${SYNC_TEXT[st.state]}${st.last_error ? ": " + st.last_error : ""}`);
  else hideConn();
}
async function syncNow() {
  try { await api("/api/sync/run", { method: "POST" }); } catch (e) { showConn("warn", e.message); return; }
  refreshAll();
}
function renderSync(st, latest) {
  const lc = st.latest_confirmed, age = st.seconds_since_success;
  const rows = [["Status", SYNC_TEXT[st.state] || st.state], ["Latest confirmed round", lc ? (lc.period_id || "#" + lc.seq) : "—"],
    ["Latest actual result", latest ? numPill(latest.number) : "—"], ["Next expected round", st.expected_next_round || "—"],
    ["Last successful sync", age == null ? "never" : `${fmtAge(age)} ago`], ["Rounds synced so far", String(st.ingested_total)]];
  setBody($("#sync"), el("dl", { class: "kv" }, rows.flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)])),
    st.last_error ? el("div", { class: "verdict" }, st.last_error) : null,
    st.enabled ? el("button", { class: "btn ghost", type: "button", onclick: syncNow }, "Sync now")
      : el("p", { class: "bar-note" }, "Automatic sync is off. Add rounds by hand on the Add rounds tab, or configure an authorized source in backend/.env (see README)."));
}

function renderSizeEval(bt) {
  const card = $("#sizeeval"), e = bt && bt.size_eval;
  if (!e) { setBody(card, el("p", { class: "muted" }, "Not computed yet. Press “Re-run validation on all stored data” in the box above.")); return; }
  const k = (label, value, note) => el("div", { class: "kpi" }, el("span", {}, label), el("b", {}, value), el("i", {}, note));
  const table = (head, rows) => el("div", { class: "tablewrap" }, el("table", {}, el("thead", {}, el("tr", {}, head.map(h => el("th", {}, h)))),
    el("tbody", {}, rows.map(r => el("tr", {}, r.map(c => el("td", {}, c)))))));
  const skill = e.brier_skill;
  setBody(card,
    el("div", { class: "kpis" }, k("Accuracy", pct(e.accuracy), `coin flip: 50% · ${e.n} unseen rounds`),
      k("Brier score", e.brier.toFixed(4), `fair coin: ${e.brier_prior.toFixed(4)}`),
      k("Brier skill", (skill * 100).toFixed(2) + "%", skill > 0 ? "better than a coin" : "not better than a coin"),
      k("Calibration error", pct(e.ece), "average gap between confidence and hit rate")),
    el("p", { class: "bar-note" }, "Skill below 0% means the stated chances were worse than simply saying 50 / 50."),
    el("h3", {}, "Per class"), table(["Class", "Precision", "Recall", "Rounds"], e.classes.map((c, i) => [c, pct(e.precision[i]), pct(e.recall[i]), String(e.support[i])])),
    el("h3", {}, "Confusion matrix (rows = actual, columns = picked)"), table(["", ...e.classes], e.confusion.map((r, i) => [e.classes[i], ...r.map(String)])),
    el("h3", {}, "Calibration (lowest to highest confidence)"), table(["Rounds", "Average confidence", "Actually correct"], e.calibration.map(b => [String(b.n), pct(b.mean_confidence), pct(b.observed_accuracy)])));
}

let lastSeen = null, lastLatest = null, pollMs = 30000;
async function loadDash() {
  try {
    const [p, r, perf, stats, sync] = await Promise.all([api("/api/prediction/next"), api("/api/results?limit=40"), api("/api/model-performance"),
      api("/api/data/stats").catch(() => null), api("/api/sync/status").catch(() => null)]);
    perfCache = perf; renderNext(p, perf, stats); lastLatest = r.results[0] || null;
    lastSeen = `${lastLatest ? lastLatest.seq : 0}|${sync ? sync.expected_next_round : "-"}`;
    if (sync) { renderSync(sync, lastLatest); stateBanner(sync); } else hideConn();
    clear($("#strip")).append(...r.results.slice().reverse().map(x => chip(x.number)));
    $("#updated").textContent = `Updated ${new Date().toLocaleTimeString()}`;
  } catch (e) { showConn("bad", `Cannot load data: ${e.message}. Showing the last data received.`); }
}
async function refreshAll() {
  const b = $("#refresh"); b.disabled = true; b.textContent = "Refreshing…";
  try { await Promise.all([loadStatus(), loadDash()]); } finally { b.disabled = false; b.textContent = "Refresh"; }
}
async function poll() {                                     // light check; reloads everything only when something changed
  if (typeof document !== "undefined" && document.hidden) return;
  try {
    const [sync, r] = await Promise.all([api("/api/sync/status"), api("/api/results?limit=1")]);
    const latest = r.results[0] || null, key = `${latest ? latest.seq : 0}|${sync.expected_next_round}`;
    if (lastSeen !== null && key !== lastSeen) { await refreshAll(); return; }
    renderSync(sync, latest || lastLatest); stateBanner(sync);
  } catch (e) { showConn("bad", "Disconnected from the server. Showing the last data received; retrying automatically."); }
}
async function startPolling() {
  try { const h = await api("/api/health"); pollMs = Math.max(10, h.poll_seconds || 30) * 1000; } catch (_) { /* keep default */ }
  setInterval(poll, pollMs);
}

function renderSizeAnalysis(c) {
  const tbl = (head, rows) => el("div", { class: "tablewrap" }, el("table", {}, el("thead", {}, el("tr", {}, head.map(h => el("th", {}, h)))),
    el("tbody", {}, rows.map(r => el("tr", {}, r.map(x => el("td", {}, x)))))));
  const W = Object.values(c.windows);
  setBody($("#size-windows"), tbl(["Rounds", "Small", "Big", "p vs fair coin"],
    [["all " + c.n, ...c.overall_share.map(pct), "—"], ...W.map(w => ["last " + w.n, ...w.share.map(pct), w.p_vs_fair.toFixed(3)])]),
    el("p", { class: "bar-note" }, "A fair game gives Big 50% / Small 50%. A p-value under 0.05 is unusual, but with several windows checked one or two are expected by chance. A side that has been absent for a while is not “due”."));
  const t = c.transitions, st = c.streaks;
  setBody($("#size-trans"), tbl(["After ↓ / next →", ...c.classes], t.probabilities.map((row, i) => [c.classes[i], ...(row || [null, null]).map((v, j) => `${pct(v)} (${t.counts[i][j]})`)])),
    el("p", { class: "bar-note" }, t.p_independent == null ? "Not enough data for an independence test."
      : `Independence test p = ${t.p_independent.toFixed(3)} — ${t.p_independent < 0.05 ? "the next side may depend on the previous one; check it on new data before trusting it" : "no evidence that the next side depends on the previous one"}.`),
    el("p", { class: "bar-note" }, `Current streak: ${st.current.length} × ${st.current.colour}. Longest streaks: ${Object.entries(st.longest).map(([k, v]) => `${k} ${v}`).join(", ")}.`));
}

/* ---------------------------------------------------------------- history */
let histOffset = 0; const PAGE = 25;
async function loadHistory(reset) {
  if (reset) { histOffset = 0; clear($("#hist tbody")); }
  const h = await api(`/api/prediction/history?limit=${PAGE}&offset=${histOffset}`); histOffset += h.predictions.length;
  $("#hist tbody").append(...h.predictions.map(r => el("tr", {}, el("td", {}, r.round), el("td", {}, sizeChip(r.size)),
    el("td", {}, r.actual == null ? "—" : el("span", { class: "pill" }, chip(r.actual), sizeOf(r.actual))),
    el("td", {}, r.actual == null ? el("span", { class: "pend" }, "PENDING") : r.bs_hit ? el("span", { class: "ok" }, "HIT ✓") : el("span", { class: "no" }, "MISS ✗")))));
  $("#more").style.display = histOffset >= h.total ? "none" : "";
}

/* ---------------------------------------------------------------- performance */
function kpi(label, m) {
  return el("div", { class: "kpi" }, el("span", {}, label), el("b", {}, pct(m.rate)),
    el("i", {}, m.n ? `baseline ${pct(m.baseline)} · 95% CI ${pct(m.lo)}–${pct(m.hi)}` : `baseline ${pct(m.baseline)}`));
}
function verdict(m) {
  const above = ["top1", "top3", "bs", "color"].filter(k => m[k].lo > m[k].baseline);
  return above.length ? el("span", { class: "pend" }, "nominal edge on " + above.join(", ") + " — check corrected p") : el("span", { class: "muted" }, "within noise of baseline");
}
function renderPerf(perf) {
  const live = perf.live;
  setBody($("#perf-live"), el("div", { class: "kpis" }, el("div", { class: "kpi" }, el("span", {}, "Total predictions"), el("b", {}, live.total_predictions), el("i", {}, live.note)),
    METRICS.map(([k, n]) => kpi(n, live.metrics[k]))), el("p", { class: "bar-note" }, `Current signal: ${perf.signal.label}. ${perf.signal.reasons[0] || ""}`));
  const bt = perf.backtest, card = $("#perf-bt");
  if (!bt) { setBody(card, el("p", { class: "muted" }, "No walk-forward validation stored yet."), runBtn()); return; }
  const rows = Object.entries(bt.models).map(([k, m]) => el("tr", {}, el("td", {}, k === "Consensus" ? el("strong", {}, NAMES[k]) : NAMES[k] || k),
    METRICS.map(([mk]) => el("td", {}, `${pct(m[mk].rate)} `, el("span", { class: "muted" }, `[${pct(m[mk].lo)}–${pct(m[mk].hi)}]`))), el("td", {}, m.top1.n), el("td", {}, verdict(m))));
  rows.unshift(el("tr", {}, el("td", {}, el("em", {}, "Random baseline")), METRICS.map(([mk]) => el("td", {}, pct(bt.baselines[mk]))), el("td", {}, "—"), el("td", {}, "reference")));
  setBody(card, el("div", { class: "tablewrap" }, el("table", {}, el("thead", {}, el("tr", {}, el("th", {}, "Model"), METRICS.map(([, n]) => el("th", {}, n + " [95% CI]")), el("th", {}, "Predictions"), el("th", {}, "vs baseline"))), el("tbody", {}, rows))),
    el("p", { class: "bar-note" }, `Backtest on ${bt.data_n} stored rounds · ${bt.n_predictions} predictions · ${bt.K} model×metric tests (used for multiple-testing correction) · run ${bt.created_at}. Color baseline = best constant guess (40%).`), runBtn());
  const names = { top1: "Top-1", top3: "Top-3", bs: "Big/Small", color: "Color" };
  lineChart($("#chart-roll"), METRICS.map(([k]) => ({ name: names[k], color: LINE_COLORS[k], points: (bt.consensus_rolling[k] || []).map(v => v - bt.baselines[k]) })), "Not enough backtest data.");
  lineChart($("#chart-live"), METRICS.map(([k]) => ({ name: names[k], color: LINE_COLORS[k], points: live.series[k].map(p => p.rate - perf.baselines[k]) })), "No live predictions have been resolved yet. Add new results to build this.");
}
function runBtn() {
  const b = el("button", { class: "btn ghost", onclick: async () => {
    b.disabled = true; try { await api("/api/backtest/run", { method: "POST" }); b.textContent = "Running… (1–2 min)"; pollStatus(); } catch (e) { b.disabled = false; alert(e.message); } } }, "Re-run validation on all stored data");
  return b;
}
async function loadPerf() { perfCache = await api("/api/model-performance"); renderPerf(perfCache); renderSizeEval(perfCache.backtest); }

/* ---------------------------------------------------------------- analysis */
let statsCache = null;
function renderRecentFreq() {
  const a = statsCache; if (!a || !a.recent_frequency) return;
  const w = $("#win").value; barChart($("#chart-recent"), [...Array(10).keys()], a.recent_frequency[w], { expected: 0.1, colors: [...Array(10).keys()].map(barColor) });
}
const barColor = n => (n === 0 ? "#a45bd6" : n === 5 ? "#5cae8f" : [1, 3, 7, 9].includes(n) ? "#22a45d" : "#d63b3b");
async function loadAnalysis() {
  const a = statsCache = await api("/api/data/stats");
  if (!a.counts) { $("#tests").textContent = a.message; return; }
  barChart($("#chart-dist"), [...Array(10).keys()], a.frequency, { expected: 0.1, colors: [...Array(10).keys()].map(barColor) });
  renderRecentFreq();
  const bs = a.big_small; barChart($("#chart-bs"), ["Small (0-4)", "Big (5-9)"], [bs.Small / a.n, bs.Big / a.n], { expected: 0.5, colors: ["#5aa2ff", "#f5b84b"] });
  const cg = a.color_groups; barChart($("#chart-color"), ["Green", "Red", "Violet (0,5)"], [cg.Green / a.n, cg.Red / a.n, cg.Violet / a.n], { expected: null, colors: ["#22a45d", "#d63b3b", "#8b5cf6"] });
  setBody($("#tests").closest(".card"), el("div", { class: "tablewrap" }, el("table", {}, el("thead", {}, el("tr", {}, el("th", {}, "Test"), el("th", {}, "p-value / value"), el("th", {}, "Reading"))),
    el("tbody", {}, Object.values(a.tests).map(t => el("tr", {}, el("td", {}, t.name), el("td", {}, t.p != null ? t.p.toFixed(3) : `${t.value.toFixed(3)} (±${t.band.toFixed(3)})`),
      el("td", {}, t.verdict || (t.within_band ? "consistent with random" : "unusual - verify data"), t.note ? el("div", { class: "muted", style: "font-size:11px" }, t.note) : null)))))),
    el("p", { class: "bar-note" }, a.interpretation), el("div", { id: "tests" }));
  if (a.size && a.size.windows) renderSizeAnalysis(a.size);
  const q = a.data_quality;
  clear($("#dq")).append(el("dl", { class: "kv" }, ...Object.entries({ "Total records": q.total, "Unique period IDs": q.unique_periods ?? "—", "Missing period IDs": q.missing_period ?? "—", "Missing timestamps": q.missing_timestamp ?? "—",
    "Duplicate periods": q.duplicate_periods ?? "—", "Chronological (by period)": q.chronological == null ? "cannot verify (no period IDs)" : q.chronological ? "yes" : "NO", "Longest same-number streak": a.max_same_number_streak }).flatMap(([k, v]) => [el("dt", {}, k), el("dd", {}, v)])));
}

/* ---------------------------------------------------------------- add result / import */
let picked = null;
function buildPad() {
  const pad = $("#pad"), submit = el("button", { class: "btn", id: "submit", disabled: true }, "Submit result");
  for (let n = 0; n < 10; n++) pad.append(el("button", { type: "button", "aria-label": `number ${n}`, onclick: () => { picked = n; submit.disabled = false; submit.textContent = `Submit result ${n}`;
    pad.querySelectorAll(".ball").forEach((b, i) => { b.style.outline = i === n ? "3px solid #2dd4bf" : "none"; }); } }, ball(n, "big")));
  pad.after(submit);
  submit.onclick = async () => {
    const msg = $("#addmsg"); msg.className = "msg"; msg.textContent = "";
    const body = { number: picked }; if ($("#period").value.trim()) body.period_id = $("#period").value.trim(); if ($("#ts").value) body.timestamp = $("#ts").value;
    submit.disabled = true;
    try {
      const r = await api("/api/results", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const o = r.resolved_prediction && r.resolved_prediction.outcome;
      msg.className = "msg good";
      msg.textContent = `Saved as round #${r.result.seq}. ` + (o ? `Previous pick ${r.resolved_prediction.color} vs actual ${GROUP(o.actual)} (${o.actual}): ${o.color_hit ? "hit" : "miss"}.` : "No pending pick to compare.");
      picked = null; $("#period").value = ""; submit.textContent = "Submit result"; pad.querySelectorAll(".ball").forEach(b => { b.style.outline = "none"; });
      loadStatus(); loadDash();
    } catch (e) { msg.className = "msg err"; msg.textContent = e.message; submit.disabled = false; }
  };
  $("#dopaste").onclick = async () => {
    const msg = $("#pastemsg"); msg.className = "msg"; msg.textContent = "";
    const text = $("#paste").value;
    if (!text.trim()) { msg.className = "msg err"; msg.textContent = "Paste at least one round first."; return; }
    try {
      const r = await api(`/api/data/import/paste?newest_first=${$("#pnewest").checked}`, { method: "POST", headers: { "Content-Type": "text/plain" }, body: text });
      msg.className = "msg good"; msg.textContent = `Imported ${r.imported} rounds (total ${r.total}). Re-run the test on the Accuracy tab to include them.`;
      $("#paste").value = ""; loadStatus(); loadDash();
    } catch (e) { msg.className = "msg err"; msg.textContent = e.message; }
  };
  $("#doimport").onclick = async () => {
    const f = $("#csv").files[0], msg = $("#impmsg"); msg.className = "msg"; msg.textContent = "";
    if (!f) { msg.className = "msg err"; msg.textContent = "Choose a CSV file first."; return; }
    try {
      const r = await api(`/api/data/import/csv?newest_first=${$("#newest").checked}`, { method: "POST", headers: { "Content-Type": "text/csv" }, body: await f.text() });
      msg.className = "msg good"; msg.textContent = `Imported ${r.imported} rows (total ${r.total}). Re-run validation from the Performance tab.`; loadStatus(); loadDash();
    } catch (e) { msg.className = "msg err"; msg.textContent = e.message; }
  };
}

/* ---------------------------------------------------------------- shell */
async function loadStatus() {
  try {
    const s = await api("/api/status"), b = s.backtest;
    $("#status").textContent = `${s.results} rounds · engine v${s.engine_version} · validation: ${b.status}${b.status === "running" ? ` ${b.progress}/${b.total}` : ""}`;
    return b.status;
  } catch (e) { $("#status").textContent = "API unreachable"; }
}
async function pollStatus() {
  const st = await loadStatus();
  if (st === "running") setTimeout(pollStatus, 4000); else { loadPerf(); loadDash(); }
}
function init() {
  $("#tabs").addEventListener("click", e => {
    const t = e.target.closest("button"); if (!t) return;
    document.querySelectorAll(".tabs button").forEach(b => b.classList.toggle("on", b === t));
    document.querySelectorAll(".tab").forEach(s => s.classList.toggle("on", s.id === "tab-" + t.dataset.tab));
    ({ history: () => loadHistory(true), perf: loadPerf, analysis: loadAnalysis })[t.dataset.tab]?.();
  });
  $("#more").onclick = () => loadHistory(false);
  $("#win").onchange = renderRecentFreq;
  $("#refresh").onclick = () => refreshAll();
  buildPad(); pollStatus(); loadDash(); startPolling();
}
if (typeof document !== "undefined" && document.getElementById) init();
