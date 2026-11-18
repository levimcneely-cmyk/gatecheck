// Reads plain text from a travel confirmation (OCR'd screenshot or PDF) and pulls out
// flights, hotels and rental cars. Pattern-matching, not AI — the hub always shows the result for review.
// Output matches the Gemini shape: { flights: [...], hotels: [...], rentals: [...] }
(function (root) {
  "use strict";
  const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
  const MON = "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)";
  const AIRLINES = {
    WN: "Southwest", AA: "American", DL: "Delta", UA: "United", AS: "Alaska", B6: "JetBlue", F9: "Frontier",
    NK: "Spirit", G4: "Allegiant", SY: "Sun Country", MX: "Breeze", HA: "Hawaiian", AC: "Air Canada", WS: "WestJet",
  };
  const NAME2CODE = { southwest: "WN", american: "AA", delta: "DL", united: "UA", alaska: "AS", jetblue: "B6", frontier: "F9",
    spirit: "NK", allegiant: "G4", "sun country": "SY", breeze: "MX", hawaiian: "HA", "air canada": "AC", westjet: "WS" };
  // Upper-case three-letter words that are also airport codes but usually aren't airports in a confirmation
  const NOT_AIRPORTS = new Set(("THE AND FOR YOU ARE NOT BUT ALL ANY CAN HAS HAD HER HIS ITS MAY NEW NOW OFF OLD ONE OUR OUT OWN SEE TWO WAY WHO GET USE " +
    "DAY MON TUE WED THU FRI SAT SUN JAN FEB MAR APR JUN JUL AUG SEP OCT NOV DEC EST CST MST PST EDT CDT MDT PDT AKT HST UTC GMT USA FAQ PDF APP " +
    "BAG TSA PRE FEE TAX ADD MPH CAR INN RED LLC INC PLC NON VIA PER SET TOP TRY WHY YES AGE AIR BOX END ETA ETD FLT ARR DEP " +
    "RES REF NUM PAX MRS DBA ATM").split(" "));

  const pad = (n) => String(n).padStart(2, "0");
  const iso = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;

  function makeDate(y, m, d, today) {
    if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return "";
    if (y) { y = +y; if (y < 100) y += 2000; return iso(y, m, d); }
    // No year shown: next occurrence on/after (today − 3 days)
    const t = new Date(today + "T00:00:00"); const floor = new Date(t); floor.setDate(t.getDate() - 3);
    let yy = t.getFullYear(); if (new Date(yy, m - 1, d) < floor) yy++;
    return iso(yy, m, d);
  }
  // Every date in the text, with its position
  function findDates(text, today) {
    const out = [];
    const push = (i, len, v) => { if (v && !out.some((o) => Math.abs(o.i - i) < 3)) out.push({ i, end: i + len, v }); };
    let m;
    const r1 = new RegExp(`\\b${MON}\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?`, "gi");
    while ((m = r1.exec(text))) push(m.index, m[0].length, makeDate(m[3], MONTHS[m[1].slice(0, m[1].toLowerCase().startsWith("sept") ? 4 : 3).toLowerCase()], +m[2], today));
    const r2 = new RegExp(`\\b(\\d{1,2})\\s*${MON}\\b\\.?,?\\s*(\\d{4}|\\d{2}(?!:|\\d))?`, "gi");
    while ((m = r2.exec(text))) push(m.index, m[0].length, makeDate(m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1], today));
    const r3 = /\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/g;
    while ((m = r3.exec(text))) push(m.index, m[0].length, makeDate(m[3], +m[1], +m[2], today));
    const r4 = /\b(20\d\d)-(\d\d)-(\d\d)\b/g;
    while ((m = r4.exec(text))) push(m.index, m[0].length, makeDate(m[1], +m[2], +m[3], today));
    return out.sort((a, b) => a.i - b.i);
  }
  // Every clock time, with its position (12-hour preferred when the text uses it)
  function findTimes(text) {
    const out = []; let m;
    const r12 = /\b(\d{1,2})(?::|\.)?(\d{2})?\s*([ap])\.?\s*m?\.?(?![a-z])/gi;
    while ((m = r12.exec(text))) {
      let h = +m[1]; const mi = m[2] ? +m[2] : 0;
      if (h < 1 || h > 12 || mi > 59) continue;
      if (!m[2] && !/\s*[ap]\.?\s*m/i.test(m[0].slice(m[1].length))) continue; // "7a" alone is too risky; need "7 AM"
      if (m[3].toLowerCase() === "p" && h !== 12) h += 12; if (m[3].toLowerCase() === "a" && h === 12) h = 0;
      out.push({ i: m.index, end: m.index + m[0].length, v: `${pad(h)}:${pad(mi)}` });
    }
    if (!out.length) {
      const r24 = /\b([01]?\d|2[0-3]):([0-5]\d)\b/g;
      while ((m = r24.exec(text))) out.push({ i: m.index, end: m.index + m[0].length, v: `${pad(+m[1])}:${m[2]}` });
    }
    return out.sort((a, b) => a.i - b.i);
  }
  function findAirports(text, AP) {
    const out = []; let m; const r = /\b([A-Z]{3})\b/g;
    while ((m = r.exec(text))) if (AP[m[1]] && !NOT_AIRPORTS.has(m[1])) out.push({ i: m.index, v: m[1] });
    return out;
  }
  function findConfirmation(text) {
    const r = /(?:confirmation|record\s+locator|conf\.?|reservation|booking|itinerary|PNR)\s*(?:#|no\.?|number|code|num\.?)?\s*[:#]?\s*([A-Z0-9]{5,12})\b/gi;
    let m;
    while ((m = r.exec(text))) {
      // a real code has a digit, or is a 6-letter airline locator in capitals (not a word like "Number")
      if (/\d/.test(m[1]) || /^[A-Z]{6}$/.test(m[1])) return m[1].toUpperCase();
      r.lastIndex = m.index + 1;
    }
    return "";
  }
  const after = (list, i) => list.find((x) => x.i >= i);
  const lastBefore = (list, i) => [...list].reverse().find((x) => x.i < i);

  function flights(text, today, AP) {
    const hits = []; let m;
    const codes = Object.keys(AIRLINES).join("|");
    const rCode = new RegExp(`\\b(${codes})\\s?(\\d{1,4})\\b`, "g");
    while ((m = rCode.exec(text))) hits.push({ i: m.index, end: m.index + m[0].length, code: m[1], num: m[2] });
    const names = Object.keys(NAME2CODE).sort((a, b) => b.length - a.length).join("|");
    const rName = new RegExp(`\\b(${names})(?:\\s+(?:airlines?|air\\s+lines))?\\s*(?:flight|flt\\.?)?\\s*#?\\s*(\\d{1,4})\\b`, "gi");
    while ((m = rName.exec(text))) hits.push({ i: m.index, end: m.index + m[0].length, code: NAME2CODE[m[1].toLowerCase()], num: m[2] });
    // "Flight # 1234" / "Flight: 1234" / "Flight 1234" (3-4 digits, so "your flight 24 hours" doesn't count)
    const rFlt = /\b(?:flight|flt\.?)\s*(?:(?:#|no\.?|number|:)\s*:?\s*(\d{1,4})|(\d{3,4})(?!\s*(?:hours?|hrs?|minutes?|mins?)))\b/gi;
    while ((m = rFlt.exec(text))) hits.push({ i: m.index, end: m.index + m[0].length, code: "", num: m[1] || m[2] });
    // one hit per flight number, earliest position wins; skip numbers that are really years/zip codes
    hits.sort((a, b) => a.i - b.i);
    const seen = new Map();
    hits.forEach((h) => { if (/^20\d\d$/.test(h.num) && !h.code) return; const k = h.num; if (!seen.has(k)) seen.set(k, h); else if (!seen.get(k).code && h.code) seen.get(k).code = h.code; });
    let segs = [...seen.values()].sort((a, b) => a.i - b.i);
    const ports = findAirports(text, AP), times = findTimes(text), dates = findDates(text, today);
    let airlineName = "";
    const nm = text.match(new RegExp(`\\b(${names})\\b`, "i")); if (nm) airlineName = AIRLINES[NAME2CODE[nm[1].toLowerCase()]];

    const out = [];
    segs.forEach((h, k) => {
      const prevEnd = k ? segs[k - 1].end : 0, next = k + 1 < segs.length ? segs[k + 1].i : text.length;
      // the segment runs from its flight number to the next one; only look back before the
      // number (some apps list airports first) when there aren't two airports after it
      let start = h.i; const stop = next;
      const inWin = (x) => x.i >= start && x.i < stop;
      let ap = ports.filter(inWin);
      if (ap.length < 2) { start = Math.max(prevEnd, h.i - 160); ap = ports.filter(inWin); }
      // drop consecutive duplicates (e.g. "DEN Denver ... DEN")
      ap = ap.filter((x, j) => !j || x.v !== ap[j - 1].v);
      const tm = times.filter(inWin);
      const dt = lastBefore(dates, (tm[0] || h).i + 1) || after(dates, start);
      if (ap.length < 2) return;
      out.push({
        airline: AIRLINES[h.code] || airlineName, flightNumber: h.num, from: ap[0].v, to: ap[1].v,
        date: dt ? dt.v : "", depTime: tm[0] ? tm[0].v : "", arrTime: tm[1] ? tm[1].v : "", arrDate: "",
      });
    });
    // No flight numbers, but a clear "IND → DEN" style pair: still worth a flight
    if (!out.length) {
      const pair = text.match(/\b([A-Z]{3})\s*(?:→|->|–|—|-|to|>|✈)\s*([A-Z]{3})\b/);
      if (pair && AP[pair[1]] && AP[pair[2]] && pair[1] !== pair[2]) {
        const i = pair.index, tm = times.filter((x) => x.i > i - 120);
        const dt = lastBefore(dates, i + 1) || dates[0];
        out.push({ airline: airlineName, flightNumber: "", from: pair[1], to: pair[2], date: dt ? dt.v : "", depTime: tm[0] ? tm[0].v : "", arrTime: tm[1] ? tm[1].v : "", arrDate: "" });
      }
    }
    // An arrival earlier than departure means it lands the next day
    out.forEach((f) => { if (f.date && f.depTime && f.arrTime && f.arrTime < f.depTime && /\+1|next day|overnight/i.test(text)) { const d = new Date(f.date + "T00:00:00"); d.setDate(d.getDate() + 1); f.arrDate = iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); } });
    return out;
  }

  const HOTEL_BRANDS = /(hilton garden inn|hampton inn|homewood suites|home2 suites|tru by hilton|doubletree|embassy suites|hilton|courtyard|fairfield(?: inn)?|residence inn|springhill suites|towneplace suites|marriott|holiday inn express|holiday inn|staybridge suites|candlewood suites|hyatt place|hyatt house|hyatt|best western|comfort (?:inn|suites)|sleep inn|quality inn|la quinta|drury (?:inn|plaza)|wingate|wyndham|ramada|super 8|americinn|microtel|country inn|cambria|aloft|element|ac hotel|four points|sheraton|westin|kimpton|graduate|[a-z' ]+ (?:hotel|inn|suites|lodge|resort))\b/i;
  function hotels(text, today) {
    if (!/check[\s-]?out|departure date|nights?\b/i.test(text) || !/check[\s-]?in|arrival date/i.test(text)) return [];
    if (!/hotel|inn\b|suites|resort|lodg|stay|room/i.test(text)) return [];
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    let name = "";
    for (const l of lines) { if (l.length <= 70 && HOTEL_BRANDS.test(l) && !/check|confirm|thank|reward|honors|bonvoy|points|book/i.test(l)) { name = l.replace(/^(?:welcome to|your stay at|hotel:?)\s*/i, "").replace(/[|•].*$/, "").trim(); break; } }
    if (!name) return [];
    if (!findDates(text, today).length) return [];
    const flat = text.replace(/\n+/g, ", ");
    const addr = flat.match(/\b\d{1,6}\s+[A-Za-z0-9.' -]{3,40}?,\s*(?:[A-Za-z0-9.# -]{1,20},\s*)?([A-Za-z .'-]{2,30}),\s*([A-Z]{2})\s*(\d{5})?\b/);
    const dates = findDates(text, today);
    const ci = text.search(/check[\s-]?in|arrival date|arrive/i), co = text.search(/check[\s-]?out|departure date|depart/i);
    const din = (ci >= 0 && after(dates, ci)) || dates[0], dout = (co >= 0 && after(dates, co)) || dates[1];
    return [{ name, address: addr ? addr[0].replace(/^,\s*/, "").trim() : "", city: addr ? `${addr[1].trim()}, ${addr[2]}` : "",
      checkIn: din ? din.v : "", checkOut: dout && (!din || dout.v > din.v) ? dout.v : "", confirmation: "" }];
  }

  const RENTAL = /\b(enterprise|national|hertz|avis|budget|alamo|thrifty|dollar|sixt|payless|fox rent)\b/i;
  function rentals(text, today, AP) {
    const co = text.match(RENTAL);
    if (!co || !/pick[\s-]?up/i.test(text) || !/return|drop[\s-]?off/i.test(text)) return [];
    if (/\bflight\b/i.test(text) && !/rental|rent a car|car class|vehicle/i.test(text)) return [];
    const dates = findDates(text, today), times = findTimes(text);
    const pi = text.search(/pick[\s-]?up/i), ri = text.search(/\b(?:return|drop[\s-]?off)\b/i);
    const ap = findAirports(text, AP);
    const pd = after(dates, pi), rd = after(dates, ri), pt = after(times, pi), rt = after(times, ri);
    if (!pd) return []; // an ad ("rental cars from Avis…") has no pick-up date
    return [{ company: co[1].replace(/^./, (c) => c.toUpperCase()), pickupAirport: (after(ap, pi) || ap[0] || {}).v || "",
      pickupDate: pd ? pd.v : "", pickupTime: pt && (!rd || pt.i < ri || ri < pi) ? pt.v : "", returnDate: rd && rd !== pd ? rd.v : "", returnTime: rt && rt !== pt ? rt.v : "", confirmation: "" }];
  }

  function parseConfirmation(raw, opts) {
    const today = opts.today, AP = opts.airports || {};
    const text = String(raw || "").replace(/\r/g, "").replace(/[ \t ]+/g, " ");
    const conf = findConfirmation(text);
    const people = (opts.people || []).filter((n) => new RegExp(`\\b${n.split(/\s+/).at(-1)}\\b`, "i").test(text));
    const f = flights(text, today, AP), h = hotels(text, today), r = rentals(text, today, AP);
    // A hotel or rental confirmation can mention an airport; only keep "flights" that came from flight numbers
    f.forEach((x) => { x.confirmation = conf; x.passengers = people; });
    h.forEach((x) => { x.confirmation = conf; x.guests = people; });
    r.forEach((x) => { x.confirmation = conf; x.driver = people[0] || ""; });
    return { flights: (h.length || r.length) && !f.some((x) => x.flightNumber) ? [] : f, hotels: h, rentals: r };
  }

  root.parseConfirmation = parseConfirmation;
  if (typeof module !== "undefined") module.exports = { parseConfirmation };
})(typeof window !== "undefined" ? window : globalThis);
