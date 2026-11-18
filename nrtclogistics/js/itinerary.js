// NRTC Logistics Hub — Turning items into ordered rows; email HTML and plain text.
// Loaded in order by index.html as classic scripts (they share top-level names).
"use strict";
/* ================== Itinerary rows (shared by list, email, text) ================== */
function whoTag(t, names) {
  names = (names || []).filter(Boolean);
  if (!names.length) return "";
  const all = t.travelers || [];
  if (all.length && all.every((n) => names.includes(n)) && names.length === all.length) return "";
  const f = names.map(first);
  return f.length <= 2 ? f.join(" & ") : `${f.slice(0, -1).join(", ")} & ${f.at(-1)}`;
}
function flightDir(it) {
  if (it.dir && it.dir !== "auto") return it.dir;
  const homes = ((it.travelers && it.travelers.length) ? it.travelers : trip().travelers).map(homeOf);
  if (homes.includes((it.to || "").toUpperCase())) return "out";
  if (homes.includes((it.from || "").toUpperCase())) return "in";
  return it.arr ? "in" : "out";
}
// Where an item happens, as a drive destination ref
function destRef(x) { return x.type === "meeting" ? x.loc && x.loc.ref : x.type === "meal" ? `meal:${x.id}` : null; }
function flightLabel(it) { return [it.airline, it.number].filter(Boolean).join(" "); }

