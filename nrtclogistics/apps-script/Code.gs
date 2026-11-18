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
 * Saves carry the version they were made on (baseRev). If someone saved that record in between,
 *   the write is refused and their copy is returned so the hub can merge the two.
 * Updating this code later: Deploy → Manage deployments → edit → Version: New version (keeps the URL).
 */
const NEW_PASSCODE = "";

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
  forgetGemini_();
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
  forgetGemini_();
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

// Return the uploaded file's text; the hub's parse.js picks the trip details out of it.
function extract_(req) {
  if (!req.data || !req.mime) return { ok: false, error: "no file" };
  try {
    const text = ocrText_(Utilities.newBlob(Utilities.base64Decode(req.data), req.mime, "hub-upload"));
    return { ok: true, text: text };
  } catch (err) { return { ok: false, error: "reader: " + err.message }; }
}

// Gemini was tried and dropped (its free tier wasn't available); clear anything it left behind.
function forgetGemini_() {
  const p = PropertiesService.getScriptProperties();
  ["GEMINI_KEY", "GEMINI_OFF_UNTIL", "GEMINI_MODEL"].forEach(function (k) { p.deleteProperty(k); });
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
      const rows = n > 0 ? sh.getRange(2, 1, n, 5).getValues() : [];
      const keys = rows.map(function (r) { return String(r[0]); });
      let rev = Number(props.getProperty("REV")) || 0;
      const out = [];
      (req.items || []).forEach(function (it) {
        const text = JSON.stringify(it.value);
        if (!it.key || text.length > MAX_CELL) { out.push({ key: it.key, error: "too big" }); return; }
        const i0 = keys.indexOf(String(it.key));
        // Someone saved this record after the version this edit was made on: hand back theirs to merge
        if (i0 >= 0 && it.baseRev !== undefined && Number(rows[i0][1]) !== Number(it.baseRev)) {
          let cur = null; try { cur = JSON.parse(rows[i0][4] || "null"); } catch (err) {}
          out.push({ key: it.key, conflict: true, rev: Number(rows[i0][1]), updated: rows[i0][2] instanceof Date ? rows[i0][2].toISOString() : String(rows[i0][2]), by: String(rows[i0][3] || ""), value: cur });
          return;
        }
        rev++;
        const now = new Date();
        const row = [String(it.key), rev, now, String(req.by || ""), text];
        const i = keys.indexOf(String(it.key));
        if (i >= 0) { sh.getRange(i + 2, 1, 1, 5).setValues([row]); rows[i] = row; }
        else { sh.appendRow(row); keys.push(String(it.key)); rows.push(row); }
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
