// NRTC Logistics Hub — Rendering, trip editing, copy/print, item forms.
// Loaded in order by index.html as classic scripts (they share top-level names).
"use strict";
/* ================== Rendering ================== */
function render() {
  const t = trip();
  // trip picker
  $("#tripSelect").innerHTML = DB.trips.map((x) => `<option value="${x.id}" ${x.id === t.id ? "selected" : ""}>${esc(x.title || "Untitled trip")}${tripRange(x) ? ` · ${esc(tripRange(x))}` : ""}</option>`).join("");
  if (document.activeElement !== $("#tripTitle")) $("#tripTitle").value = t.title;
  if (document.activeElement !== $("#tripNotes")) $("#tripNotes").value = t.notes || "";
  $("#tripDates").textContent = (tripRange(t) || "Dates fill in from the itinerary.") + lastEditLine(t);
  renderCoops(); renderRoster(); renderItems(); renderPreview();
}

function renderCoops() {
  const t = trip();
  $("#coops").innerHTML = t.coops.map((c, i) => `
    <div class="coop-row" data-i="${i}">
      <div class="grid4">
        <div><label class="f">Co-op</label><input class="f-input" data-k="name" list="coopList" value="${esc(c.name)}" placeholder="Start typing…"></div>
        <div><label class="f">HQ town</label><input class="f-input" data-k="town" value="${esc(c.town)}"></div>
        <div><label class="f">State</label><input class="f-input" data-k="state" value="${esc(c.state)}" maxlength="2" style="text-transform:uppercase"></div>
        <button class="btn ghost sm danger" data-rm title="Remove">✕</button>
      </div>
      <div style="margin-top:6px;display:grid;grid-template-columns:minmax(0,1.6fr) minmax(0,1fr);gap:8px">
        <input class="f-input" data-k="address" value="${esc(c.address)}" placeholder="HQ street address (optional, sharper drive times)">
        <select class="f-input" data-k="rbm" title="RBM for this co-op">
          <option value="__auto" ${c.rbmManual ? "" : "selected"}>RBM: ${esc(rbmForState(c.state) || "pick one")}${c.state ? " · auto" : ""}</option>
          ${rbmNames().map((n) => `<option value="${esc(n)}" ${c.rbmManual && c.rbm === n ? "selected" : ""}>RBM: ${esc(n)}</option>`).join("")}
          <option value="" ${c.rbmManual && !c.rbm ? "selected" : ""}>No RBM</option>
        </select>
      </div>
    </div>`).join("") || `<p class="hint" style="margin:0 0 8px">No co-op yet.</p>`;
}
function renderRoster() {
  const t = trip();
  const groups = {};
  TEAM.forEach((p) => (groups[p.group || "Other"] = groups[p.group || "Other"] || []).push(p));
  // keep anyone on the trip who isn't in the team list
  t.travelers.filter((n) => !TEAM.some((p) => p.name === n)).forEach((n) => (groups.Guests = groups.Guests || []).push({ name: n }));
  $("#roster").innerHTML = Object.entries(groups).map(([g, ps]) => `
    <div class="group-label">${esc(g)}</div>
    <div class="chips">${ps.map((p) => `<span class="chip" role="button" tabindex="0" data-person="${esc(p.name)}" aria-pressed="${t.travelers.includes(p.name)}">${esc(p.name)}${p.town ? `<small>${esc(p.town.split(",")[0])}</small>` : ""}</span>`).join("")}</div>`).join("");
}
function renderItems() {
  const t = trip();
  const days = groupDays(buildRows(t, { conf: true, addr: true, miles: true }));
  if (!days.length) { $("#items").innerHTML = `<p class="empty">Add the first flight, hotel or meeting above.</p>`; return; }
  $("#items").innerHTML = days.map((d) => `
    <div class="day"><div class="day-h">${esc(fmtDay(d.date))}</div>
    ${d.rows.map((r) => `
      <div class="it">
        <span class="ico">${icon(r.type)}</span>
        <span class="t">${esc(r.time)}</span>
        <span class="w" data-edit="${r.item.id}">${r.who ? `<span class="who">${esc(r.who)}</span><span class="sep">·</span>` : ""}${esc(r.what)}${r.detail ? `<div class="d">${esc(r.detail)}</div>` : ""}</span>
        <span class="acts">
          <button class="btn ghost sm" data-move="-1" data-id="${r.item.id}" title="Move earlier (untimed items)">↑</button>
          <button class="btn ghost sm" data-move="1" data-id="${r.item.id}" title="Move later (untimed items)">↓</button>
          <button class="btn ghost sm" data-edit="${r.item.id}" title="Edit">✎</button>
        </span>
      </div>`).join("")}
    </div>`).join("");
}
function renderPreview() {
  const t = trip(), o = DB.opts;
  renderPersonSel();
  $("#optConf").checked = o.conf; $("#optAddr").checked = o.addr; $("#optMiles").checked = o.miles;
  $("#paper").innerHTML = emailHTML(t, o);
  $("#subject").textContent = subjectLine(t, o);
}
function commit() { save(); render(); }

