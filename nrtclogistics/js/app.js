// NRTC Logistics Hub — Phone view, team, backup, co-op directory, sync, passcode gate, boot.
// Loaded in order by index.html as classic scripts (they share top-level names).
"use strict";
/* ================== Phone view switch (Itinerary / Email) ================== */
document.body.dataset.view = "plan";
$$(".mtabs [data-view]").forEach((b) => (b.onclick = () => {
  document.body.dataset.view = b.dataset.view;
  $$(".mtabs [data-view]").forEach((x) => x.setAttribute("aria-pressed", x === b));
  window.scrollTo({ top: 0 });
}));

/* ================== Team dialog ================== */
function renderTeam() {
  $("#teamList").innerHTML = TEAM.map((p, i) => `<div class="team-row"><span>${esc(p.name)} <small>${esc(p.group || "")}${p.town ? ` · ${esc(p.town)}` : ""}</small></span>
    <input class="f-input" data-home="${i}" value="${esc(p.home || "")}" list="apList" maxlength="3" style="text-transform:uppercase" placeholder="Home apt">
    <button class="btn ghost sm danger" data-del="${i}">Remove</button></div>`).join("");
}
function renderTerr() {
  $("#terrList").innerHTML = rbmNames().map((n) => `<div class="team-row" style="grid-template-columns:150px 1fr"><span>${esc(n)}</span>
    <input class="f-input" data-terr="${esc(n)}" value="${esc(TERR[n] || "")}" placeholder="e.g. KS MO IA" style="text-transform:uppercase"></div>`).join("") +
    `<p class="hint">Unassigned right now: ${esc(ALL_STATES.filter((st) => !rbmForState(st)).join(" ") || "none")}</p>`;
}
const ALL_STATES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(" ");
$("#terrList").addEventListener("change", (e) => { const n = e.target.dataset.terr; if (!n) return; TERR[n] = e.target.value.toUpperCase().replace(/[^A-Z]+/g, " ").trim(); saveTerr(); renderTerr(); render(); });
$("#teamBtn").onclick = () => { renderTeam(); renderTerr(); $("#teamDlg").showModal(); };
$("#teamList").addEventListener("input", (e) => { const i = e.target.dataset.home; if (i != null) { TEAM[+i].home = e.target.value.toUpperCase(); saveTeam(); renderPreview(); } });
$("#teamList").addEventListener("click", (e) => { const i = e.target.dataset.del; if (i != null && confirm(`Remove ${TEAM[+i].name} from the team list?`)) { TEAM.splice(+i, 1); saveTeam(); renderTeam(); render(); } });
$("#tmAdd").onclick = () => {
  const name = $("#tmName").value.trim(); if (!name) return;
  TEAM.push({ name, group: $("#tmGroup").value, home: $("#tmHome").value.trim().toUpperCase() });
  saveTeam(); $("#tmName").value = $("#tmHome").value = ""; renderTeam(); render();
};

