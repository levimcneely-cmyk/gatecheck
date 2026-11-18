// node nrtclogistics/dev/test_time.js — time-zone math for drives (loads core.js in a bare sandbox)
const fs = require("fs"), vm = require("vm"), assert = require("assert"), path = require("path");
const ctx = { console, Intl, Date, Math, JSON, setTimeout, clearTimeout, URL, fetch: async () => { throw new Error("offline"); } };
ctx.window = ctx; ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(__dirname, "../js/core.js"), "utf8") + "\n;globalThis.__t={zonedToUtc,utcToZoned,driveTimes,tzAbbr};", ctx);
const { zonedToUtc, utcToZoned, driveTimes, tzAbbr } = ctx.__t;
let n = 0; const t = (name, fn) => { fn(); n++; console.log("ok -", name); };

t("1:00 PM Central = 2:00 PM Eastern", () => {
  const ms = zonedToUtc("2026-12-07", "13:00", "America/Chicago");
  assert.strictEqual(utcToZoned(ms, "America/Indiana/Indianapolis").hhmm, "14:00");
});
t("daylight time handled (July)", () => {
  assert.strictEqual(new Date(zonedToUtc("2026-07-15", "09:00", "America/Denver")).toISOString(), "2026-07-15T15:00:00.000Z");
});
t("arrive by 12:45 CT, 4 hr drive from Eastern -> leave 9:45 ET", () => {
  const d = driveTimes({ date: "2026-12-07", arriveBy: "12:45", minutes: 240, fromTz: "America/Indiana/Indianapolis", toTz: "America/Chicago" });
  assert.strictEqual(d.leave, "09:45"); assert.ok(d.cross);
});
t("leave 8:00 ET, 5 hr drive into Central -> arrive 12:00 CT", () => {
  const d = driveTimes({ date: "2026-12-07", time: "08:00", minutes: 300, fromTz: "America/New_York", toTz: "America/Chicago" });
  assert.strictEqual(d.arrive, "12:00");
});
t("same zone -> plain subtraction, rounded down to 5 min", () => {
  const d = driveTimes({ date: "2026-12-07", arriveBy: "12:45", minutes: 32, fromTz: "America/Chicago", toTz: "America/Chicago" });
  assert.strictEqual(d.leave, "12:10"); assert.ok(!d.cross);
});
t("no zones known -> same as before", () => {
  assert.strictEqual(driveTimes({ date: "2026-12-07", arriveBy: "12:45", minutes: 30 }).leave, "12:15");
});
t("zone labels", () => { const a = tzAbbr("America/Chicago", Date.UTC(2026, 11, 7, 18)); assert.ok(/^(CT|CST)$/.test(a), a); });
console.log(`${n} time tests passed`);