/* ================== Trip-level events ================== */
$("#tripSelect").onchange = (e) => { DB.current = e.target.value; commit(); };
$("#newTrip").onclick = () => { const t = newTrip(); DB.trips.unshift(t); DB.current = t.id; commit(); $("#tripTitle").focus(); };
$("#dupTrip").onclick = () => {
  const t = clone(trip()); t.id = uid(); t.title = `${t.title || "Trip"} (copy)`;
  const map = {}; t.items.forEach((i) => { const n = uid(); map[i.id] = n; i.id = n; });
  t.items.forEach((i) => ["from", "to", "loc"].forEach((k) => { if (i[k] && i[k].ref && i[k].ref.startsWith("hotel:")) i[k].ref = `hotel:${map[i[k].ref.slice(6)] || ""}`; }));
  DB.trips.unshift(t); DB.current = t.id; commit(); toast("Trip duplicated. Update the dates.");
};
$("#delTrip").onclick = () => {
  if (!confirm(`Delete "${trip().title || "Untitled trip"}"? This can't be undone.`)) return;
  DB.trips = DB.trips.filter((x) => x.id !== DB.current);
  if (!DB.trips.length) DB.trips.push(newTrip());
  DB.current = DB.trips[0].id; commit();
};
$("#tripTitle").oninput = (e) => { trip().title = e.target.value; save(); renderPreview(); $("#tripSelect").selectedOptions[0].textContent = e.target.value || "Untitled trip"; };
$("#tripNotes").oninput = (e) => { trip().notes = e.target.value; save(); renderPreview(); };
$("#addCoop").onclick = () => { trip().coops.push({ id: newCoopId(), name: "", town: "", state: "", address: "" }); commit(); const ins = $$("#coops input[data-k=name]"); ins.at(-1)?.focus(); };
$("#coops").addEventListener("input", (e) => {
  const row = e.target.closest(".coop-row"); if (!row) return;
  const c = trip().coops[+row.dataset.i], k = e.target.dataset.k;
  if (k === "rbm") { if (e.target.value === "__auto") { c.rbmManual = false; delete c.rbm; } else { c.rbmManual = true; c.rbm = e.target.value; } save(); renderPreview(); return; }
  c[k] = k === "state" ? e.target.value.toUpperCase() : e.target.value;
  if (k === "name") { const hit = COOP_DIR.find((x) => x.name.toLowerCase() === c.name.toLowerCase()); if (hit) { c.town = hit.town; c.state = hit.state; $("[data-k=town]", row).value = hit.town; $("[data-k=state]", row).value = hit.state; } }
  if (k !== "name") { delete c.lat; delete c.lon; }
  save(); renderPreview();
});
$("#coops").addEventListener("change", async (e) => {
  const row = e.target.closest(".coop-row"); if (!row) return;
  const c = trip().coops[+row.dataset.i];
  if (c.lat == null) { await ensureCoords(c, c.address || [c.town, c.state].filter(Boolean).join(", ")); save(); }
  render();
});
$("#coops").addEventListener("click", (e) => {
  if (!e.target.closest("[data-rm]")) return;
  const i = +e.target.closest(".coop-row").dataset.i; trip().coops.splice(i, 1); commit();
});
$("#roster").addEventListener("click", (e) => togglePerson(e.target.closest("[data-person]")));
$("#roster").addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); togglePerson(e.target.closest("[data-person]")); } });
function togglePerson(el) {
  if (!el) return; const t = trip(), n = el.dataset.person;
  t.travelers = t.travelers.includes(n) ? t.travelers.filter((x) => x !== n) : [...t.travelers, n];
  commit();
}
$("#items").addEventListener("click", (e) => {
  const ed = e.target.closest("[data-edit]"); if (ed) return openItem(trip().items.find((i) => i.id === ed.dataset.edit));
  const mv = e.target.closest("[data-move]"); if (!mv) return;
  const t = trip(), i = t.items.findIndex((x) => x.id === mv.dataset.id), dir = +mv.dataset.move, it = t.items[i];
  // swap with the nearest item on the same day in that direction
  for (let j = i + dir; j >= 0 && j < t.items.length; j += dir) {
    if (t.items[j].date === it.date) { [t.items[i], t.items[j]] = [t.items[j], t.items[i]]; break; }
  }
  commit();
});
["optConf", "optAddr", "optMiles"].forEach((id) => ($("#" + id).onchange = (e) => { DB.opts[{ optConf: "conf", optAddr: "addr", optMiles: "miles" }[id]] = e.target.checked; save(); renderPreview(); }));