/* ================== Backup / share ================== */
$("#moreBtn").onclick = () => $("#moreDlg").showModal();
$("#exportAll").onclick = () => {
  const blob = new Blob([JSON.stringify({ trips: DB.trips, team: TEAM, territories: TERR }, null, 2)], { type: "application/json" });
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `nrtc-logistics-${new Date().toISOString().slice(0, 10)}.json`; a.click();
};
$("#importFile").onchange = async (e) => {
  const f = e.target.files[0]; if (!f) return;
  try {
    const d = JSON.parse(await f.text()); const trips = d.trips || (d.items ? [d] : []);
    let n = 0; trips.forEach((t) => { migrateTrip(t); if (!t.id || DB.trips.some((x) => x.id === t.id)) t.id = uid(); DB.trips.unshift(t); n++; });
    if (d.team && confirm("Also replace the team list (and RBM territories) with the ones in this file?")) { TEAM = d.team; saveTeam(); if (d.territories) { TERR = d.territories; saveTerr(); } }
    if (n) DB.current = DB.trips[0].id; commit(); toast(`Imported ${n} trip${n === 1 ? "" : "s"}`); $("#moreDlg").close();
  } catch (err) { toast("That file didn't look like a hub backup"); }
  e.target.value = "";
};
function b64url(s) { return btoa(unescape(encodeURIComponent(s))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function unb64url(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); return decodeURIComponent(escape(atob(s))); }
$("#shareLink").onclick = async () => {
  const url = `${location.origin}${location.pathname}#trip=${b64url(JSON.stringify(trip()))}`;
  toast((await copyPlain(url)) ? "Share link copied" : "Couldn't copy the link");
};
function importFromHash() {
  const m = location.hash.match(/#trip=([\w-]+)/); if (!m) return;
  try {
    const t = JSON.parse(unb64url(m[1])); migrateTrip(t);
    const existing = DB.trips.find((x) => x.id === t.id);
    if (existing && !confirm(`You already have "${existing.title}". Replace it with the shared version?`)) { DB.current = existing.id; }
    else { DB.trips = DB.trips.filter((x) => x.id !== t.id); DB.trips.unshift(t); DB.current = t.id; toast(`Opened shared trip "${t.title || "Untitled"}"`); }
    save();
  } catch (e) { toast("That share link looks broken"); }
  history.replaceState(null, "", location.pathname);
}

/* ================== Co-op directory (from the Gate Check sheet) ================== */
let COOP_DIR = [];
function parseCSV(text) {
  const rows = []; let row = [], f = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { f += '"'; i++; } else q = false; } else f += ch; }
    else if (ch === '"') q = true; else if (ch === ",") { row.push(f); f = ""; }
    else if (ch === "\n") { row.push(f); rows.push(row); row = []; f = ""; } else if (ch !== "\r") f += ch;
  }
  if (f || row.length) { row.push(f); rows.push(row); }
  return rows;
}
async function loadCoopDir() {
  try {
    const rows = parseCSV(await (await fetch(COOPS_CSV_URL)).text());
    const h = rows[0].map((x) => x.trim());
    const ix = (n) => h.indexOf(n);
    const seen = new Map();
    rows.slice(1).forEach((r) => {
      const name = (r[ix("Cooperative Name")] || "").trim(); if (!name || seen.has(name.toLowerCase())) return;
      seen.set(name.toLowerCase(), { name, town: (r[ix("Cooperative HQ Town")] || "").trim(), state: (r[ix("Cooperative HQ State")] || "").trim().toUpperCase() });
    });
    COOP_DIR = [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
    $("#coopList").innerHTML = COOP_DIR.map((c) => `<option value="${esc(c.name)}">${esc([c.town, c.state].filter(Boolean).join(", "))}</option>`).join("");
  } catch (e) { /* autocomplete is a nice-to-have */ }
}

/* ================== Boot ================== */
$$("[data-ic]").forEach((el) => (el.outerHTML = icon(el.dataset.ic)));
$("#apList").innerHTML = Object.entries(window.AP || {}).map(([c, a]) => `<option value="${c}">${esc(a[0])}, ${esc(a[1])}</option>`).join("");
/* ================== Shared sync (Google Sheet via Apps Script) ================== */
// Every trip is one record ("trip:<id>"), plus "team" and "territories". Local edits push ~1s after
// you stop typing; other people's edits are pulled every 10s (and whenever the tab comes back).
// If two people edit the same trip at the same moment, the last save wins.
const SYNC_URL = window.SYNC_URL || "";
const SYNC_KEY = "nrtclog:sync";
const SYNC = Object.assign({ rev: 0, snap: {}, meta: {} }, (() => { try { return JSON.parse(localStorage.getItem(SYNC_KEY)) || {}; } catch (e) { return {}; } })());
const syncSave = () => { try { localStorage.setItem(SYNC_KEY, JSON.stringify({ rev: SYNC.rev, snap: SYNC.snap, meta: SYNC.meta })); } catch (e) {} };
const myName = () => localStorage.getItem("nrtclog:me") || "";
const isSample = (t) => t.sample || /\(example\)\s*$/i.test(t.title || "");

async function api(action, body) {
  const r = await fetch(SYNC_URL, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(Object.assign({ action, pass: localStorage.getItem("nrtclog:pass") || "", by: myName() }, body || {})) });
  const j = await r.json();
  if (!j.ok) { const e = new Error(j.error || "error"); e.code = j.error; throw e; }
  return j;
}
function setSync(state, text) {
  const el = $("#syncStatus"); if (!el || !SYNC_URL) return;
  el.hidden = false; el.className = `sync-status ${state}`; el.textContent = text;
}
function lastEditLine(t) {
  const m = SYNC.meta[`trip:${t.id}`]; if (!SYNC_URL || !m || !m.updated) return "";
  const mins = Math.round((Date.now() - new Date(m.updated)) / 60000);
  const ago = mins < 1 ? "just now" : mins < 60 ? `${mins} min ago` : mins < 1440 ? `${Math.round(mins / 60)} hr ago` : new Date(m.updated).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return ` · last saved by ${m.by ? first(m.by) : "someone"} ${ago}`;
}
// What this browser has that differs from the last copy it saw on the server
function localRecords() {
  const recs = {};
  DB.trips.filter((t) => !isSample(t)).forEach((t) => (recs[`trip:${t.id}`] = t));
  recs.team = TEAM; recs.territories = TERR;
  if (SHARED && Object.keys(SHARED).length) recs.cache = SHARED;
  return recs;
}
function dirtyItems() {
  const recs = localRecords(), out = [];
  Object.entries(recs).forEach(([k, v]) => { const j = JSON.stringify(v); if (SYNC.snap[k] !== j) out.push({ key: k, value: v, json: j }); });
  // trips deleted here that the server still has
  Object.keys(SYNC.snap).forEach((k) => { if (k.startsWith("trip:") && !recs[k] && SYNC.snap[k] !== "null") out.push({ key: k, value: null, json: "null" }); });
  return out;
}
let pushTimer = null, pushing = null, pulling = false, pendingRender = false, pollTimer = null;
window.syncSoon = () => { if (!SYNC_URL || document.documentElement.classList.contains("locked")) return; clearTimeout(pushTimer); setSync("busy", "Saving…"); pushTimer = setTimeout(push, 900); };
// Put a record's value into this browser (a trip, the team list or the territories)
function applyRecord(key, value) {
  if (key === "team") { if (Array.isArray(value)) { TEAM = value; localStorage.setItem(TEAM_KEY, JSON.stringify(TEAM)); } return; }
  if (key === "territories") { if (value && typeof value === "object") { TERR = value; localStorage.setItem(TERR_KEY, JSON.stringify(TERR)); } return; }
  if (key === "cache") { if (value && typeof value === "object") setSharedCache(value); return; }
  if (!key.startsWith("trip:")) return;
  const id = key.slice(5), i = DB.trips.findIndex((t) => t.id === id);
  if (!value || value.deleted) { if (i >= 0) DB.trips.splice(i, 1); return; }
  migrateTrip(value);
  if (i >= 0) DB.trips[i] = value; else DB.trips.push(value);
}
// Bring in the server's copy of one record. If this browser changed it too, merge the two
// item by item (merge.js) instead of letting either side erase the other.
function absorbRemote(r, firstSync) {
  const theirsJson = JSON.stringify(r.value);
  SYNC.meta[r.key] = { rev: r.rev, updated: r.updated, by: r.by };
  if (SYNC.snap[r.key] === theirsJson) return false;
  const local = localRecords(), hasLocal = Object.prototype.hasOwnProperty.call(local, r.key);
  const mine = hasLocal ? local[r.key] : (SYNC.snap[r.key] !== undefined ? null : undefined);
  const mineJson = JSON.stringify(mine === undefined ? null : mine);
  const changedHere = mine !== undefined && mineJson !== (SYNC.snap[r.key] ?? "null");
  let next = r.value;
  if (changedHere) {
    const settings = r.key === "team" || r.key === "territories"; // (the cache just unions)
    // first sync on a new device: its default team/territories aren't edits, so the server's win
    const base = firstSync && settings ? clone(mine) : (SYNC.snap[r.key] !== undefined ? JSON.parse(SYNC.snap[r.key]) : undefined);
    next = merge3(base, clone(mine), r.value);
  }
  SYNC.snap[r.key] = theirsJson;
  if (JSON.stringify(next) !== mineJson) { applyRecord(r.key, next === undefined ? null : clone(next)); return true; }
  return false;
}
async function push(attempt = 0) {
  if (pushing) return pushing.then(() => push(attempt));
  const items = dirtyItems(); if (!items.length) { setSync("ok", "Synced"); return; }
  let again = false;
  pushing = (async () => {
    try {
      // baseRev = the server version this edit was made on; the script refuses the write if someone
      // saved in between, and hands back their copy to merge with
      const j = await api("put", { items: items.map(({ key, value }) => ({ key, value, baseRev: (SYNC.meta[key] || {}).rev || 0 })) });
      let changed = false;
      j.items.forEach((r) => {
        if (r.conflict) { if (absorbRemote(r, false)) changed = true; again = true; return; }
        const it = items.find((x) => x.key === r.key);
        if (it && r.rev) { SYNC.snap[r.key] = it.json; SYNC.meta[r.key] = { rev: r.rev, updated: r.updated, by: myName() }; }
      });
      if (changed) { try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch (e) {} if (busyEditing()) pendingRender = true; else render(); }
      syncSave(); setSync("ok", "Synced"); $("#tripDates").textContent = (tripRange(trip()) || "Dates fill in from the itinerary.") + lastEditLine(trip());
    } catch (e) { handleSyncError(e); }
  })();
  await pushing; pushing = null;
  if (again && attempt < 3) await push(attempt + 1); // send the merged version
}
function busyEditing() {
  const a = document.activeElement;
  return !!document.querySelector("dialog[open]") || !!(a && a.matches("input, textarea, select") && a.closest(".editor"));
}
async function pull() {
  if (!SYNC_URL || pulling || document.documentElement.classList.contains("locked")) return;
  pulling = true;
  try {
    const firstSync = !SYNC.rev;
    const j = await api("list", { since: SYNC.rev });
    let changed = false;
    j.items.forEach((r) => { if (absorbRemote(r, firstSync)) changed = true; });
    SYNC.rev = Math.max(SYNC.rev, j.rev || 0);
    if (!DB.trips.length) DB.trips.push(newTrip());
    if (!DB.trips.some((t) => t.id === DB.current) || (isSample(trip()) && DB.trips.some((t) => !isSample(t)) && firstSync)) DB.current = (DB.trips.find((t) => !isSample(t)) || DB.trips[0]).id;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch (e) {}
    syncSave();
    if (changed) { if (busyEditing()) pendingRender = true; else render(); }
    if (dirtyItems().length) await push(); else setSync("ok", "Synced");
  } catch (e) { handleSyncError(e); }
  pulling = false;
}
function handleSyncError(e) {
  if (e.code === "passcode") { localStorage.removeItem("nrtclog:pass"); lockPage("The team passcode changed. Enter the new one."); return; }
  setSync("off", "Offline, saved on this device");
}
// Re-render deferred remote changes once the user finishes what they're doing
document.addEventListener("focusout", () => setTimeout(() => { if (pendingRender && !busyEditing()) { pendingRender = false; render(); } }, 50));
$$("dialog").forEach((d) => d.addEventListener("close", () => { if (pendingRender) { pendingRender = false; setTimeout(render, 0); } }));
function startSync() {
  if (!SYNC_URL) return;
  setSync("busy", "Syncing…");
  pull();
  clearInterval(pollTimer);
  pollTimer = setInterval(() => { if (document.visibilityState === "visible") pull(); }, 10000);
}
document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") pull(); });
window.addEventListener("online", () => pull());

