// NRTC Logistics Hub — one person's itinerary, Add to calendar (.ics), the Trips overview, mileage rate.
// Loaded in order by index.html as classic scripts (they share top-level names).
"use strict";

/* ================== Itinerary for one person ================== */
function renderPersonSel() {
  const t = trip(), sel = $("#personSel"); if (!sel) return;
  if (DB.opts.person && !t.travelers.includes(DB.opts.person)) DB.opts.person = "";
  sel.innerHTML = `<option value="">Everyone</option>` + t.travelers.map((n) => `<option ${n === DB.opts.person ? "selected" : ""}>${esc(n)}</option>`).join("");
}
$("#personSel").onchange = (e) => { DB.opts.person = e.target.value; save(); renderPreview(); };

/* ================== Add to calendar (.ics) ==================
   One event per itinerary line for whoever is picked in "Itinerary for". Times are converted to UTC
   using each place's time zone, so Outlook and phones show them right wherever you are. */
const icsEsc = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
const icsFold = (line) => { const out = []; while (line.length > 73) { out.push(line.slice(0, 73)); line = " " + line.slice(73); } out.push(line); return out.join("\r\n"); };
const pad2 = (n) => String(n).padStart(2, "0");
// a moment: {ms, tz} — tz "" means "floating" (shown at that clock time wherever the phone is)
function moment(date, hhmm, tz) {
  if (tz) return { ms: zonedToUtc(date, hhmm, tz), tz };
  const [y, mo, d] = date.split("-").map(Number), [h, mi] = hhmm.split(":").map(Number);
  return { ms: Date.UTC(y, mo - 1, d, h, mi), tz: "" };
}
const plus = (m, minutes) => ({ ms: m.ms + minutes * 6e4, tz: m.tz });
function icsTime(m) {
  const d = new Date(m.ms);
  const s = `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}00`;
  return m.tz ? `${s}Z` : s;
}
const icsDate = (iso) => iso.replace(/-/g, "");
async function zoneOfRef(t, ref) {
  const P = ref && resolvePlace(t, ref); if (!P) return "";
  await ensureCoords(P, P.q); return tzFor(P);
}
async function zoneOfAirport(code) { const a = apInfo(code); return a ? tzFor(a) : ""; }

async function buildICS(t, opts) {
  const rows = personRows(t, Object.assign({}, opts, { conf: true, addr: true })), person = viewPerson(t, opts);
  const stamp = icsTime({ ms: Date.now(), tz: "UTC" }), ev = [];
  const add = (uid, summary, start, end, detail, location, allDay) => {
    const L = ["BEGIN:VEVENT", `UID:${uid}@nrtclogistics`, `DTSTAMP:${stamp}`];
    if (allDay) { L.push(`DTSTART;VALUE=DATE:${icsDate(start)}`, `DTEND;VALUE=DATE:${icsDate(end)}`, "TRANSP:TRANSPARENT"); }
    else { L.push(`DTSTART:${icsTime(start)}`, `DTEND:${icsTime(end)}`); }
    L.push(`SUMMARY:${icsEsc(summary)}`);
    if (detail) L.push(`DESCRIPTION:${icsEsc(detail)}`);
    if (location) L.push(`LOCATION:${icsEsc(location)}`);
    L.push("END:VEVENT"); ev.push(L.map(icsFold).join("\r\n"));
  };
  for (const r of rows) {
    const it = r.item, uid = `${it.id}${r.ret ? "-ret" : ""}`;
    if (it.type === "flight") {
      const [zA, zB] = await Promise.all([zoneOfAirport(it.from), zoneOfAirport(it.to)]);
      let s = it.dep ? moment(it.date, it.dep, zA) : null, e = it.arr ? moment(it.arrDate || it.date, it.arr, zB) : null;
      if (!s && !e) continue;
      if (!s) s = plus(e, -60); if (!e) e = plus(s, 60);
      add(uid, `Flight ${[it.airline, it.number].filter(Boolean).join(" ")} ${it.from} → ${it.to}`.replace(/\s+/g, " "), s, e, r.detail, it.from ? `${it.from} airport` : "");
    } else if (it.type === "drive") {
      if (!r.time || it.minutes == null) continue;
      const leave = fromMin(Math.round(r.key)), s = moment(it.date, leave, it.fromTz || "");
      add(uid, r.what, s, plus(s, it.minutes), r.detail, "");
    } else if (it.type === "meeting") {
      const zone = await zoneOfRef(t, it.loc);
      const P = it.loc && resolvePlace(t, it.loc), where = it.loc && it.loc.ref === "custom" ? it.loc.label : P ? (P.address || P.long) : "";
      if (!it.start) { add(uid, r.what, it.date, addDays(it.date, 1), r.detail, where, true); continue; }
      const s = moment(it.date, it.start, zone);
      add(uid, r.what, s, it.end ? moment(it.date, it.end, zone) : plus(s, 60), r.detail, where);
    } else if (it.type === "meal") {
      if (!it.time) continue;
      const zone = it.lat != null ? await tzFor(it) : "", s = moment(it.date, it.time, zone);
      add(uid, r.what, s, plus(s, { Breakfast: 45, Lunch: 60, Dinner: 90, Coffee: 30 }[it.kind] || 60), r.detail, it.address || it.place || "");
    } else if (it.type === "hotel") {
      add(uid, r.what, it.date, it.outDate && it.outDate > it.date ? it.outDate : addDays(it.date, 1), r.detail, it.address || it.city || "", true);
    } else if (it.type === "rental") {
      const hhmm = r.ret ? it.retTime : it.time; if (!hhmm) continue;
      const s = moment(r.date, hhmm, await zoneOfAirport(it.pickup));
      add(uid, r.what, s, plus(s, 30), r.detail, it.pickup ? `${it.pickup} airport` : "");
    } else if (it.type === "note") {
      if (!it.time) continue;
      const s = moment(it.date, it.time, ""); add(uid, it.text, s, plus(s, 15), "", "");
    }
  }
  const name = `${(t.title || "Trip").replace(/\s*\(example\)$/i, "")}${person ? ` (${first(person)})` : ""}`;
  return { count: ev.length, name, text: ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Herd Co//NRTC Logistics Hub//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${icsEsc(name)}`, ...ev, "END:VCALENDAR"].join("\r\n") + "\r\n" };
}
$("#icsBtn").onclick = async () => {
  const b = $("#icsBtn"); b.disabled = true; b.textContent = "Building…";
  try {
    const cal = await buildICS(trip(), DB.opts);
    if (!cal.count) { toast("Nothing with a time to put on a calendar yet"); return; }
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([cal.text], { type: "text/calendar;charset=utf-8" }));
    a.download = `${cal.name.replace(/[^\w\s().-]+/g, "").trim() || "trip"}.ics`;
    document.body.appendChild(a); a.click(); a.remove();
    toast(`Calendar file with ${cal.count} event${cal.count === 1 ? "" : "s"} downloaded. Open it to add to Outlook.`);
  } catch (e) { toast("Couldn't build the calendar file"); }
  finally { b.disabled = false; b.textContent = "Add to calendar"; }
};