/* ================== Copy / print ================== */
async function copyRich(html, text) {
  try {
    if (navigator.clipboard && window.ClipboardItem) {
      const doc = `<html><head><meta charset="utf-8"></head><body><!--StartFragment-->${html}<!--EndFragment--></body></html>`;
      await navigator.clipboard.write([new ClipboardItem({ "text/html": new Blob([doc], { type: "text/html" }), "text/plain": new Blob([text], { type: "text/plain" }) })]);
      return true;
    }
  } catch (e) {}
  // Fallback: select the rendered preview and copy it
  const sel = getSelection(), range = document.createRange();
  range.selectNodeContents($("#paper")); sel.removeAllRanges(); sel.addRange(range);
  const ok = document.execCommand("copy"); sel.removeAllRanges(); return ok;
}
async function copyPlain(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) {
    const ta = document.createElement("textarea"); ta.value = text; document.body.appendChild(ta); ta.select();
    const ok = document.execCommand("copy"); ta.remove(); return ok;
  }
}
$("#copyHtml").onclick = async () => toast((await copyRich(emailHTML(trip(), DB.opts), emailText(trip(), DB.opts))) ? "Copied. Paste into Outlook." : "Couldn't copy. Try Ctrl+C on the preview.");
$("#copyText").onclick = async () => toast((await copyPlain(emailText(trip(), DB.opts))) ? "Plain text copied" : "Couldn't copy");
$("#copySubject").onclick = async () => toast((await copyPlain(subjectLine(trip(), DB.opts))) ? "Subject copied" : "Couldn't copy");
$("#printBtn").onclick = () => window.print();

/* ================== Item dialog ================== */
let EDITING = null;
const travelerPicker = (sel, label = "Who") => {
  const t = trip(); if (!t.travelers.length) return `<p class="hint">Pick travelers on the trip first to tag who this is for.</p>`;
  const set = sel === "none" ? [] : sel && sel.length ? sel : t.travelers;
  return `<div class="field"><label class="f">${label} <span style="font-weight:400">(all selected = everyone, no name tag in the email)</span></label>
    <div class="chips" id="fWho">${t.travelers.map((n) => `<span class="chip" role="button" tabindex="0" data-n="${esc(n)}" aria-pressed="${set.includes(n)}">${esc(n)}</span>`).join("")}</div></div>`;
};
const inp = (id, label, val = "", attrs = "") => `<div class="field"><label class="f" for="${id}">${label}</label><input class="f-input" id="${id}" value="${esc(val)}" ${attrs}></div>`;
function placeSelect(id, label, cur) {
  const t = trip(), ps = placesFor(t);
  const curRef = cur && cur.ref;
  let opts = `<option value="">Choose…</option>`;
  opts += ps.map((p) => `<option value="${esc(p.ref)}" ${p.ref === curRef ? "selected" : ""}>${esc(p.long)}</option>`).join("");
  if (curRef && curRef.startsWith("ap:") && !ps.some((p) => p.ref === curRef)) opts += `<option value="${esc(curRef)}" selected>${esc(curRef.slice(3))}</option>`;
  opts += `<option value="ap:" >Another airport…</option><option value="custom" ${curRef === "custom" ? "selected" : ""}>Other address…</option>`;
  return `<div class="field"><label class="f" for="${id}">${label}</label><select class="f-input" id="${id}">${opts}</select>
    <input class="f-input" id="${id}X" style="margin-top:6px;${curRef === "custom" ? "" : "display:none"}" placeholder="Address or City, ST" value="${esc(cur && cur.ref === "custom" ? cur.label : "")}">
    <input class="f-input" id="${id}A" style="margin-top:6px;display:none;text-transform:uppercase" list="apList" maxlength="3" placeholder="Airport code"></div>`;
}
function lastDate() { const r = buildRows(trip()); return r.length ? r.at(-1).date : new Date().toISOString().slice(0, 10); }