/* ================== Passcode gate ================== */
// Without a backend the passcode is checked here by its SHA-256 hash; with one, the Apps Script checks it.
const GATE_HASH = "e3bafff2e5fea0daa2706b58b5cb99386d422f056255529a74514244a1675171";
function lockPage(msg) {
  localStorage.removeItem("nrtclog:unlock");
  document.documentElement.classList.add("locked");
  prepGate(); $("#gateErr").textContent = msg || "";
  setTimeout(() => $("#gatePass").focus(), 50);
}
function prepGate() {
  const sel = $("#gateMe");
  if (!SYNC_URL) return;
  sel.style.display = "";
  sel.innerHTML = `<option value="">Who are you?</option>` + TEAM.map((p) => `<option ${p.name === myName() ? "selected" : ""}>${esc(p.name)}</option>`).join("");
}
(function () {
  const FAILS = "nrtclog:fails";
  const sha = async (txt) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(txt)))].map((b) => b.toString(16).padStart(2, "0")).join("");
  prepGate();
  $("#gateForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = JSON.parse(localStorage.getItem(FAILS) || '{"n":0,"until":0}');
    if (Date.now() < f.until) { $("#gateErr").textContent = `Too many tries. Wait ${Math.ceil((f.until - Date.now()) / 60000)} min.`; return; }
    const pass = $("#gatePass").value.trim().toUpperCase();
    if (SYNC_URL && !$("#gateMe").value) { $("#gateErr").textContent = "Pick your name so the team knows who changed what."; return; }
    let ok = false;
    if (SYNC_URL) {
      localStorage.setItem("nrtclog:pass", pass);
      try { await api("ping"); ok = true; }
      catch (err) {
        if (err.code === "passcode") ok = false;
        else ok = (await sha(pass)) === GATE_HASH; // backend unreachable: let them in to work offline
      }
      if (!ok) localStorage.removeItem("nrtclog:pass");
      else localStorage.setItem("nrtclog:me", $("#gateMe").value);
    } else ok = (await sha(pass)) === GATE_HASH;
    if (ok) {
      localStorage.setItem("nrtclog:unlock", GATE_HASH); localStorage.removeItem(FAILS);
      document.documentElement.classList.remove("locked"); $("#gatePass").value = ""; $("#gateErr").textContent = "";
      render(); startSync();
    } else {
      f.n++; if (f.n >= 10) { f.until = Date.now() + 15 * 60000; f.n = 0; }
      localStorage.setItem(FAILS, JSON.stringify(f));
      $("#gateErr").textContent = "That's not it."; $("#gatePass").select();
    }
  });
  $("#lockBtn").onclick = () => { localStorage.removeItem("nrtclog:pass"); lockPage(); };
})();

importFromHash();
render();
loadCoopDir();
refreshOldDrives();
if (!document.documentElement.classList.contains("locked")) startSync();
