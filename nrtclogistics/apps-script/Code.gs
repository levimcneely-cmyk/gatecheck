/**
 * NRTC Logistics Hub — shared backend.
 * Lives in a Google Sheet (Extensions → Apps Script). Every trip, plus the team list and RBM
 * territories, is one row on the "Store" tab. The hub page reads and writes through this script.
 *
 * Setup (once):
 *   1. Type the team passcode into NEW_PASSCODE below.
 *   2. Run setup()  (approve the permissions prompt — it only touches this spreadsheet).
 *   3. Clear NEW_PASSCODE back to "" and save (so it isn't sitting in the code).
 *   4. Deploy → New deployment → Web app · Execute as: Me · Who has access: Anyone → copy the URL.
 * Changing the passcode later: type it into NEW_PASSCODE, run setPasscode(), clear it again.
 * Reading confirmations (screenshots/PDFs) — FREE, using Google Drive's built-in text recognition:
 *   1. In the editor's left bar, Services (+) → Drive API → Add.
 *   2. Run authorize() once and approve the permissions (Drive + Docs, used only for a temp file).
 *   3. Deploy → Manage deployments → pencil → Version: New version → Deploy.
 *   Optional: a Gemini key (setAiKey) is used first if it works; otherwise it falls back to the free OCR.
 * Updating this code later: Deploy → Manage deployments → edit → Version: New version (keeps the URL).
 */
const NEW_PASSCODE = "";
const GEMINI_KEY = "";

const SHEET = "Store";
const HEAD = ["Key", "Rev", "Updated", "Updated By", "Value"];
const MAX_CELL = 49000; // Sheets caps a cell at 50,000 characters

function setup() {
  const ss = SpreadsheetApp.getActive();
  const sh = ss.getSheetByName(SHEET) || ss.insertSheet(SHEET);
  sh.getRange(1, 1, 1, HEAD.length).setValues([HEAD]).setFontWeight("bold");
  sh.setFrozenRows(1);
  sh.getRange("B:B").setNumberFormat("0");
  sh.getRange("E:E").setNumberFormat("@").setWrap(false);
  const p = PropertiesService.getScriptProperties();
  if (!p.getProperty("REV")) p.setProperty("REV", "0");
  if (NEW_PASSCODE) setPasscode();
  const def = ss.getSheetByName("Sheet1");
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
}

function setPasscode() {
  if (!NEW_PASSCODE) throw new Error("Type the passcode into NEW_PASSCODE first, then run this again.");
  PropertiesService.getScriptProperties().setProperty("PASS_HASH", hash_(NEW_PASSCODE.trim().toUpperCase()));
  Logger.log("Passcode set. Now clear NEW_PASSCODE back to \"\" and save.");
}

// Run once from the editor so Google asks for the Drive/Docs permissions the free reader needs.
function authorize() {
  const blob = Utilities.newBlob("NRTC Logistics Hub OCR check", "text/plain", "hub-ocr-check.txt");
  const text = ocrText_(blob);
  Logger.log("Text reader works: " + JSON.stringify(text.slice(0, 40)) + ". Now redeploy as a New version.");
}

// Google Drive turns an image or PDF into a Google Doc (with OCR); read the text, then delete the temp file.
function ocrText_(blob) {
  let id;
  if (typeof Drive === "undefined") throw new Error("Add the Drive API under Services (+) in the Apps Script editor.");
  if (Drive.Files.create) id = Drive.Files.create({ name: "hub-ocr-" + Date.now(), mimeType: MimeType.GOOGLE_DOCS }, blob, { ocrLanguage: "en" }).id;  // Drive API v3
  else id = Drive.Files.insert({ title: "hub-ocr-" + Date.now(), mimeType: MimeType.GOOGLE_DOCS }, blob, { ocr: true, ocrLanguage: "en" }).id;  // v2
  try { return DocumentApp.openById(id).getBody().getText(); }
  finally { try { Drive.Files.remove(id); } catch (e) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e2) {} } }
}

function setAiKey() {
  if (!GEMINI_KEY) throw new Error("Paste your Gemini API key into GEMINI_KEY first, then run this again.");
  PropertiesService.getScriptProperties().setProperty("GEMINI_KEY", GEMINI_KEY.trim());
  PropertiesService.getScriptProperties().deleteProperty("GEMINI_OFF_UNTIL");
  // Quick test call so the permission prompt happens now and a bad key shows up right away
  const r = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models?pageSize=1", { headers: { "x-goog-api-key": GEMINI_KEY.trim() }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error("Gemini rejected that key: " + r.getContentText().slice(0, 200));
  Logger.log("Gemini key saved and working. Now clear GEMINI_KEY back to \"\", save, and redeploy as a New version.");
}

const EXTRACT_PROMPT = [
  "You read travel confirmations (airline emails, app screenshots, itineraries, hotel and rental-car confirmations).",
  "Pull out every flight segment, hotel stay and rental car. Return ONLY JSON shaped exactly like:",
  '{"flights":[{"airline":"","flightNumber":"","from":"","to":"","date":"YYYY-MM-DD","depTime":"HH:MM","arrDate":"YYYY-MM-DD","arrTime":"HH:MM","confirmation":"","passengers":[""]}],',
  '"hotels":[{"name":"","address":"","city":"City, ST","checkIn":"YYYY-MM-DD","checkOut":"YYYY-MM-DD","confirmation":"","guests":[""]}],',
  '"rentals":[{"company":"","pickupAirport":"","pickupDate":"YYYY-MM-DD","pickupTime":"HH:MM","returnDate":"YYYY-MM-DD","returnTime":"HH:MM","confirmation":"","driver":""}]}',
  "Rules: airports as 3-letter IATA codes. Times are local 24-hour HH:MM. Each connecting leg is its own flight.",
  "flightNumber is just the number (e.g. 1234); airline is the marketing airline name (e.g. Southwest).",
  "If a year is missing, use the next occurrence on or after TODAY. Use \"\" for anything not shown. Never invent values."
].join("\n");

