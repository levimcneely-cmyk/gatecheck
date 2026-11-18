// NRTC Logistics Hub — Config, helpers, storage, places, geocoding and routing.
// Loaded in order by index.html as classic scripts (they share top-level names).
"use strict";
/* ================== Config ================== */
const STORE_KEY = "nrtclog:v1";
const TEAM_KEY = "nrtclog:team";
// Same published co-op sheet Gate Check's map uses — feeds the co-op name autocomplete.
const COOPS_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vR54CnrLNkh_UuMJ1Hetsu3DhQ0E4vm7B48yazB-ODIQNcV7zXq42U0CWQ5RjaUSXarnB8L4VSPYl81/pub?gid=316726175&single=true&output=csv";

// RBM territories by co-op HQ state (from the RBM map; the old East region is unassigned until it's split out).
// Editable under Team → RBM territories; each co-op can also override its RBM.
const TERR_KEY = "nrtclog:terr";
const DEFAULT_TERR = {
  "Chris Bradley": "AK HI WA OR CA NV UT AZ CO NM WY",
  "Michael Jablonski": "ID MT ND SD NE",
  "Steve Hanson": "MN IA KS MO",
  "Mark Davis": "WI MI IL IN OH KY",
  "Matt Timmons": "OK TX AR LA",
  "Rodney Pugh": "MS AL GA FL",
};
const DEFAULT_TEAM = [
  { name: "Mark Davis", group: "RBMS", home: "" },
  { name: "Steve Hanson", group: "RBMS", home: "" },
  { name: "Matt Timmons", group: "RBMS", home: "" },
  { name: "Michael Jablonski", group: "RBMS", home: "" },
  { name: "Chris Bradley", group: "RBMS", home: "" },
  { name: "Rodney Pugh", group: "RBMS", home: "" },
  { name: "Josh Pepple", group: "Advisory", town: "Pass Christian, MS", home: "GPT" },
  { name: "Levi McNeely", group: "Advisory", town: "Greenwood, IN", home: "IND" },
  { name: "Evan Schmitt", group: "Advisory", town: "McKee, KY", home: "LEX" },
  { name: "Jake Bailey", group: "Advisory", town: "Valparaiso, IN", home: "ORD" },
  { name: "Kat Romero", group: "Advisory", town: "Manchester, NH", home: "MHT" },
  { name: "Thomas McCollum", group: "Advisory", town: "Nashville, TN", home: "BNA" },
  { name: "Brandon Sutter", group: "Advisory", town: "Kouts, IN", home: "ORD" },
];