function buildRows(t, opts) {
  opts = opts || { conf: true, addr: true, miles: false };
  const rows = [];
  const conf = (c) => (opts.conf && c ? `Conf # ${c}` : "");
  const join = (...a) => a.filter(Boolean).join(" · ");

  t.items.forEach((it, idx) => {
    const base = { item: it, idx, type: it.type };
    if (it.type === "flight") {
      const d = flightDir(it), fl = flightLabel(it), who = whoTag(t, it.travelers);
      const from = (it.from || "").toUpperCase(), to = (it.to || "").toUpperCase();
      if (d === "in") {
        rows.push({ ...base, date: it.arrDate || it.date, key: toMin(it.arr), time: fmtTime(it.arr), who,
          what: `Land ${to}`, detail: join(fl, from && `from ${from}`, it.dep && `departs ${fmtTime(it.dep)}`, conf(it.conf)) });
      } else if (d === "out") {
        rows.push({ ...base, date: it.date, key: toMin(it.dep), time: fmtTime(it.dep), who,
          what: `Leave ${from}`, detail: join(fl, to && `to ${to}`, it.arr && `lands ${fmtTime(it.arr)}`, conf(it.conf)) });
      } else {
        rows.push({ ...base, date: it.date, key: toMin(it.dep), time: fmtTime(it.dep), who,
          what: `Fly ${from} → ${to}`, detail: join(fl, it.arr && `lands ${fmtTime(it.arr)}`, conf(it.conf)) });
      }
    } else if (it.type === "rental") {
      const ap = (it.pickup || "").toUpperCase();
      rows.push({ ...base, date: it.date, key: toMin(it.time), time: fmtTime(it.time), who: "",
        what: `${first(it.driver) || "Rental"}${it.driver ? " has rental car" : " car"}`, detail: join(it.company, ap && `pick up at ${ap}`, conf(it.conf)) });
      if (it.retDate) rows.push({ ...base, date: it.retDate, key: toMin(it.retTime), time: fmtTime(it.retTime), who: "", ret: true,
        what: "Return rental car", detail: join(ap && `at ${ap}`, first(it.driver)) });
    } else if (it.type === "hotel") {
      const nights = it.outDate ? Math.round((dateObj(it.outDate) - dateObj(it.date)) / 864e5) : 0;
      rows.push({ ...base, date: it.date, key: toMin(it.time) ?? 1430, time: fmtTime(it.time), who: whoTag(t, it.travelers),
        what: `Hotel: ${it.name || "TBD"}`, detail: join(opts.addr && (it.address || it.city), nights > 1 && `${nights} nights`, conf(it.conf)) });
    } else if (it.type === "drive") {
      const A = resolvePlace(t, it.from), B = resolvePlace(t, it.to);
      const dur = it.minutes != null ? `${it.est ? "~" : ""}${fmtDur(it.minutes)}` : "";
      // "Arrive by" drives the schedule: leave = arrive-by minus drive time (rounded down to 5 min),
      // converted between time zones when the two ends are in different ones
      const dt = driveTimes(it);
      const leave = toMin(dt.leave);
      rows.push({ ...base, date: it.date, key: leave ?? (dt.arrive ? toMin(dt.arrive) - 1 : null), time: dt.leave ? `${fmtTime(dt.leave)}${dt.cross ? ` ${dt.aAbbr}` : ""}` : "", who: whoTag(t, it.travelers),
        what: `Drive ${A ? A.short : "?"} → ${B ? B.short : "?"}`,
        detail: join(dur && `${dur}${opts.miles && it.miles ? ` (${it.miles} mi)` : ""}`, dt.arrive && `${dt.byArrive ? "arrive by" : "arrive ~"}${dt.byArrive ? " " : ""}${fmtTime(dt.arrive)}${dt.cross ? ` ${dt.bAbbr}` : ""}`, it.note) });
    } else if (it.type === "meeting") {
      const P = resolvePlace(t, it.loc);
      const where = it.loc && it.loc.ref === "custom" ? it.loc.label : P && P.ref.startsWith("hotel:") ? P.long : (P && P.address) || "";
      rows.push({ ...base, date: it.date, key: toMin(it.start), time: fmtRange(it.start, it.end), who: whoTag(t, it.travelers),
        what: it.title || "Meeting", detail: join(it.coop && !(it.title || "").includes(it.coop) ? it.coop : "", opts.addr && where, it.virtual && "Virtual", it.note) });
    } else if (it.type === "meal") {
      const dflt = { Breakfast: 450, Lunch: 720, Dinner: 1110 }[it.kind];
      rows.push({ ...base, date: it.date, key: toMin(it.time) ?? dflt ?? null, time: fmtTime(it.time), who: whoTag(t, it.travelers),
        what: `${it.kind || "Meal"}${it.place ? `: ${it.place}` : ""}`, detail: join(opts.addr && it.address, it.res && (opts.conf ? `Reservation: ${it.res}` : "Reservation made"), it.note) });
    } else if (it.type === "note") {
      rows.push({ ...base, date: it.date, key: toMin(it.time), time: fmtTime(it.time), who: whoTag(t, it.travelers), what: it.text || "", detail: "" });
    }
  });

  // Smart ordering for rows without a time.
  const byDate = {};
  rows.forEach((r) => (byDate[r.date] = byDate[r.date] || []).push(r));
  Object.values(byDate).forEach((list) => {
    const lands = list.filter((r) => r.type === "flight" && r.key != null && r.what.startsWith("Land"));
    const landAt = (ap, names) => lands.filter((r) => r.what === `Land ${ap}` && (!names || !r.item.travelers.length || names.some((n) => r.item.travelers.includes(n)))).map((r) => r.key);
    list.forEach((r) => {
      if (r.key != null) return;
      const it = r.item;
      if (r.type === "rental" && !r.ret) {
        const k = landAt((it.pickup || "").toUpperCase(), [it.driver]); if (k.length) r.key = Math.max(...k) + 0.3;
      }
      if (r.type === "drive") {
        const A = it.from && it.from.ref, B = it.to && it.to.ref;
        if (A && A.startsWith("ap:")) { const k = landAt(A.slice(3)); if (k.length) r.key = Math.max(...k) + 0.6; }
        if (r.key == null) {
          const mEnd = list.filter((m) => m.type === "meeting" && m.item.loc && m.item.loc.ref === A && m.item.loc.ref !== "custom" && m.item.end).map((m) => toMin(m.item.end));
          if (mEnd.length) r.key = Math.max(...mEnd) + 0.5;
        }
        if (r.key == null && it.minutes != null) {
          const next = list.filter((m) => m.key != null && B && B !== "custom" && (m.type === "meeting" || m.type === "meal") && destRef(m.item) === B).sort((a, b) => a.key - b.key)[0];
          if (next) {
            // No arrive-by set: aim to arrive 15 min before the meeting there
            const dt = driveTimes(it, fromMin(next.key - (next.type === "meal" ? 5 : 15)));
            r.key = toMin(dt.leave); r.time = `${fmtTime(dt.leave)}${dt.cross ? ` ${dt.aAbbr}` : ""}`;
            r.detail = [r.detail, `arrive by ${fmtTime(dt.arrive)}${dt.cross ? ` ${dt.bAbbr}` : ""}`].filter(Boolean).join(" · ");
          }
        }
      }
    });
    let last = 0, bump = 0;
    list.forEach((r) => { if (r.key == null) { bump += 0.01; r.key = last + bump; } else { last = r.key; bump = 0; } });
  });
  rows.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.key - b.key || a.idx - b.idx));
  return rows;
}
function groupDays(rows) {
  const days = []; rows.forEach((r) => { const d = days.at(-1); if (d && d.date === r.date) d.rows.push(r); else days.push({ date: r.date, rows: [r] }); });
  return days;
}
function tripRange(t) {
  const ds = buildRows(t).map((r) => r.date).filter(Boolean).sort();
  if (!ds.length) return "";
  const a = dateObj(ds[0]), b = dateObj(ds.at(-1)), y = b.getFullYear();
  if (ds[0] === ds.at(-1)) return a.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  const sameMonth = a.getMonth() === b.getMonth();
  return `${fmtShort(ds[0])}–${sameMonth ? b.getDate() : fmtShort(ds.at(-1))}, ${y}`;
}