/* ================== Trips overview ================== */
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
function tripSpan(t) { const ds = buildRows(t).map((r) => r.date).filter(Boolean).sort(); return ds.length ? { start: ds[0], end: ds.at(-1) } : null; }
function renderTrips() {
  const today = todayIso(), horizon = addDays(today, 14);
  const list = DB.trips.map((t) => ({ t, span: tripSpan(t) }));
  const upcoming = list.filter((x) => !x.span || x.span.end >= today).sort((a, b) => (a.span ? a.span.start : "9999").localeCompare(b.span ? b.span.start : "9999"));
  const past = list.filter((x) => x.span && x.span.end < today).sort((a, b) => b.span.start.localeCompare(a.span.start));
  // who's traveling in the next two weeks, and where
  const road = {};
  list.filter((x) => x.span && !isSample(x.t) && x.span.end >= today && x.span.start <= horizon).forEach(({ t, span }) => {
    const where = t.coops.filter((c) => c.name).map((c) => c.name).join(", ") || t.title || "Trip";
    t.travelers.forEach((n) => (road[n] = road[n] || []).push(`${fmtShort(span.start)}${span.end !== span.start ? `–${fmtShort(span.end)}` : ""} · ${where}`));
  });
  const card = ({ t, span }) => `<div class="trip-card${t.id === DB.current ? " cur" : ""}" data-trip="${t.id}" role="button" tabindex="0">
      <b>${esc(t.title || "Untitled trip")}</b><span class="when">${span ? esc(tripRange(t)) : "No dates yet"}</span>
      <span class="sub">${esc([t.coops.filter((c) => c.name).map((c) => c.name).join(", "), t.travelers.map(first).join(", ")].filter(Boolean).join(" · ") || "No co-op or travelers yet")}</span></div>`;
  const names = Object.keys(road).sort();
  $("#tripsBody").innerHTML =
    `<div class="group-label" style="margin-top:0">On the road, next 14 days</div>` +
    (names.length ? `<table class="road">${names.map((n) => `<tr><td>${esc(n)}</td><td>${road[n].map(esc).join("<br>")}</td></tr>`).join("")}</table>` : `<p class="hint" style="margin:0 0 14px">No one has travel planned in the next two weeks.</p>`) +
    `<div class="group-label">Upcoming</div>` + (upcoming.length ? upcoming.map(card).join("") : `<p class="hint">No upcoming trips.</p>`) +
    (past.length ? `<details style="margin-top:10px"><summary class="group-label" style="cursor:pointer">Past trips (${past.length})</summary>${past.map(card).join("")}</details>` : "");
}
$("#tripsBtn").onclick = () => { renderTrips(); $("#tripsDlg").showModal(); };
$("#tripsBody").addEventListener("click", (e) => { const c = e.target.closest("[data-trip]"); if (!c) return; DB.current = c.dataset.trip; $("#tripsDlg").close(); commit(); });
$("#tripsBody").addEventListener("keydown", (e) => { if (e.key === "Enter") { const c = e.target.closest("[data-trip]"); if (c) c.click(); } });
$("#tripsNew").onclick = () => { $("#tripsDlg").close(); $("#newTrip").click(); };
$("#tripsDup").onclick = () => { $("#tripsDlg").close(); $("#dupTrip").click(); };

/* ================== Mileage rate (per device) ================== */
$("#teamBtn").addEventListener("click", () => { $("#mileRate").value = mileRate().toFixed(3).replace(/0$/, ""); });
$("#mileRate").addEventListener("change", (e) => {
  const v = parseFloat(e.target.value);
  if (v > 0) localStorage.setItem(MILE_RATE_KEY, String(v)); else localStorage.removeItem(MILE_RATE_KEY);
  renderPreview();
});