function openItem(it, type, asNew) {
  const isNew = !it || !!asNew; const t = trip();
  const fresh = !it; // brand-new blank item (not one pre-filled from a confirmation)
  it = it ? clone(it) : { id: uid(), type, date: lastDate(), travelers: [] };
  EDITING = { it, isNew };
  type = it.type;
  $("#dlgTitle").textContent = `${isNew ? "Add" : "Edit"} ${TYPES[type].label.toLowerCase()}`;
  $("#dlgDelete").style.visibility = isNew ? "hidden" : "visible";
  let b = "";
  if (type === "flight") {
    if (fresh && t.travelers.length === 1) it.from = homeOf(t.travelers[0]);
    b += travelerPicker(fresh && t.travelers.length > 1 ? "none" : it.travelers, "Who's on this flight");
    b += `<div class="grid2">${inp("fAirline", "Airline", it.airline, 'placeholder="e.g. Southwest"')}${inp("fNumber", "Flight #", it.number, 'placeholder="e.g. 1234"')}</div>`;
    b += `<div class="grid2">${inp("fFrom", "From", it.from, 'list="apList" maxlength="3" style="text-transform:uppercase" placeholder="IND"')}${inp("fTo", "To", it.to, 'list="apList" maxlength="3" style="text-transform:uppercase" placeholder="DEN"')}</div>`;
    b += `<div class="grid3">${inp("fDate", "Date", it.date, 'type="date" required')}${inp("fDep", "Departs", it.dep, 'type="time"')}${inp("fArr", "Lands", it.arr, 'type="time"')}</div>`;
    b += `<div class="grid2"><div class="field"><label class="f" for="fDir">Show in email as</label><select class="f-input" id="fDir">
      ${[["auto", "Auto (by home airport)"], ["in", "Arrival: “Land DEN”"], ["out", "Departure: “Leave DEN”"], ["conn", "Full leg: “Fly A → B”"]].map(([v, l]) => `<option value="${v}" ${it.dir === v ? "selected" : ""}>${l}</option>`).join("")}</select></div>
      ${inp("fConf", "Confirmation #", it.conf)}</div>`;
    b += `<p class="hint" id="fDirHint"></p>`;
  } else if (type === "rental") {
    const lastLand = buildRows(t).filter((r) => r.type === "flight" && r.what.startsWith("Land")).at(-1);
    if (fresh) { it.driver = t.travelers.find((n) => n === "Levi McNeely") || t.travelers[0] || ""; it.pickup = lastLand ? lastLand.what.slice(5) : ""; if (lastLand) it.date = lastLand.date; }
    b += `<div class="grid2"><div class="field"><label class="f" for="fDriver">Who has the car</label><select class="f-input" id="fDriver">${(t.travelers.length ? t.travelers : [it.driver || ""]).map((n) => `<option ${n === it.driver ? "selected" : ""}>${esc(n)}</option>`).join("")}</select></div>
      ${inp("fCompany", "Company", it.company, 'placeholder="National, Enterprise…"')}</div>`;
    b += `<div class="grid3">${inp("fPickup", "Pick up at", it.pickup, 'list="apList" maxlength="3" style="text-transform:uppercase"')}${inp("fDate", "Pick-up date", it.date, 'type="date" required')}${inp("fTime", "Time (optional)", it.time, 'type="time"')}</div>`;
    b += `<div class="grid3">${inp("fRetDate", "Return date (optional)", it.retDate, 'type="date"')}${inp("fRetTime", "Return time", it.retTime, 'type="time"')}${inp("fConf", "Confirmation #", it.conf)}</div>`;
    b += `<p class="hint">With no time, it slots in right after the driver lands.</p>`;
  } else if (type === "hotel") {
    if (fresh) it.outDate = addDays(it.date, 1);
    b += inp("fName", "Hotel", it.name, 'placeholder="Hilton Garden Inn Hays" required');
    b += `<div class="grid2">${inp("fCity", "City, ST", it.city, 'placeholder="Hays, KS"')}${inp("fConf", "Confirmation #", it.conf)}</div>`;
    b += inp("fAddress", "Street address (optional)", it.address, 'placeholder="Used in the email and for drive times"');
    b += `<div class="grid2">${inp("fDate", "Check in", it.date, 'type="date" required')}${inp("fOut", "Check out", it.outDate, 'type="date"')}</div>`;
    b += travelerPicker(it.travelers, "Who's staying");
  } else if (type === "drive") {
    if (fresh) {
      // Guess: from the last place we were, to the next place we need to be
      const ps = placesFor(t), rows = buildRows(t);
      const lastLand = rows.filter((r) => r.date === it.date && r.type === "flight" && r.what.startsWith("Land")).at(-1);
      if (lastLand) it.from = { ref: `ap:${lastLand.what.slice(5)}` };
      const hotelToday = t.items.find((x) => x.type === "hotel" && x.date === it.date);
      if (hotelToday) it.to = { ref: `hotel:${hotelToday.id}` }; else if (ps.find((p) => p.ref.startsWith("coop:"))) it.to = { ref: ps.find((p) => p.ref.startsWith("coop:")).ref };
    }
    b += `<div class="grid2">${placeSelect("fFromP", "From", it.from)}${placeSelect("fToP", "To", it.to)}</div>`;
    b += `<div class="grid3" style="align-items:end">${inp("fDate", "Date", it.date, 'type="date" required')}<div class="field"><div class="seg" id="fMode" role="group" aria-label="Time type">
        <button type="button" data-mode="arrive" aria-pressed="${!(it.time && !it.arriveBy)}">Arrive by</button><button type="button" data-mode="leave" aria-pressed="${!!(it.time && !it.arriveBy)}">Leave at</button></div>
        <input class="f-input" id="fArrive" type="time" value="${esc(it.arriveBy || it.time || "")}" aria-label="Time"></div>${inp("fDur", "Drive time", it.manual ? fmtDur(it.minutes).replace(" hrs", "h").replace(" hr", "h").replace(" min", "m") : "", 'placeholder="auto"')}</div>`;
    b += `<div class="calc" id="fCalc">${it.minutes != null ? `${it.manual ? "Manual" : "Calculated"}: ${fmtDur(it.minutes)}${it.miles ? ` · ${it.miles} mi` : ""}` : "Pick both ends and the drive time calculates itself."}</div>`;
    b += `<p class="hint" id="fLeave"></p>`;
    b += `<p class="hint">Flip between "Arrive by" and "Leave at" and the hub works out the other one. Driving to a meeting? Arrive by fills in 15 minutes before the start. Type a drive time to override, e.g. 4:30.</p>`;
    b += inp("fNote", "Note (optional)", it.note, 'placeholder="e.g. stop for lunch in Colby"');
    b += travelerPicker(it.travelers, "Who's in the car");
  } else if (type === "meeting") {
    if (fresh) { const c = t.coops.find((x) => x.name); if (c) { it.coop = c.name; it.loc = { ref: `coop:${c.id}` }; } }
    b += inp("fTitle", "Meeting", it.title, 'placeholder="WCE Executive Readout" required');
    b += `<div class="grid3">${inp("fDate", "Date", it.date, 'type="date" required')}${inp("fStart", "Start", it.start, 'type="time"')}${inp("fEnd", "End", it.end, 'type="time"')}</div>`;
    b += inp("fCoop", "Co-op we're meeting with", it.coop, 'list="coopList"');
    b += placeSelect("fLocP", "Where", it.loc && it.loc.ref ? it.loc : { ref: "" });
    b += `<label style="display:flex;gap:6px;align-items:center;font-size:13.5px;margin:-2px 0 10px"><input type="checkbox" id="fVirtual" ${it.virtual ? "checked" : ""}> Virtual / Teams</label>`;
    b += inp("fNote", "Note (optional)", it.note);
    b += travelerPicker(it.travelers, "Who's attending");
  } else if (type === "meal") {
    if (fresh) it.kind = "Lunch";
    b += `<div class="field"><label class="f">Meal</label><div class="chips" id="fKind">${["Breakfast", "Lunch", "Dinner", "Coffee", "Other"].map((k) => `<span class="chip" role="button" tabindex="0" data-k="${k}" aria-pressed="${(it.kind || "Other") === k || (k === "Other" && !["Breakfast", "Lunch", "Dinner", "Coffee"].includes(it.kind))}">${k}</span>`).join("")}</div>
      <input class="f-input" id="fKindX" style="margin-top:6px;${["Breakfast", "Lunch", "Dinner", "Coffee"].includes(it.kind) ? "display:none" : ""}" value="${esc(["Breakfast", "Lunch", "Dinner", "Coffee"].includes(it.kind) ? "" : it.kind || "")}" placeholder="e.g. Team happy hour"></div>`;
    b += `<div class="grid2">${inp("fPlace", "Where", it.place, 'placeholder="Restaurant name (or TBD)"')}${inp("fRes", "Reservation (optional)", it.res, 'placeholder="7:00 PM under McNeely, party of 4"')}</div>`;
    b += inp("fAddress", "Address (optional)", it.address, 'placeholder="Shows in the email and works as a drive stop"');
    b += `<div class="grid2">${inp("fDate", "Date", it.date, 'type="date" required')}${inp("fTime", "Time (optional)", it.time, 'type="time"')}</div>`;
    b += inp("fNote", "Note (optional)", it.note, 'placeholder="e.g. hosted by the co-op GM"');
    b += travelerPicker(it.travelers, "Who's going");
  } else if (type === "note") {
    b += inp("fText", "Note", it.text, 'required placeholder="e.g. Dinner with the GM at 6"');
    b += `<div class="grid2">${inp("fDate", "Date", it.date, 'type="date" required')}${inp("fTime", "Time (optional)", it.time, 'type="time"')}</div>`;
    b += travelerPicker(it.travelers);
  }
  $("#dlgBody").innerHTML = b;
  wireDialog(it);
  $("#itemDlg").showModal();
}