/* ================== Email output ================== */
/* ---------- One person's version, and mileage ---------- */
function viewPerson(t, opts) { const p = opts && opts.person; return p && t.travelers.includes(p) ? p : ""; }
// Is this item part of that person's trip? (no names on an item = everyone; a rental car is everyone's ride)
function forPerson(it, p) { return it.type === "rental" || !(it.travelers && it.travelers.length) || it.travelers.includes(p); }
function personRows(t, opts) {
  const rows = buildRows(t, opts), p = viewPerson(t, opts);
  return p ? rows.filter((r) => forPerson(r.item, p)).map((r) => Object.assign({}, r, { who: "" })) : rows;
}
const MILE_RATE_KEY = "nrtclog:mileRate";
const DEFAULT_MILE_RATE = 0.76; // IRS business rate from July 1, 2026 (72.5¢ before that)
function mileRate() { const v = parseFloat(localStorage.getItem(MILE_RATE_KEY)); return v > 0 ? v : DEFAULT_MILE_RATE; }
// Drive miles split into personal-car miles (reimbursable) and miles driven while a rental car was out
function mileage(t, opts) {
  const p = viewPerson(t, opts), rows = buildRows(t), end = rows.length ? rows.at(-1).date : "";
  const rentals = t.items.filter((i) => i.type === "rental" && i.date);
  let personal = 0, rental = 0;
  t.items.filter((d) => d.type === "drive" && d.miles && (!p || forPerson(d, p))).forEach((d) => {
    if (rentals.some((r) => d.date >= r.date && d.date <= (r.retDate || end))) rental += d.miles; else personal += d.miles;
  });
  const rate = mileRate();
  return { personal, rental, rate, amount: Math.round(personal * rate * 100) / 100 };
}
function mileageLine(t, opts) {
  const m = mileage(t, opts); if (!m.personal && !m.rental) return "";
  const parts = [];
  if (m.personal) parts.push(`${m.personal} mi in a personal car ($${m.amount.toFixed(2)} at $${m.rate.toFixed(3).replace(/0$/, "")}/mi)`);
  if (m.rental) parts.push(`${m.rental} mi in the rental car`);
  return `Mileage: ${parts.join(" · ")}`;
}