const TYPES = {
  flight: { label: "Flight", svg: '<path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/>' },
  rental: { label: "Rental car", svg: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9C18.7 10.6 16 10 16 10s-1.3-1.4-2.2-2.3c-.5-.4-1.1-.7-1.8-.7H5c-.6 0-1.1.4-1.4.9l-1.4 2.9A3.7 3.7 0 0 0 2 12v4c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><path d="M9 17h6"/><circle cx="17" cy="17" r="2"/>' },
  hotel: { label: "Hotel", svg: '<path d="M2 4v16"/><path d="M2 8h18a2 2 0 0 1 2 2v10"/><path d="M2 17h20"/><path d="M6 8v9"/>' },
  drive: { label: "Drive", svg: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>' },
  meeting: { label: "Meeting", svg: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>' },
  meal: { label: "Meal", svg: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 0 0 2-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3Zm0 0v7"/>' },
  note: { label: "Note", svg: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M16 13H8"/><path d="M16 17H8"/>' },
};

const icon = (type) => `<span class="ic ic-${type}"><svg viewBox="0 0 24 24" aria-hidden="true">${TYPES[type].svg}</svg></span>`;
/* ================== Small helpers ================== */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const uid = () => Math.random().toString(36).slice(2, 10);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const clone = (o) => JSON.parse(JSON.stringify(o));
const first = (n) => String(n || "").trim().split(/\s+/)[0];

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("show");
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("show"), 2200);
}
function toMin(hhmm) { if (!hhmm) return null; const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; }
function fromMin(min) { min = ((Math.round(min) % 1440) + 1440) % 1440; return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`; }
function fmtTime(hhmm) {
  if (!hhmm) return "";
  let [h, m] = hhmm.split(":").map(Number); const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
  return `${h}:${String(m).padStart(2, "0")} ${ap}`;
}
function fmtRange(a, b) {
  if (!b) return fmtTime(a);
  const A = fmtTime(a), B = fmtTime(b);
  return A.slice(-2) === B.slice(-2) ? `${A.slice(0, -3)}–${B}` : `${A}–${B}`;
}
function fmtDur(min) {
  if (min == null || isNaN(min)) return "";
  min = Math.max(5, Math.round(min / 5) * 5);
  const h = Math.floor(min / 60), m = min % 60;
  if (!h) return `${m} min`;
  return m ? `${h} hr ${m} min` : `${h} hr${h > 1 ? "s" : ""}`;
}
function parseDur(s) { // "4:30", "4h30", "270", "4.5h"
  s = String(s || "").trim().toLowerCase(); if (!s) return null;
  let m = s.match(/^(\d+):(\d{1,2})$/); if (m) return +m[1] * 60 + +m[2];
  m = s.match(/^(\d+(?:\.\d+)?)\s*h(?:rs?|ours?)?\s*(?:(\d+)\s*m(?:in)?)?$/); if (m) return Math.round(+m[1] * 60 + (+m[2] || 0));
  m = s.match(/^(\d+)\s*m(?:in)?$/); if (m) return +m[1];
  if (/^\d+(\.\d+)?$/.test(s)) return +s <= 12 ? Math.round(+s * 60) : Math.round(+s);
  return null;
}
function dateObj(iso) { const [y, m, d] = iso.split("-").map(Number); return new Date(y, m - 1, d); }
function fmtDay(iso) { return dateObj(iso).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" }); }
function fmtShort(iso) { return dateObj(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" }); }
function addDays(iso, n) { const d = dateObj(iso); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
function apInfo(code) { const a = window.AP && AP[(code || "").toUpperCase()]; return a ? { city: a[0], state: a[1], lat: a[2], lon: a[3] } : null; }

/* ================== Storage ================== */
let DB = load();
DB.trips.forEach(migrateTrip);
let TEAM = loadTeam();
let TERR = (() => { try { const t = JSON.parse(localStorage.getItem(TERR_KEY)); if (t && typeof t === "object") return t; } catch (e) {} return { ...DEFAULT_TERR }; })();
function saveTerr() { localStorage.setItem(TERR_KEY, JSON.stringify(TERR)); if (window.syncSoon) syncSoon(); }
function rbmForState(st) { st = (st || "").trim().toUpperCase(); if (!st) return ""; return Object.keys(TERR).find((n) => (TERR[n] || "").toUpperCase().split(/[\s,]+/).includes(st)) || ""; }
function coopRBM(c) { return c.rbmManual ? (c.rbm || "") : rbmForState(c.state); }
const rbmNames = () => [...new Set([...TEAM.filter((p) => p.group === "RBMS").map((p) => p.name), ...Object.keys(TERR)])];
function load() {
  try { const d = JSON.parse(localStorage.getItem(STORE_KEY)); if (d && d.trips) return d; } catch (e) {}
  const t = sampleTrip(); return { trips: [t], current: t.id, opts: { conf: true, addr: true, miles: false } };
}
function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(DB)); } catch (e) { toast("Couldn't save in this browser"); } if (window.syncSoon) syncSoon(); }
function loadTeam() { try { const t = JSON.parse(localStorage.getItem(TEAM_KEY)); if (Array.isArray(t) && t.length) return t; } catch (e) {} return clone(DEFAULT_TEAM); }
function saveTeam() { localStorage.setItem(TEAM_KEY, JSON.stringify(TEAM)); if (window.syncSoon) syncSoon(); }
const trip = () => DB.trips.find((t) => t.id === DB.current) || DB.trips[0];
function homeOf(name) { const p = TEAM.find((x) => x.name === name); return (p && p.home || "").toUpperCase(); }

// Co-ops get a permanent id, and drives/meetings point at "coop:<id>". Older trips pointed at a
// co-op's position in the list ("coop:0"), which breaks when a co-op is removed or reordered.
function newCoopId() { return `c-${uid()}`; }
function migrateTrip(t) {
  if (!t || !Array.isArray(t.coops)) return false;
  let changed = false;
  const byIndex = t.coops.map((c) => { if (!c.id) { c.id = newCoopId(); changed = true; } return c.id; });
  (t.items || []).forEach((it) => ["from", "to", "loc"].forEach((k) => {
    const m = it[k] && typeof it[k].ref === "string" && it[k].ref.match(/^coop:(\d+)$/);
    if (m) { it[k].ref = byIndex[+m[1]] ? `coop:${byIndex[+m[1]]}` : ""; changed = true; }
  }));
  return changed;
}
function newTrip() { return { id: uid(), title: "", coops: [], travelers: [], notes: "", items: [] }; }

function sampleTrip() {
  // Rebuilt from the Aug 31 – Sep 2, 2026 Western Co-op trip email, so there's something to look at.
  return {
    id: uid(), sample: true, title: "WCE Executive Readout (example)", notes: "",
    coops: [{ id: "c-wce", name: "Western Cooperative Electric", town: "WaKeeney", state: "KS", address: "", lat: 39.0245, lon: -99.882 }],
    travelers: ["Levi McNeely", "Thomas McCollum"],
    items: [
      { id: uid(), type: "flight", date: "2026-08-31", travelers: ["Thomas McCollum"], from: "BNA", to: "DEN", dep: "", arr: "10:00", dir: "auto" },
      { id: uid(), type: "flight", date: "2026-08-31", travelers: ["Levi McNeely"], from: "IND", to: "DEN", dep: "", arr: "11:10", dir: "auto" },
      { id: uid(), type: "rental", date: "2026-08-31", driver: "Levi McNeely", pickup: "DEN", company: "", time: "" },
      { id: "s-h1", type: "hotel", date: "2026-08-31", outDate: "2026-09-01", name: "Hilton Garden Inn Hays", city: "Hays, KS", address: "", lat: 38.8792, lon: -99.3268, travelers: [] },
      { id: uid(), type: "drive", date: "2026-08-31", from: { ref: "ap:DEN" }, to: { ref: "hotel:s-h1" }, minutes: 270, manual: true, travelers: [] },
      { id: uid(), type: "drive", date: "2026-09-01", from: { ref: "hotel:s-h1" }, to: { ref: "coop:c-wce" }, minutes: 30, manual: true, travelers: [] },
      { id: uid(), type: "meeting", date: "2026-09-01", title: "WCE Executive Readout", coop: "Western Cooperative Electric", start: "13:00", end: "15:30", loc: { ref: "coop:c-wce" }, travelers: [] },
      { id: uid(), type: "drive", date: "2026-09-01", from: { ref: "coop:c-wce" }, to: { ref: "hotel:s-h2" }, minutes: 240, manual: true, travelers: [] },
      { id: "s-h2", type: "hotel", date: "2026-09-01", outDate: "2026-09-02", name: "Hilton Garden Inn Denver Airport", city: "Denver, CO", address: "", lat: 39.8, lon: -104.79, travelers: [] },
      { id: uid(), type: "meeting", date: "2026-09-02", title: "TVEC Strategy Review Meeting", coop: "", start: "09:00", end: "11:00", loc: { ref: "" }, travelers: ["Thomas McCollum"] },
      { id: uid(), type: "flight", date: "2026-09-02", travelers: ["Levi McNeely"], from: "DEN", to: "IND", dep: "11:15", arr: "", dir: "auto" },
      { id: uid(), type: "flight", date: "2026-09-02", travelers: ["Thomas McCollum"], from: "DEN", to: "BNA", dep: "14:20", arr: "", dir: "auto" },
    ],
  };
}

/* ================== Places, geocoding, routing ================== */
function placesFor(t) {
  const out = [], seen = new Set();
  const add = (p) => { if (!seen.has(p.ref)) { seen.add(p.ref); out.push(p); } };
  t.items.forEach((it) => {
    const codes = it.type === "flight" ? [it.from, it.to] : it.type === "rental" ? [it.pickup] : [];
    codes.filter(Boolean).forEach((c) => {
      const a = apInfo(c); c = c.toUpperCase();
      add({ ref: `ap:${c}`, short: c, long: a ? `${c} (${a.city}, ${a.state})` : c, lat: a?.lat, lon: a?.lon, q: `${c} airport` });
    });
  });
  t.coops.forEach((c, i) => {
    if (!c.name) return;
    const where = [c.town, c.state].filter(Boolean).join(", ");
    add({ ref: `coop:${c.id}`, short: where || c.name, long: `${c.name}${where ? ` (${where})` : ""}`, lat: c.lat, lon: c.lon, address: c.address, q: c.address || where });
  });
  t.items.filter((i) => i.type === "meal" && i.place).forEach((m) => {
    add({ ref: `meal:${m.id}`, short: m.place, long: `${m.place} (${m.kind || "meal"}, ${fmtShort(m.date)})`, lat: m.lat, lon: m.lon, address: m.address, q: m.address || m.place });
  });
  t.items.filter((i) => i.type === "hotel" && i.name).forEach((h) => {
    add({ ref: `hotel:${h.id}`, short: h.city || h.name, long: `${h.name}${h.city ? ` (${h.city})` : ""}`, lat: h.lat, lon: h.lon, address: h.address, q: h.address || [h.name, h.city].filter(Boolean).join(", ") });
  });
  return out;
}
function resolvePlace(t, p) {
  if (!p) return null;
  if (p.ref === "custom") return { ref: "custom", short: p.label, long: p.label, lat: p.lat, lon: p.lon, q: p.label, address: p.label };
  if (p.ref && p.ref.startsWith("ap:")) {
    const c = p.ref.slice(3), a = apInfo(c);
    return { ref: p.ref, short: c, long: a ? `${c} (${a.city}, ${a.state})` : c, lat: a?.lat, lon: a?.lon, q: `${c} airport` };
  }
  return placesFor(t).find((x) => x.ref === p.ref) || null;
}

// Co-op HQ towns already known from Gate Check's map — instant, no network.
const TOWN_COORDS = {
  "RUSHFORD|MN": { lat: 43.8125, lon: -91.7514 },
  "OWENSBORO|KY": { lat: 37.7578, lon: -87.1133 },
  "NORTH FORT MYERS|FL": { lat: 26.7306, lon: -81.8583 },
  "HAMMOND|WI": { lat: 44.9997, lon: -92.4261 },
  "FRIENDSHIP|WI": { lat: 43.9717, lon: -89.8187 },
  "DUNN|NC": { lat: 35.3114, lon: -78.6128 },
  "CLARKESVILLE|GA": { lat: 34.6103, lon: -83.5283 },
  "MOORE HAVEN|FL": { lat: 26.8339, lon: -81.0983 },
  "FREDERICKSBURG|TX": { lat: 30.2639, lon: -98.8747 },
  "MUENSTER|TX": { lat: 33.6528, lon: -97.3728 },
  "WAKEENEY|KS": { lat: 39.0245, lon: -99.8820 },
  "LANCASTER|OH": { lat: 39.7431, lon: -82.6069 },
  "ROCHESTER|MN": { lat: 44.0143, lon: -92.4786 },
  "DANVILLE|IN": { lat: 39.75139, lon: -86.49556 },
  "DEFUNIAK SPRINGS|FL": { lat: 30.71700, lon: -86.11700 },
  "SUMMERDALE|AL": { lat: 30.48889, lon: -87.69972 },
  "DADE CITY|FL": { lat: 28.36472, lon: -82.19583 },
  "ANDALUSIA|AL": { lat: 31.31000, lon: -86.49389 },
  "MARIETTA|GA": { lat: 33.95333, lon: -84.54056 },
  "INDIANAPOLIS|IN": { lat: 39.76840, lon: -86.15810 },
  "MONTICELLO|IN": { lat: 40.74667, lon: -86.76528 },
  "PARIS|IL": { lat: 39.62500, lon: -87.69167 },
  "ROCHESTER|IN": { lat: 41.05917, lon: -86.19611 },
  "WABASH|IN": { lat: 40.80083, lon: -85.82722 },
  "PERU|IN": { lat: 40.75778, lon: -86.07167 },
  "GREENFIELD|IN": { lat: 39.79472, lon: -85.75694 },
  "ROCKVILLE|IN": { lat: 39.76639, lon: -87.22944 },
  "LINDEN|IN": { lat: 40.18889, lon: -86.90222 },
  "BLOOMINGTON|IN": { lat: 39.16670, lon: -86.53470 },
  "MARTINSVILLE|IN": { lat: 39.39306, lon: -86.45417 },
  "NORTH BALTIMORE|OH": { lat: 41.18028, lon: -83.66944 },
  "HERNDON|VA": { lat: 38.97139, lon: -77.38861 },
  "PAXTON|IL": { lat: 40.45417, lon: -88.11250 },
  "SUMTERVILLE|FL": { lat: 28.74500, lon: -82.06333 },
  "REIDSVILLE|GA": { lat: 32.08389, lon: -82.12083 },
  "JEFFERSON|GA": { lat: 34.12667, lon: -83.59028 },
  "AMERICUS|GA": { lat: 32.07528, lon: -84.22667 },
  "EUGENE|OR": { lat: 44.05639, lon: -123.11750 },
  "MANILLA|IN": { lat: 39.57250, lon: -85.62306 },
  "FRANKLINTON|LA": { lat: 30.85333, lon: -90.13194 },
  "GREENWELL SPRINGS|LA": { lat: 30.57450, lon: -90.98980 },
  "BEMIDJI|MN": { lat: 47.48703, lon: -94.88269 },
  "BENSON|MN": { lat: 45.31528, lon: -95.60583 },
  "PETERSBURG|IL": { lat: 40.0114, lon: -89.8451 },
  "MARIETTA|OH": { lat: 39.4154, lon: -81.4548 },
  "NEWNAN|GA": { lat: 33.3807, lon: -84.7997 },
  "TASLEY|VA": { lat: 37.7107, lon: -75.7316 },
  "EUREKA|MT": { lat: 48.8802, lon: -115.053 },
  "THE DALLES|OR": { lat: 45.60167, lon: -121.18472 },
  "COWPENS|SC": { lat: 35.01861, lon: -81.80417 },
  "ST. GEORGE|UT": { lat: 37.10247, lon: -113.57706 },
};
const STATE_NAMES = { AL:"Alabama",AK:"Alaska",AZ:"Arizona",AR:"Arkansas",CA:"California",CO:"Colorado",CT:"Connecticut",DE:"Delaware",FL:"Florida",GA:"Georgia",HI:"Hawaii",ID:"Idaho",IL:"Illinois",IN:"Indiana",IA:"Iowa",KS:"Kansas",KY:"Kentucky",LA:"Louisiana",ME:"Maine",MD:"Maryland",MA:"Massachusetts",MI:"Michigan",MN:"Minnesota",MS:"Mississippi",MO:"Missouri",MT:"Montana",NE:"Nebraska",NV:"Nevada",NH:"New Hampshire",NJ:"New Jersey",NM:"New Mexico",NY:"New York",NC:"North Carolina",ND:"North Dakota",OH:"Ohio",OK:"Oklahoma",OR:"Oregon",PA:"Pennsylvania",RI:"Rhode Island",SC:"South Carolina",SD:"South Dakota",TN:"Tennessee",TX:"Texas",UT:"Utah",VT:"Vermont",VA:"Virginia",WA:"Washington",WV:"West Virginia",WI:"Wisconsin",WY:"Wyoming",DC:"District of Columbia" };

// "Marietta, OH" / "123 Main St, Marietta, OH 45750" → { city, st }
function cityState(q) {
  const parts = q.split(",").map((x) => x.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const st = (parts.at(-1).match(/^([A-Za-z]{2})\b/) || [])[1];
  if (!st || !STATE_NAMES[st.toUpperCase()]) return null;
  return { city: parts.at(-2).replace(/^\d+\s+/, ""), st: st.toUpperCase() };
}
async function getJSON(url) { const r = await fetch(url); if (!r.ok) throw new Error(r.status); return r.json(); }

// Nominatim allows ~1 request/second, so its calls go through a queue.
let nomChain = Promise.resolve();
function nominatim(q) {
  const run = async () => {
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const j = await getJSON(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us,ca&q=${encodeURIComponent(q)}`);
        return j[0] ? { lat: +j[0].lat, lon: +j[0].lon } : null;
      } catch (e) { await new Promise((r) => setTimeout(r, 1500)); }
    }
    return null;
  };
  const p = nomChain.then(run);
  nomChain = p.then(() => new Promise((r) => setTimeout(r, 1100)), () => {});
  return p;
}
async function photon(q) {
  try {
    const j = await getJSON(`https://photon.komoot.io/api/?limit=1&lang=en&q=${encodeURIComponent(q)}`);
    const f = j.features && j.features[0]; return f ? { lat: f.geometry.coordinates[1], lon: f.geometry.coordinates[0] } : null;
  } catch (e) { return null; }
}
async function openMeteoTown(city, st) {
  try {
    const j = await getJSON(`https://geocoding-api.open-meteo.com/v1/search?count=20&language=en&format=json&countryCode=US&name=${encodeURIComponent(city)}`);
    const hit = (j.results || []).find((r) => r.admin1 === STATE_NAMES[st]);
    return hit ? { lat: hit.latitude, lon: hit.longitude } : null;
  } catch (e) { return null; }
}
/* ---------- Shared lookup cache ----------
   Places, drive times and time zones someone already looked up are kept in the Sheet (record
   "cache") so every device reuses them instead of asking the free map services again. */