const driveMode = () => ($("#fMode [aria-pressed=true]") || {}).dataset?.mode || "arrive";
function readWho() { const el = $("#fWho"); if (!el) return []; const on = $$(".chip[aria-pressed=true]", el).map((c) => c.dataset.n); return on.length === trip().travelers.length ? [] : on; }
function readPlace(id) {
  const v = $("#" + id).value;
  if (v === "custom") { const label = $("#" + id + "X").value.trim(); return label ? { ref: "custom", label } : null; }
  if (v === "ap:") { const c = $("#" + id + "A").value.trim().toUpperCase(); return c ? { ref: `ap:${c}` } : null; }
  return v ? { ref: v } : null;
}

function wireDialog(it) {
  const body = $("#dlgBody");
  const kind = $("#fKind");
  if (kind) kind.addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (!c) return; $$(".chip", kind).forEach((x) => x.setAttribute("aria-pressed", x === c)); $("#fKindX").style.display = c.dataset.k === "Other" ? "" : "none"; });
  const who = $("#fWho");
  if (who) who.addEventListener("click", (e) => { const c = e.target.closest(".chip"); if (!c) return; c.setAttribute("aria-pressed", c.getAttribute("aria-pressed") !== "true"); onFlightChange(); });
  $$("select[id$=P]", body).forEach((s) => s.addEventListener("change", () => {
    $("#" + s.id + "X").style.display = s.value === "custom" ? "" : "none";
    $("#" + s.id + "A").style.display = s.value === "ap:" ? "" : "none";
    if (s.value === "ap:") $("#" + s.id + "A").focus();
    recalcDrive();
  }));
  $$("input[id$=PX], input[id$=PA]", body).forEach((x) => x.addEventListener("change", recalcDrive));
  if ($("#fDur")) $("#fDur").addEventListener("input", () => { const m = parseDur($("#fDur").value); const c = $("#fCalc"); if (m != null) { c.className = "calc"; c.textContent = `Manual: ${fmtDur(m)}`; } else if (!$("#fDur").value) recalcDrive(); });
  if ($("#fFrom")) $("#fFrom").addEventListener("input", () => (EDITING.fromTouched = true));
  ["fFrom", "fTo", "fDir"].forEach((id) => $("#" + id) && $("#" + id).addEventListener("input", onFlightChange));
  function onFlightChange() {
    if (it.type !== "flight") return;
    const tmp = { travelers: readWho().length ? readWho() : trip().travelers, from: $("#fFrom").value, to: $("#fTo").value, dir: $("#fDir").value, arr: $("#fArr").value };
    if (EDITING.isNew && !EDITING.fromTouched && (!$("#fFrom").value || EDITING.autoFrom === $("#fFrom").value) && readWho().length === 1 && homeOf(readWho()[0])) $("#fFrom").value = EDITING.autoFrom = homeOf(readWho()[0]);
    const d = flightDir(tmp), to = (tmp.to || "").toUpperCase(), from = (tmp.from || "").toUpperCase();
    $("#fDirHint").textContent = !from && !to ? "" : d === "in" ? `Shows as “Land ${to || "…"}” at the landing time.` : d === "out" ? `Shows as “Leave ${from || "…"}” at the departure time.` : `Shows as “Fly ${from} → ${to}”.`;
  }
  onFlightChange();
  let seq = 0;
  async function recalcDrive() {
    if (it.type !== "drive" || ($("#fDur").value && parseDur($("#fDur").value) != null)) return;
    const t = trip(), c = $("#fCalc"), my = ++seq;
    const A = resolvePlace(t, readPlace("fFromP")), B = resolvePlace(t, readPlace("fToP"));
    if (!A || !B) { c.className = "calc"; c.textContent = "Pick both ends and the drive time calculates itself."; it.minutes = null; return; }
    c.className = "calc"; c.textContent = "Calculating…";
    await Promise.all([ensureCoords(A, A.q), ensureCoords(B, B.q)]);
    [A, B].forEach((P) => keepCoords(t, P));
    if (my !== seq) return;
    if (A.lat == null || B.lat == null) { c.className = "calc warn"; c.textContent = `Couldn't find ${A.lat == null ? A.long : B.long} on the map. Check the town/state spelling, add a street address, or just type the drive time.`; it.minutes = null; return; }
    const r = await routeTime(A, B);
    if (my !== seq) return;
    Object.assign(it, { minutes: r.minutes, miles: r.miles, est: r.est, router: ROUTER_VERSION });
    const [za, zb] = await Promise.all([tzFor(A), tzFor(B)]);
    if (my !== seq) return;
    if (za && zb) Object.assign(it, { fromTz: za, toTz: zb });
    c.className = "calc"; c.textContent = `${r.est ? "Estimated (routing service unreachable)" : "Calculated"}: ${fmtDur(r.minutes)} · ${r.miles} mi`;
    updateLeave();
  }
  // Pre-fill "Arrive by" 15 min before a meeting at the destination that day
  function suggestArrive() {
    if (it.type !== "drive" || $("#fArrive").value || driveMode() !== "arrive") return;
    const to = readPlace("fToP"), date = $("#fDate").value;
    if (!to || to.ref === "custom") return;
    const m = trip().items.filter((x) => x.date === date && (x.start || x.time) && (x.type === "meeting" || x.type === "meal") && destRef(x) === to.ref).sort((a, b) => (a.start || a.time).localeCompare(b.start || b.time))[0];
    if (m) $("#fArrive").value = fromMin(toMin(m.start || m.time) - (m.type === "meal" ? 5 : 15));
  }
  function updateLeave() {
    const el = $("#fLeave"); if (!el) return;
    const val = $("#fArrive").value, manual = parseDur($("#fDur").value);
    const mins = manual != null ? manual : it.minutes;
    if (!val || mins == null) { el.innerHTML = ""; return; }
    const arriveMode = driveMode() === "arrive";
    const dt = driveTimes({ date: $("#fDate").value, minutes: mins, fromTz: it.fromTz, toTz: it.toTz, arriveBy: arriveMode ? val : "", time: arriveMode ? "" : val });
    const z = (abbr) => (dt.cross ? ` ${abbr}` : "");
    el.innerHTML = (arriveMode
      ? `<b style="color:var(--breeze)">Leave at ${fmtTime(dt.leave)}${z(dt.aAbbr)}</b> to arrive by ${fmtTime(dt.arrive)}${z(dt.bAbbr)}`
      : `<b style="color:var(--breeze)">Arrive ~${fmtTime(dt.arrive)}${z(dt.bAbbr)}</b> leaving at ${fmtTime(dt.leave)}${z(dt.aAbbr)}`)
      + (dt.cross ? ` <span style="color:var(--muted)">(crosses into ${dt.bAbbr})</span>` : "");
  }
  if (it.type === "drive") {
    $("#fMode").addEventListener("click", (e) => {
      const b = e.target.closest("[data-mode]"); if (!b) return;
      $$("#fMode [data-mode]").forEach((x) => x.setAttribute("aria-pressed", x === b));
      suggestArrive(); updateLeave();
    });
    ["fArrive", "fDur"].forEach((id) => $("#" + id).addEventListener("input", updateLeave));
    ["fToP", "fDate"].forEach((id) => $("#" + id).addEventListener("change", () => { suggestArrive(); updateLeave(); }));
    suggestArrive(); updateLeave();
  }
  EDITING.recalc = recalcDrive;
  if (it.type === "drive" && !it.manual && it.minutes == null) recalcDrive();
}

