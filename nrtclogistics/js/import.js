// NRTC Logistics Hub — Reading confirmations (screenshots / PDFs).
// Loaded in order by index.html as classic scripts (they share top-level names).
"use strict";
/* ================== Read confirmations (Google Drive text recognition via the Apps Script) ================== */
function fileToPayload(file) {
  return new Promise((resolve, reject) => {
    if (file.type === "application/pdf") {
      if (file.size > 15e6) return reject(new Error("That PDF is over 15 MB."));
      const r = new FileReader(); r.onload = () => resolve({ mime: "application/pdf", data: String(r.result).split(",")[1] }); r.onerror = reject; r.readAsDataURL(file); return;
    }
    if (!/^image\//.test(file.type)) return reject(new Error("Use a screenshot/photo or a PDF."));
    // Shrink big screenshots so the upload is quick; text stays sharp at 2000px
    const img = new Image(), url = URL.createObjectURL(file);
    img.onload = () => {
      const k = Math.min(1, 2000 / Math.max(img.width, img.height));
      const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      const g = c.getContext("2d"); g.fillStyle = "#fff"; g.fillRect(0, 0, c.width, c.height); g.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url); resolve({ mime: "image/jpeg", data: c.toDataURL("image/jpeg", 0.88).split(",")[1] });
    };
    img.onerror = () => reject(new Error("Couldn't open that image."));
    img.src = url;
  });
}
// "MCNEELY/LEVI MR", "Levi McNeely", "MCNEELY LEVI" → team member, by last name (first name breaks ties)
function matchPerson(raw) {
  const toks = String(raw || "").toUpperCase().replace(/[^A-Z\s/]/g, " ").split(/[\s/]+/).filter(Boolean);
  if (!toks.length) return "";
  const hits = TEAM.filter((p) => toks.includes(p.name.toUpperCase().split(/\s+/).at(-1)));
  if (hits.length <= 1) return hits[0]?.name || "";
  return (hits.find((p) => toks.includes(p.name.toUpperCase().split(/\s+/)[0])) || hits[0]).name;
}
function peopleFor(list) {
  const t = trip();
  const names = [...new Set((list || []).map(matchPerson).filter(Boolean))];
  const out = names.length ? names : (list && list.filter(Boolean).length ? [myName()].filter(Boolean) : []);
  out.forEach((n) => { if (!t.travelers.includes(n)) t.travelers.push(n); }); // put them on the trip
  return out.length === t.travelers.length ? [] : out;
}
const hhmm = (x) => (/^\d{1,2}:\d{2}$/.test(x || "") ? x.padStart(5, "0") : "");
const ymd = (x) => (/^\d{4}-\d{2}-\d{2}$/.test(x || "") ? x : "");
function itemsFromExtract(d) {
  const out = [];
  (d.flights || []).forEach((f) => {
    if (!f.from && !f.to) return;
    out.push({ id: uid(), type: "flight", date: ymd(f.date) || lastDate(), airline: f.airline || "", number: String(f.flightNumber || "").replace(/^[A-Z]{2}\s*/i, ""),
      from: (f.from || "").toUpperCase().slice(0, 3), to: (f.to || "").toUpperCase().slice(0, 3), dep: hhmm(f.depTime), arr: hhmm(f.arrTime),
      arrDate: ymd(f.arrDate) && f.arrDate !== f.date ? f.arrDate : "", dir: "auto", conf: f.confirmation || "", travelers: peopleFor(f.passengers) });
  });
  // A leg that another imported leg continues from (same day) is a connection: "Fly IND → MDW"
  const fl = out.filter((x) => x.type === "flight");
  fl.forEach((x) => { if (fl.some((y) => y !== x && y.from === x.to && y.date === (x.arrDate || x.date))) x.dir = "conn"; });
  (d.hotels || []).forEach((h) => {
    if (!h.name) return;
    const city = h.city || (cityState(h.address || "") ? `${cityState(h.address).city}, ${cityState(h.address).st}` : "");
    out.push({ id: uid(), type: "hotel", name: h.name, address: h.address || "", city, date: ymd(h.checkIn) || lastDate(), outDate: ymd(h.checkOut), conf: h.confirmation || "", travelers: peopleFor(h.guests) });
  });
  (d.rentals || []).forEach((r) => {
    const drv = peopleFor([r.driver]);
    out.push({ id: uid(), type: "rental", company: r.company || "", pickup: (r.pickupAirport || "").toUpperCase().slice(0, 3), date: ymd(r.pickupDate) || lastDate(), time: hhmm(r.pickupTime),
      retDate: ymd(r.returnDate), retTime: hhmm(r.returnTime), conf: r.confirmation || "", driver: drv[0] || myName() || trip().travelers[0] || "" });
  });
  return out;
}
function describeItem(it) {
  if (it.type === "flight") return [`${it.airline} ${it.number}`.trim() || "Flight", `${it.from} → ${it.to} · ${fmtShort(it.date)}${it.dep ? ` · departs ${fmtTime(it.dep)}` : ""}${it.arr ? ` · lands ${fmtTime(it.arr)}` : ""}`];
  if (it.type === "hotel") return [it.name, `${fmtShort(it.date)}${it.outDate ? `–${fmtShort(it.outDate)}` : ""}${it.city ? ` · ${it.city}` : ""}`];
  return [`${it.company || "Rental car"}${it.pickup ? ` at ${it.pickup}` : ""}`, `${fmtShort(it.date)}${it.time ? ` ${fmtTime(it.time)}` : ""}${it.retDate ? `–${fmtShort(it.retDate)}` : ""}`];
}
let IMPORTED = [];
async function readConfirmation(file) {
  if (!file) return;
  const dz = $("#drop"), txt = $("#dropText"), before = txt.innerHTML;
  dz.classList.add("working"); txt.textContent = `Reading ${file.name || "screenshot"}…`;
  try {
    const payload = await fileToPayload(file);
    const today = new Date(); const iso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const j = await api("extract", Object.assign(payload, { today: iso }));
    // The script returns the file's text (Google Drive OCR); parse.js picks out the details
    const data = j.text ? parseConfirmation(j.text, { today: iso, airports: window.AP || {}, people: TEAM.map((p) => p.name) }) : {};
    IMPORTED = itemsFromExtract(data);
    if (!IMPORTED.length) { toast("Couldn't spot a flight, hotel or rental car in that. Try a clearer screenshot, or add it by hand."); return; }
    save(); renderRoster();
    if (IMPORTED.length === 1) { openItem(IMPORTED[0], IMPORTED[0].type, true); toast("Check the details, then Save"); return; }
    $("#importList").innerHTML = IMPORTED.map((it, i) => { const [a, b] = describeItem(it); return `<label class="imp-row"><input type="checkbox" data-i="${i}" checked>${icon(it.type)}<span>${esc(a)}<small>${esc(b)}</small></span></label>`; }).join("");
    $("#importDlg").showModal();
  } catch (e) {
    const noDrive = /Drive API|Services \(\+\)|Drive is not defined/i.test(e.message || "");
    const msg = noDrive ? "The free reader isn't switched on yet. Add the Drive API under Services in the Apps Script, run authorize(), then redeploy."
      : `Couldn't read that file${e.message ? ` (${e.message})` : ""}.`;
    if (e.code === "passcode") handleSyncError(e); else toast(msg);
  } finally { dz.classList.remove("working"); txt.innerHTML = before; $("#dropFile").value = ""; }
}
$("#importAdd").onclick = () => {
  const t = trip(), picks = $$("#importList input:checked").map((x) => IMPORTED[+x.dataset.i]);
  picks.forEach((it) => t.items.push(it));
  $("#importDlg").close(); commit(); toast(`Added ${picks.length} item${picks.length === 1 ? "" : "s"}`);
};
(function () {
  const dz = $("#drop");
  if (!window.SYNC_URL) return; // needs the Apps Script backend
  dz.hidden = false;
  $("#dropFile").onchange = (e) => readConfirmation(e.target.files[0]);
  ["dragenter", "dragover"].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add("over"); }));
  ["dragleave", "drop"].forEach((ev) => dz.addEventListener(ev, () => dz.classList.remove("over")));
  dz.addEventListener("drop", (e) => { e.preventDefault(); readConfirmation(e.dataTransfer.files[0]); });
  document.addEventListener("paste", (e) => {
    if (document.documentElement.classList.contains("locked") || document.querySelector("dialog[open]")) return;
    if (e.target.matches && e.target.matches("input, textarea")) return;
    const f = [...(e.clipboardData?.files || [])].find((x) => /^image\/|pdf/.test(x.type));
    if (f) { e.preventDefault(); readConfirmation(f); }
  });
})();