const CACHE_KEY = "nrtclog:cache";
const CACHE_CAP = { geo: 150, route: 150, tz: 120 }; // keeps the record well under a Sheet cell's 50k characters
let SHARED = (() => { try { const c = JSON.parse(localStorage.getItem(CACHE_KEY)); if (c && typeof c === "object") return c; } catch (e) {} return {}; })();
function setSharedCache(v) { SHARED = v || {}; try { localStorage.setItem(CACHE_KEY, JSON.stringify(SHARED)); } catch (e) {} }
function cacheGet(kind, key) { const e = SHARED[kind] && SHARED[kind][key]; return e ? e.v : undefined; }
function cachePut(kind, key, v) {
  const box = SHARED[kind] = Object.assign({}, SHARED[kind]);
  box[key] = { v, t: Math.round(Date.now() / 6e4) };
  const keys = Object.keys(box);
  if (keys.length > CACHE_CAP[kind]) keys.sort((a, b) => box[a].t - box[b].t).slice(0, keys.length - CACHE_CAP[kind]).forEach((k) => delete box[k]);
  setSharedCache(SHARED);
  if (window.syncSoon) syncSoon();
}
const coordKey = (p, d = 3) => `${(+p.lat).toFixed(d)},${(+p.lon).toFixed(d)}`;