function subjectLine(t, opts) {
  const coop = t.coops.filter((c) => c.name).map((c) => c.name).join(" / ");
  const bits = [t.title && t.title.replace(/\s*\(example\)$/i, ""), !t.title && coop].filter(Boolean);
  const r = tripRange(t);
  const p = viewPerson(t, opts);
  return `Travel: ${bits.join(" ") || "Trip"}${p ? ` (${first(p)})` : ""}${r ? `, ${r}` : ""}`;
}
function emailHTML(t, opts) {
  // Bold only on: day headers and co-op meetings.
  // Built for Outlook's Word engine: every run of text is its own <span> with an explicit weight,
  // and bold only ever comes from <b> around that exact text — so nothing bleeds into the rest.
  const FONT = "font-family:'Century Gothic',Calibri,Arial,Helvetica,sans-serif;";
  const sp = (txt, { size = "10.5pt", color = "#1a1a1a", bold = false } = {}) => {
    const run = `<span style="${FONT}font-size:${size};color:${color};font-weight:normal;">${txt}</span>`;
    return bold ? `<b style="font-weight:bold;">${run.replace("font-weight:normal", "font-weight:bold")}</b>` : run;
  };
  const P = (inner, extra = "") => `<p style="margin:0 0 2px;${extra}">${inner}</p>`;
  const days = groupDays(personRows(t, opts)), person = viewPerson(t, opts);
  const anyWho = days.some((d) => d.rows.some((r) => r.who));
  const whoW = Math.max(60, ...days.flatMap((d) => d.rows.map((r) => (r.who || "").length * 8 + 12)));
  const coops = t.coops.filter((c) => c.name);
  let h = `<div>`;
  if (t.title) h += P(sp(esc(t.title.replace(/\s*\(example\)$/i, "")), { size: "14pt", color: "#191919" }), "border-left:4px solid #E31F26;padding-left:8px;");
  const meta = [];
  const range = tripRange(t); if (range) meta.push(esc(range));
  if (coops.length) meta.push(coops.map((c) => `${esc(c.name)}${c.town ? ` (${esc([c.town, c.state].filter(Boolean).join(", "))})` : ""}`).join("; "));
  const rbms = [...new Set(coops.map(coopRBM).filter(Boolean))];
  const gray = { color: "#444444" };
  if (meta.length) h += P(sp(meta.join(" &nbsp;|&nbsp; "), gray));
  if (rbms.length) h += P(sp("RBM:", gray) + sp(" " + rbms.map(esc).join(", "), gray));
  if (t.travelers.length) h += P(sp("Travelers:", gray) + sp(" " + t.travelers.map(esc).join(", "), gray));
  if (person) h += P(sp(`Itinerary for ${esc(person)}`, gray));
  if (t.notes) h += P(sp(esc(t.notes).replace(/\n/g, "<br>")), "margin-top:8px;");
  if (!days.length) h += P(sp("Nothing on the itinerary yet.", { color: "#888888" }), "margin-top:14px;");
  const td = (inner, style) => `<td style="padding:3px 12px 3px 0;vertical-align:top;${style || ""}">${inner || "&nbsp;"}</td>`;
  days.forEach((d) => {
    h += P(sp(esc(fmtDay(d.date)), { color: "#006666", bold: true }), "margin:16px 0 4px;padding:0 0 3px;border-bottom:2px solid #4BB9B5;");
    h += `<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">`;
    d.rows.forEach((r) => {
      h += `<tr>`;
      h += td(r.time ? sp(esc(r.time), { color: "#333333" }) : "", `width:118px;white-space:nowrap;`).replace("<td ", '<td width="118" ');
      if (anyWho) h += td(r.who ? sp(esc(r.who), { color: "#B21424" }) : "", `width:${whoW}px;white-space:nowrap;`).replace("<td ", `<td width="${whoW}" `);
      h += td(sp(esc(r.what), { bold: r.type === "meeting" && !!r.item.coop }) + (r.detail ? sp(" &middot; " + esc(r.detail), { color: "#666666" }) : ""), "padding-right:0;");
      h += `</tr>`;
    });
    h += `</table>`;
  });
  if (opts && opts.miles) { const ml = mileageLine(t, opts); if (ml) h += P(sp(esc(ml), gray), "margin-top:16px;"); }
  return h + `</div>`;
}
function emailText(t, opts) {
  const out = [];
  if (t.title) out.push(t.title.replace(/\s*\(example\)$/i, ""));
  const range = tripRange(t), coops = t.coops.filter((c) => c.name);
  const meta = [range, coops.map((c) => `${c.name}${c.town ? ` (${[c.town, c.state].filter(Boolean).join(", ")})` : ""}`).join("; ")].filter(Boolean);
  if (meta.length) out.push(meta.join(" | "));
  const rbms = [...new Set(coops.map(coopRBM).filter(Boolean))];
  if (rbms.length) out.push(`RBM: ${rbms.join(", ")}`);
  if (t.travelers.length) out.push(`Travelers: ${t.travelers.join(", ")}`);
  const person = viewPerson(t, opts); if (person) out.push(`Itinerary for ${person}`);
  if (t.notes) out.push("", t.notes);
  groupDays(personRows(t, opts)).forEach((d) => {
    out.push("", fmtDay(d.date));
    d.rows.forEach((r) => {
      const time = (r.time || "").padEnd(15);
      out.push(`  ${time}${r.who ? `[${r.who}] ` : ""}${r.what}${r.detail ? ` · ${r.detail}` : ""}`.replace(/\s+$/, ""));
    });
  });
  if (opts && opts.miles) { const ml = mileageLine(t, opts); if (ml) out.push("", ml); }
  return out.join("\n");
}
