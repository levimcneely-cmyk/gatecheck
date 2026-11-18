// node nrtclogistics/dev/test_parse.js — the confirmation reader (parse.js) on realistic OCR text
const fs = require("fs"), path = require("path"), assert = require("assert");
globalThis.window = globalThis;
eval(fs.readFileSync(path.join(__dirname, "../airports.js"), "utf8"));
const { parseConfirmation } = require("../parse.js");
const people = ["Levi McNeely", "Thomas McCollum", "Josh Pepple", "Steve Hanson"];
const P = (txt) => parseConfirmation(txt, { today: "2026-11-18", airports: window.AP, people });
let n = 0; const t = (name, fn) => { fn(); n++; console.log("ok -", name); };
const S = {
southwest_email: `Southwest
You're all set.
Confirmation # GH5K2P
Passenger: LEVI MCNEELY
Rapid Rewards #: 123456789
Monday, 12/07/2026
Flight 1 Indianapolis to Denver
FLIGHT # 1234
Depart IND 6:05 AM
Change planes in MDW
FLIGHT # 2567
Depart MDW 7:15 AM Arrive DEN 8:50 AM
Trip total: $412.96
Check in for your flight 24 hours before departure.`,
aa_app: `11:42
Trip to Denver
Record locator
XKQ7RT
Mon, Dec 7
AA 2211
BNA 7:00 AM
Nashville
DEN 8:45 AM
Denver
Seat 14C   Group 5
Passengers
Thomas McCollum`,
delta_return: `DELTA
Your Trip Confirmation #: HJ8L2Q
WED, 09DEC
DELTA 1882
DEN 2:20pm  ATL 7:15pm
DELTA 2290
ATL 8:30pm  IND 10:05pm
Passenger Info
MCNEELY/LEVI`,
hotel: `Hilton Garden Inn Hays
3017 Vine St
Hays, KS 67601
Confirmation Number: 3189244721
Check-in: Monday, December 7, 2026
Check-out: Wednesday, December 9, 2026
2 nights, 1 room
Guest: Levi McNeely
Hilton Honors # 9988776655`,
rental: `National Car Rental
Thanks for your reservation, Levi
Confirmation #: 1293847562
Pick-up
Denver International Airport (DEN)
Mon, Dec 7, 2026 9:30 AM
Return
Denver International Airport (DEN)
Wed, Dec 9, 2026 12:00 PM
Car class: Midsize`,
united_pdf: `UNITED AIRLINES
Confirmation Number: K9PQ2W
Traveler: STEVE HANSON
Flight UA 507
Thu, Jan 14, 2027
Departing 10:45 AM  Kansas City, MO, US (MCI)
Arriving 12:05 PM  Denver, CO, US (DEN)`,
};
const ads = `American Airlines
Your trip confirmation
Confirmation code: QWE7RT
Thu, Feb 4
AA 1550  CLT 9:10 AM → IND 10:45 AM
Need a place to stay? Book hotels and save. Check-in made easy.
Rental cars from Avis — pick up at the airport and return anytime. Save up to 35%.
Passenger: JOSH PEPPLE`;

t("Southwest email: two legs, no 'flight 24 hours'", () => {
  const f = P(S.southwest_email).flights;
  assert.deepStrictEqual(f.map((x) => `${x.flightNumber} ${x.from}-${x.to} ${x.depTime}`), ["1234 IND-MDW 06:05", "2567 MDW-DEN 07:15"]);
  assert.strictEqual(f[1].arrTime, "08:50"); assert.strictEqual(f[0].confirmation, "GH5K2P"); assert.deepStrictEqual(f[0].passengers, ["Levi McNeely"]);
});
t("American app screenshot", () => { const f = P(S.aa_app).flights[0]; assert.strictEqual(`${f.airline} ${f.flightNumber} ${f.from}-${f.to} ${f.date} ${f.depTime}-${f.arrTime}`, "American 2211 BNA-DEN 2026-12-07 07:00-08:45"); });
t("Delta return with connection", () => { assert.deepStrictEqual(P(S.delta_return).flights.map((x) => `${x.from}-${x.to} ${x.depTime}`), ["DEN-ATL 14:20", "ATL-IND 20:30"]); });
t("Hilton confirmation", () => { const h = P(S.hotel).hotels[0]; assert.strictEqual(`${h.name}|${h.city}|${h.checkIn}|${h.checkOut}`, "Hilton Garden Inn Hays|Hays, KS|2026-12-07|2026-12-09"); });
t("National rental", () => { const r = P(S.rental).rentals[0]; assert.strictEqual(`${r.company} ${r.pickupAirport} ${r.pickupDate} ${r.pickupTime} ${r.returnDate} ${r.returnTime}`, "National DEN 2026-12-07 09:30 2026-12-09 12:00"); });
t("United PDF, next-year date", () => { const f = P(S.united_pdf).flights[0]; assert.strictEqual(`${f.from}-${f.to} ${f.date}`, "MCI-DEN 2027-01-14"); });
t("hotel/rental ads in a flight email are ignored", () => { const r = P(ads); assert.strictEqual(r.flights.length, 1); assert.strictEqual(r.hotels.length + r.rentals.length, 0); assert.strictEqual(r.flights[0].confirmation, "QWE7RT"); });
console.log(`${n} parser tests passed`);