// Try Gemini (only if a working key is set); otherwise return the file's text for the hub to read.
function extract_(req) {
  if (!req.data || !req.mime) return { ok: false, error: "no file" };
  const props = PropertiesService.getScriptProperties();
  const off = Number(props.getProperty("GEMINI_OFF_UNTIL") || 0);
  if (props.getProperty("GEMINI_KEY") && Date.now() > off) {
    const ai = gemini_(req, props);
    if (ai.ok) return ai;
    if (/free tier is not available|billing|denied access|403/i.test(ai.error || "")) props.setProperty("GEMINI_OFF_UNTIL", String(Date.now() + 7 * 864e5)); // stop retrying for a week
  }
  try {
    const text = ocrText_(Utilities.newBlob(Utilities.base64Decode(req.data), req.mime, "hub-upload"));
    return { ok: true, text: text };
  } catch (err) { return { ok: false, error: "reader: " + err.message }; }
}

function gemini_(req, props) {
  const key = props.getProperty("GEMINI_KEY");
  const body = {
    contents: [{ parts: [
      { text: EXTRACT_PROMPT.replace("TODAY", "today (" + (req.today || Utilities.formatDate(new Date(), "America/New_York", "yyyy-MM-dd")) + ")") },
      { inline_data: { mime_type: req.mime, data: req.data } }
    ] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0 }
  };
  const models = [props.getProperty("GEMINI_MODEL"), "gemini-flash-latest", "gemini-2.5-flash"].filter(Boolean);
  let last = "";
  for (let i = 0; i < models.length; i++) {
    const r = UrlFetchApp.fetch("https://generativelanguage.googleapis.com/v1beta/models/" + models[i] + ":generateContent", {
      method: "post", contentType: "application/json", headers: { "x-goog-api-key": key },
      payload: JSON.stringify(body), muteHttpExceptions: true
    });
    const code = r.getResponseCode();
    if (code === 404) { last = models[i] + " not found"; continue; }
    if (code === 429) return { ok: false, error: "ai busy" };
    if (code !== 200) return { ok: false, error: "ai error " + code + ": " + r.getContentText().slice(0, 200) };
    const j = JSON.parse(r.getContentText());
    const text = (((j.candidates || [])[0] || {}).content || { parts: [] }).parts.map(function (p) { return p.text || ""; }).join("");
    try {
      const data = JSON.parse(text.replace(/^```(?:json)?\s*|\s*```$/g, ""));
      return { ok: true, model: models[i], data: data };
    } catch (err) { return { ok: false, error: "ai returned something unreadable" }; }
  }
  return { ok: false, error: last || "no model" };
}

function hash_(s) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8)
    .map(function (b) { return ((b + 256) % 256).toString(16).padStart(2, "0"); }).join("");
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet() { return json_({ ok: true, service: "nrtc-logistics" }); }

function doPost(e) {
  let req;
  try { req = JSON.parse(e.postData.contents); } catch (err) { return json_({ ok: false, error: "bad request" }); }

  const props = PropertiesService.getScriptProperties();
  const want = props.getProperty("PASS_HASH");
  if (!want) return json_({ ok: false, error: "no passcode set — run setPasscode()" });
  if (hash_(String(req.pass || "").trim().toUpperCase()) !== want) { Utilities.sleep(800); return json_({ ok: false, error: "passcode" }); }

  const sh = SpreadsheetApp.getActive().getSheetByName(SHEET);
  if (!sh && req.action !== "extract") return json_({ ok: false, error: "run setup() first" });

  if (req.action === "ping") return json_({ ok: true });
  if (req.action === "extract") return json_(extract_(req));

  if (req.action === "list") {
    const since = Number(req.since) || 0;
    const n = sh.getLastRow() - 1;
    const rows = n > 0 ? sh.getRange(2, 1, n, 5).getValues() : [];
    const items = [];
    rows.forEach(function (r) {
      if (!r[0] || Number(r[1]) <= since) return;
      let value = null;
      try { value = JSON.parse(r[4] || "null"); } catch (err) { return; }
      items.push({ key: String(r[0]), rev: Number(r[1]), updated: r[2] instanceof Date ? r[2].toISOString() : String(r[2]), by: String(r[3] || ""), value: value });
    });
    return json_({ ok: true, rev: Number(props.getProperty("REV")) || 0, items: items });
  }

  if (req.action === "put") {
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const n = sh.getLastRow() - 1;
      const keys = n > 0 ? sh.getRange(2, 1, n, 1).getValues().map(function (r) { return String(r[0]); }) : [];
      let rev = Number(props.getProperty("REV")) || 0;
      const out = [];
      (req.items || []).forEach(function (it) {
        const text = JSON.stringify(it.value);
        if (!it.key || text.length > MAX_CELL) { out.push({ key: it.key, error: "too big" }); return; }
        rev++;
        const now = new Date();
        const row = [String(it.key), rev, now, String(req.by || ""), text];
        const i = keys.indexOf(String(it.key));
        if (i >= 0) sh.getRange(i + 2, 1, 1, 5).setValues([row]);
        else { sh.appendRow(row); keys.push(String(it.key)); }
        out.push({ key: it.key, rev: rev, updated: now.toISOString() });
      });
      props.setProperty("REV", String(rev));
      return json_({ ok: true, rev: rev, items: out });
    } finally {
      lock.releaseLock();
    }
  }

  return json_({ ok: false, error: "unknown action" });
}