async function geocode(q) {
  q = (q || "").trim(); if (!q) return null;
  const key = `nrtclog-geo:${q.toLowerCase()}`;
  const shared = cacheGet("geo", q.toLowerCase()); if (shared) return shared;
  try { const c = localStorage.getItem(key); if (c) return JSON.parse(c); } catch (e) {}
  let out = null;
  const code = (q.match(/^([A-Za-z]{3})(?:\s+airport)?$/i) || [])[1];
  const ap = code && apInfo(code);
  if (ap) out = { lat: ap.lat, lon: ap.lon };
  const cs = cityState(q);
  const isStreet = /^\d/.test(q);
  if (!out && cs && !isStreet) out = TOWN_COORDS[`${cs.city.toUpperCase()}|${cs.st}`] || null;
  if (!out && cs && !isStreet) out = await openMeteoTown(cs.city, cs.st);
  if (!out) out = await nominatim(q);
  if (!out) out = await photon(q);
  // A street address nobody can find still lands on its town
  if (!out && cs && isStreet) out = TOWN_COORDS[`${cs.city.toUpperCase()}|${cs.st}`] || (await openMeteoTown(cs.city, cs.st));
  if (out) { out = { lat: +out.lat, lon: +out.lon }; try { localStorage.setItem(key, JSON.stringify(out)); } catch (e) {} if (!ap) cachePut("geo", q.toLowerCase(), out); }
  return out;
}
// Remember a found location on the co-op / hotel itself so it's never looked up again.
function keepCoords(t, P) {
  if (!P || P.lat == null) return;
  if (P.ref.startsWith("coop:")) { const c = t.coops.find((x) => x.id === P.ref.slice(5)); if (c && c.lat == null) Object.assign(c, { lat: P.lat, lon: P.lon }); }
  if (P.ref.startsWith("meal:")) { const m = t.items.find((x) => x.id === P.ref.slice(5)); if (m && m.lat == null) Object.assign(m, { lat: P.lat, lon: P.lon }); }
  if (P.ref.startsWith("hotel:")) { const h = t.items.find((x) => x.id === P.ref.slice(6)); if (h && h.lat == null) Object.assign(h, { lat: P.lat, lon: P.lon }); }
  save();
}
async function ensureCoords(obj, q) {
  if (obj && obj.lat != null && obj.lon != null) return obj;
  const g = await geocode(q); if (g) Object.assign(obj, g); return obj;
}
function haversineMi(a, b) {
  const R = 3958.8, rad = (d) => d * Math.PI / 180;
  const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
const ROUTER_VERSION = 2;
// OSRM's public car profile drives at ~80% of posted limits, so it runs ~20% slow on interstate trips
// compared with Google. It's only the backup now, with that correction applied.
const OSRM_CORRECTION = 0.82;
async function routeTime(a, b) {
  const rk = `${coordKey(a)}|${coordKey(b)}`;
  const hit = cacheGet("route", rk); if (hit) return Object.assign({ est: false }, hit);
  const r = await routeLive(a, b);
  if (!r.est) cachePut("route", rk, { minutes: r.minutes, miles: r.miles, src: r.src });
  return r;
}
async function routeLive(a, b) {
  // 1) Valhalla (FOSSGIS — the router behind openstreetmap.org directions)
  try {
    const q = { locations: [{ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }], costing: "auto", units: "miles" };
    const j = await getJSON(`https://valhalla1.openstreetmap.de/route?json=${encodeURIComponent(JSON.stringify(q))}`);
    const sm = j.trip && j.trip.summary;
    if (sm && sm.time) return { minutes: Math.round(sm.time / 60), miles: Math.round(sm.length), est: false, src: "valhalla" };
  } catch (e) {}
  // 2) OSRM, speed-corrected
  try {
    const j = await getJSON(`https://router.project-osrm.org/route/v1/driving/${a.lon},${a.lat};${b.lon},${b.lat}?overview=false`);
    if (j.code === "Ok" && j.routes[0]) return { minutes: Math.round(j.routes[0].duration / 60 * OSRM_CORRECTION), miles: Math.round(j.routes[0].distance / 1609.34), est: false, src: "osrm" };
  } catch (e) {}
  // 3) Straight line × 1.25 for roads, at ~62 mph
  const mi = haversineMi(a, b) * 1.25;
  return { minutes: Math.round(mi / 62 * 60), miles: Math.round(mi), est: true, src: "estimate" };
}

/* ---------- Time zones ----------
   Clock times in the hub are local to where they happen. A drive that crosses a time-zone line
   (Indiana to Kansas, say) converts between the two ends' zones. */
async function tzFor(p) {
  if (!p || p.lat == null) return "";
  const k = coordKey(p, 2), hit = cacheGet("tz", k);
  if (hit) return hit;
  try {
    const j = await getJSON(`https://api.open-meteo.com/v1/forecast?latitude=${(+p.lat).toFixed(3)}&longitude=${(+p.lon).toFixed(3)}&timezone=auto&forecast_days=1`);
    if (j.timezone && /\//.test(j.timezone)) { cachePut("tz", k, j.timezone); return j.timezone; }
  } catch (e) {}
  return "";
}
function zoneParts(ms, tz) {
  const f = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  const o = {}; f.formatToParts(new Date(ms)).forEach((p) => (o[p.type] = p.value));
  return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute };
}
const tzOffsetMin = (tz, ms) => { const p = zoneParts(ms, tz); return Math.round((Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi) - Math.floor(ms / 6e4) * 6e4) / 6e4); };
// "2026-12-07" + "13:00" in America/Chicago → UTC milliseconds
function zonedToUtc(dateIso, hhmm, tz) {
  const [y, mo, d] = dateIso.split("-").map(Number), [h, mi] = hhmm.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  let ms = guess - tzOffsetMin(tz, guess) * 6e4;
  ms = guess - tzOffsetMin(tz, ms) * 6e4; // second pass settles daylight-saving edges
  return ms;
}
function utcToZoned(ms, tz) { const p = zoneParts(ms, tz); return { date: `${p.y}-${String(p.mo).padStart(2, "0")}-${String(p.d).padStart(2, "0")}`, hhmm: `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}` }; }
function tzAbbr(tz, ms) {
  for (const style of ["shortGeneric", "short"]) {
    try { const v = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: style }).formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName").value; if (v) return v; } catch (e) {}
  }
  return "";
}
const floor5 = (hhmm) => fromMin(Math.floor(toMin(hhmm) / 5) * 5);
// Leave and arrive times for a drive. Arrive-by is local at the destination, leave-at local at the start.
function driveTimes(it, arriveOverride) {
  const arrive = arriveOverride || it.arriveBy || "", leaveAt = arriveOverride ? "" : it.time || "", m = it.minutes;
  const zA = it.fromTz, zB = it.toTz, cross = !!(zA && zB && zA !== zB && it.date);
  const out = { leave: "", arrive: "", cross, aAbbr: "", bAbbr: "", byArrive: !!arrive };
  if (arrive) {
    out.arrive = arrive;
    if (m != null) out.leave = cross ? floor5(utcToZoned(zonedToUtc(it.date, arrive, zB) - m * 6e4, zA).hhmm) : fromMin(Math.floor((toMin(arrive) - m) / 5) * 5);
  } else if (leaveAt) {
    out.leave = leaveAt;
    if (m != null) out.arrive = cross ? utcToZoned(zonedToUtc(it.date, leaveAt, zA) + m * 6e4, zB).hhmm : fromMin(toMin(leaveAt) + m);
  }
  if (cross) { const noon = zonedToUtc(it.date, "12:00", zA); out.aAbbr = tzAbbr(zA, noon); out.bAbbr = tzAbbr(zB, noon); }
  return out;
}
// Fill in the start/end time zones of a drive (cheap: cached per place, shared through the Sheet)
async function zonesFor(t, it) {
  const A = resolvePlace(t, it.from), B = resolvePlace(t, it.to);
  if (!A || !B) return false;
  await Promise.all([ensureCoords(A, A.q), ensureCoords(B, B.q)]);
  const [za, zb] = await Promise.all([tzFor(A), tzFor(B)]);
  if (!za || !zb) return false;
  const changed = it.fromTz !== za || it.toTz !== zb;
  Object.assign(it, { fromTz: za, toTz: zb });
  return changed;
}

// Re-run drive times saved by the older, slower routing (skips any drive time you typed yourself),
// and fill in time zones for drives saved before the hub knew about them.
async function refreshOldDrives() {
  let changed = 0, zoned = 0;
  for (const t of DB.trips) for (const it of t.items) {
    if (it.type !== "drive") continue;
    if (!it.fromTz || !it.toTz) { try { if (await zonesFor(t, it)) zoned++; } catch (e) {} }
    if (it.manual || it.minutes == null || it.router === ROUTER_VERSION) continue;
    const A = resolvePlace(t, it.from), B = resolvePlace(t, it.to);
    if (!A || !B) continue;
    await Promise.all([ensureCoords(A, A.q), ensureCoords(B, B.q)]);
    if (A.lat == null || B.lat == null) continue;
    const r = await routeTime(A, B);
    if (r.est) continue; // routing down right now; try again next visit
    Object.assign(it, { minutes: r.minutes, miles: r.miles, est: false, router: ROUTER_VERSION });
    changed++;
  }
  if (changed || zoned) { save(); render(); }
  if (changed) toast(`Updated ${changed} drive time${changed === 1 ? "" : "s"} with better routing`);
}
