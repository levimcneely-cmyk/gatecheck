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
  const def = ss.getSheetByName("Sheet1");
  if (def && def.getLastRow() === 0 && ss.getSheets().length > 1) ss.deleteSheet(def);
}

function setPasscode() {
  if (!NEW_PASSCODE) throw new Error("Type the passcode into NEW_PASSCODE first, then run this again.");
  PropertiesService.getScriptProperties().setProperty("PASS_HASH", hash_(NEW_PASSCODE.trim().toUpperCase()));
  Logger.log("Passcode set. Now clear NEW_PASSCODE back to \"\" and save.");
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
  if (!sh) return json_({ ok: false, error: "run setup() first" });

  if (req.action === "ping") return json_({ ok: true });

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