$("#itemForm").addEventListener("submit", async (e) => {
  if (e.submitter && e.submitter.value === "cancel") return;
  e.preventDefault();
  const { it, isNew } = EDITING, t = trip(), v = (id) => ($("#" + id) ? $("#" + id).value.trim() : "");
  it.date = v("fDate");
  if (it.type === "flight") Object.assign(it, { travelers: readWho(), airline: v("fAirline"), number: v("fNumber"), from: v("fFrom").toUpperCase(), to: v("fTo").toUpperCase(), dep: v("fDep"), arr: v("fArr"), dir: v("fDir"), conf: v("fConf") });
  if (it.type === "rental") Object.assign(it, { driver: v("fDriver"), company: v("fCompany"), pickup: v("fPickup").toUpperCase(), time: v("fTime"), retDate: v("fRetDate"), retTime: v("fRetTime"), conf: v("fConf") });
  if (it.type === "hotel") {
    const old = t.items.find((x) => x.id === it.id);
    Object.assign(it, { name: v("fName"), city: v("fCity"), address: v("fAddress"), outDate: v("fOut"), conf: v("fConf"), travelers: readWho() });
    if (!old || old.address !== it.address || old.city !== it.city || old.name !== it.name) { delete it.lat; delete it.lon; }
    $("#dlgSave").disabled = true; $("#dlgSave").textContent = "Locating…";
    if (!(await ensureCoords(it, it.address || [it.name, it.city].filter(Boolean).join(", "))).lat && it.city) await ensureCoords(it, it.city);
  }
  if (it.type === "drive") {
    Object.assign(it, { from: readPlace("fFromP"), to: readPlace("fToP"), arriveBy: driveMode() === "arrive" ? v("fArrive") : "", time: driveMode() === "leave" ? v("fArrive") : "", note: v("fNote"), travelers: readWho() });
    const m = parseDur(v("fDur"));
    if (m != null) Object.assign(it, { minutes: m, manual: true, est: false });
    else { it.manual = false; if (it.minutes == null) { $("#dlgSave").disabled = true; $("#dlgSave").textContent = "Calculating…"; await EDITING.recalc(); } }
    for (const k of ["from", "to"]) if (it[k] && it[k].ref === "custom") { const p = resolvePlace(t, it[k]); await ensureCoords(p, p.q); it[k].lat = p.lat; it[k].lon = p.lon; }
    try { await zonesFor(t, it); } catch (e) {} // keeps zones right even when the drive time was typed in
  }
  if (it.type === "meeting") {
    Object.assign(it, { title: v("fTitle"), start: v("fStart"), end: v("fEnd"), coop: v("fCoop"), loc: readPlace("fLocP") || { ref: "" }, virtual: $("#fVirtual").checked, note: v("fNote"), travelers: readWho() });
    if (it.coop && !t.coops.some((c) => c.name.toLowerCase() === it.coop.toLowerCase())) {
      const hit = COOP_DIR.find((x) => x.name.toLowerCase() === it.coop.toLowerCase());
      const c = { id: newCoopId(), name: it.coop, town: hit?.town || "", state: hit?.state || "", address: "" };
      t.coops.push(c); if (!it.loc.ref) it.loc = { ref: `coop:${c.id}` };
      ensureCoords(c, [c.town, c.state].filter(Boolean).join(", ")).then(() => { save(); });
    }
  }
  if (it.type === "meal") {
    const k = ($("#fKind [aria-pressed=true]") || {}).dataset?.k || "Other";
    const old = t.items.find((x) => x.id === it.id);
    Object.assign(it, { kind: k === "Other" ? v("fKindX") || "Meal" : k, place: v("fPlace"), res: v("fRes"), address: v("fAddress"), time: v("fTime"), note: v("fNote"), travelers: readWho() });
    if (!old || old.address !== it.address || old.place !== it.place) { delete it.lat; delete it.lon; }
  }
  if (it.type === "note") Object.assign(it, { text: v("fText"), time: v("fTime"), travelers: readWho() });

  $("#dlgSave").disabled = false; $("#dlgSave").textContent = "Save";
  if (isNew) t.items.push(it); else t.items[t.items.findIndex((x) => x.id === it.id)] = it;
  $("#itemDlg").close(); commit();
});
$("#dlgDelete").onclick = () => {
  const t = trip(), id = EDITING.it.id;
  t.items = t.items.filter((x) => x.id !== id); $("#itemDlg").close(); commit(); toast("Deleted");
};
$$("[data-add]").forEach((b) => (b.onclick = () => openItem(null, b.dataset.add)));
