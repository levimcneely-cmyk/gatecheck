"""End-to-end tests for the NRTC Logistics Hub.

Run from the repo root:   python3 nrtclogistics/dev/e2e.py
Needs:                    pip install playwright && playwright install chromium

Everything outside the page is simulated: the Apps Script backend (same rules as
apps-script/Code.gs, including refusing a save made on an outdated copy), map lookups,
drive times, time zones and Google Drive text recognition. Nothing real is called.
"""
import asyncio, hashlib, json, os, re, sys, threading, functools, datetime
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from playwright.async_api import async_playwright

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
PASS = "GRIDTECH"
PH = hashlib.sha256(PASS.encode()).hexdigest()
CORS = {"access-control-allow-origin": "*"}
FAILS = []


def check(name, ok, detail=""):
    print(("ok   - " if ok else "FAIL - ") + name + ("" if ok else f"  ({detail})"))
    if not ok:
        FAILS.append(name)


class Backend:
    """In-memory copy of the Apps Script: Store rows keyed by record, a global revision counter."""
    def __init__(self):
        self.rows, self.rev, self.ocr_text = {}, 0, ""

    async def handle(self, route):
        req = json.loads(route.request.post_data or "{}")
        def reply(o):
            return route.fulfill(status=200, content_type="application/json", headers=CORS, body=json.dumps(o))
        if hashlib.sha256(str(req.get("pass", "")).strip().upper().encode()).hexdigest() != PH:
            return await reply({"ok": False, "error": "passcode"})
        a = req.get("action")
        if a == "ping":
            return await reply({"ok": True})
        if a == "list":
            since = req.get("since", 0)
            return await reply({"ok": True, "rev": self.rev, "items": [dict(key=k, **v) for k, v in self.rows.items() if v["rev"] > since]})
        if a == "put":
            out = []
            for it in req["items"]:
                cur = self.rows.get(it["key"])
                if cur and it.get("baseRev") is not None and cur["rev"] != it["baseRev"]:
                    out.append(dict(key=it["key"], conflict=True, **cur)); continue
                self.rev += 1
                now = datetime.datetime.now(datetime.timezone.utc).isoformat()
                self.rows[it["key"]] = dict(rev=self.rev, updated=now, by=req.get("by", ""), value=it["value"])
                out.append(dict(key=it["key"], rev=self.rev, updated=now))
            return await reply({"ok": True, "rev": self.rev, "items": out})
        if a == "extract":
            return await reply({"ok": True, "text": self.ocr_text})
        return await reply({"ok": False, "error": "unknown action"})


def tz_for(lon):
    # coarse but right for the places used below: Denver/Hays, Nashville (Central), Greenwood (Eastern)
    return "America/Denver" if lon < -102 else "America/Chicago" if lon < -86.5 else "America/Indiana/Indianapolis"


async def outside_world(route):
    url = route.request.url
    if "api.open-meteo.com" in url:
        lon = float(re.search(r"longitude=(-?[\d.]+)", url).group(1))
        return await route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"timezone": tz_for(lon)}))
    if "valhalla" in url:
        return await route.fulfill(status=200, headers=CORS, content_type="application/json", body=json.dumps({"trip": {"summary": {"time": 4 * 3600, "length": 250}}}))
    return await route.abort()  # fonts, other map services: not needed


async def open_hub(browser, base, backend, name, width=1320, mobile=False):
    ctx = await browser.new_context(viewport={"width": width, "height": 900}, is_mobile=mobile, has_touch=mobile)
    pg = await ctx.new_page()
    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    pg.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
    await pg.route("**/script.google.com/**", backend.handle)
    await pg.route(re.compile(r"^https://(?!script\.google\.com).*"), outside_world)
    await pg.goto(f"{base}/nrtclogistics/")
    await pg.fill("#gatePass", PASS.lower())
    await pg.select_option("#gateMe", name)
    await pg.click("#gateForm button")
    await pg.wait_for_timeout(700)
    return pg, errors


async def main():
    class Quiet(SimpleHTTPRequestHandler):
        def log_message(self, *a):
            pass
    handler = functools.partial(Quiet, directory=ROOT)
    srv = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    base = f"http://127.0.0.1:{srv.server_port}"
    backend = Backend()

    async with async_playwright() as p:
        b = await p.chromium.launch()

        # 1. Unlocks and renders; no long dashes in the email
        levi, lerr = await open_hub(b, base, backend, "Levi McNeely")
        text = await levi.evaluate("emailText(trip(), DB.opts)")
        check("unlocks and shows the example trip", "WCE Executive Readout" in text, text[:80])
        check("email has no long dashes", "—" not in text and "&mdash;" not in await levi.evaluate("emailHTML(trip(), DB.opts)"))

        # 2. Old trips (co-ops referenced by position) are converted to permanent co-op ids
        await levi.evaluate("""(() => { const t = {id:'old1', title:'Old trip', travelers:[], notes:'', coops:[{name:'A', town:'Hays', state:'KS'},{name:'B', town:'WaKeeney', state:'KS'}],
            items:[{id:'m1', type:'meeting', date:'2026-12-08', title:'B meeting', coop:'B', start:'10:00', loc:{ref:'coop:1'}, travelers:[]}]};
            migrateTrip(t); DB.trips.push(t); DB.current='old1'; save(); render(); })()""")
        loc = await levi.evaluate("trip().items[0].loc.ref")
        check("old co-op reference converted to an id", loc.startswith("coop:c-"), loc)
        await levi.evaluate("trip().coops.splice(0, 1); save(); render();")
        where = await levi.evaluate("resolvePlace(trip(), trip().items[0].loc).long")
        check("removing a co-op doesn't misdirect the meeting", where.startswith("B"), where)

        # 3. Shared trips + two people editing the same trip at once
        await levi.click("#newTrip"); await levi.fill("#tripTitle", "Hays visit")
        await levi.click("[data-person='Thomas McCollum']"); await levi.click("[data-person='Levi McNeely']")
        await levi.wait_for_timeout(1500)
        tid = await levi.evaluate("trip().id")
        check("trip saved to the backend", f"trip:{tid}" in backend.rows)
        thomas, terr = await open_hub(b, base, backend, "Thomas McCollum")
        await thomas.evaluate(f"DB.current = '{tid}'; render();")
        check("teammate sees the trip", await thomas.evaluate("trip().title") == "Hays visit")
        # both add an item without seeing each other's change
        await levi.evaluate("""(() => { trip().items.push({id:'hotel1', type:'hotel', date:'2026-12-07', outDate:'2026-12-09', name:'Hilton Garden Inn Hays', city:'Hays, KS', travelers:[]}); save(); })()""")
        await thomas.evaluate("""(() => { trip().items.push({id:'fl1', type:'flight', date:'2026-12-07', travelers:['Thomas McCollum'], from:'BNA', to:'DEN', dep:'07:00', arr:'08:45', dir:'auto'}); save(); })()""")
        await levi.wait_for_timeout(1600); await thomas.wait_for_timeout(1600)
        await levi.evaluate("pull()"); await thomas.evaluate("pull()")
        await levi.wait_for_timeout(1500); await thomas.wait_for_timeout(800)
        await levi.evaluate("pull()"); await levi.wait_for_timeout(600)
        server_ids = sorted(i["id"] for i in backend.rows[f"trip:{tid}"]["value"]["items"])
        levi_ids = sorted(await levi.evaluate("trip().items.map(i => i.id)"))
        thomas_ids = sorted(await thomas.evaluate("trip().items.map(i => i.id)"))
        check("simultaneous edits: both items kept on the server", server_ids == ["fl1", "hotel1"], server_ids)
        check("simultaneous edits: both people see both items", levi_ids == thomas_ids == ["fl1", "hotel1"], (levi_ids, thomas_ids))

        # 4. Time zones: arrive by 12:45 CT from an Eastern start, 4-hour drive
        await levi.evaluate("""(() => { const t = trip(); t.coops.push({id:'c-x', name:'Test Co-op', town:'Hays', state:'KS', lat:38.88, lon:-99.33});
            t.items.push({id:'dr1', type:'drive', date:'2026-12-07', from:{ref:'custom', label:'Greenwood, IN', lat:39.61, lon:-86.11}, to:{ref:'coop:c-x'}, minutes:240, manual:true, arriveBy:'12:45', travelers:[]});
            save(); })()""")
        await levi.evaluate("zonesFor(trip(), trip().items.find(i => i.id === 'dr1')).then(() => { save(); render(); })")
        await levi.wait_for_timeout(500)
        line = [l for l in (await levi.evaluate("emailText(trip(), DB.opts)")).split("\n") if "Drive Greenwood" in l]
        check("cross-zone drive leaves 9:45 ET to arrive by 12:45 CT", bool(line) and "9:45 AM ET" in line[0] and "12:45 PM CT" in line[0], line)

        # 5. One person's version
        await levi.select_option("#personSel", "Thomas McCollum"); await levi.wait_for_timeout(200)
        ttext = await levi.evaluate("emailText(trip(), DB.opts)")
        check("person view: only that person's items, no name tags", "BNA" in ttext and "[Thomas]" not in ttext and "Itinerary for Thomas McCollum" in ttext)
        check("person view: subject names them", "(Thomas)" in await levi.inner_text("#subject"))

        # 6. Calendar file
        cal = await levi.evaluate("buildICS(trip(), DB.opts)")
        txt = cal["text"]
        check("calendar file has an event per timed item", cal["count"] >= 3 and txt.count("BEGIN:VEVENT") == cal["count"], cal["count"])
        # BNA (Central) 07:00 on Dec 7 = 13:00 UTC
        check("flight time converted to UTC from the airport's zone", "DTSTART:20261207T130000Z" in txt, re.findall(r"DTSTART[^\r\n]*", txt))
        check("hotel is an all-day event across the stay", "DTSTART;VALUE=DATE:20261207" in txt and "DTEND;VALUE=DATE:20261209" in txt)
        await levi.select_option("#personSel", ""); await levi.wait_for_timeout(200)

        # 7. Mileage
        await levi.evaluate("DB.opts.miles = true; trip().items.find(i => i.id === 'dr1').miles = 250; save(); renderPreview();")
        mtext = await levi.evaluate("emailText(trip(), DB.opts)")
        check("mileage line at $0.76/mi", "250 mi in a personal car ($190.00 at $0.76/mi)" in mtext, [l for l in mtext.split("\n") if "Mileage" in l])
        await levi.evaluate("trip().items.push({id:'rc1', type:'rental', date:'2026-12-07', retDate:'2026-12-09', driver:'Levi McNeely', pickup:'DEN', company:'National'}); save(); renderPreview();")
        mtext = await levi.evaluate("emailText(trip(), DB.opts)")
        check("drives while a rental is out count as rental miles", "250 mi in the rental car" in mtext)

        # 8. Trips overview
        await levi.click("#tripsBtn"); await levi.wait_for_timeout(200)
        body = await levi.inner_text("#tripsBody")
        check("trips overview lists upcoming trips", "Hays visit" in body and "Upcoming" in body.title() or "UPCOMING" in body.upper())
        await levi.click("#tripsDlg .dlg-h .btn")

        # 9. Reading a confirmation (simulated Drive text recognition)
        backend.ocr_text = "Southwest\nConfirmation # GH5K2P\nPassenger: LEVI MCNEELY\nMonday, 12/07/2026\nFLIGHT # 1234\nDepart IND 6:05 AM\nChange planes in MDW\nFLIGHT # 2567\nDepart MDW 7:15 AM Arrive DEN 8:50 AM"
        png = os.path.join(os.path.dirname(__file__), "sample.png")
        if not os.path.exists(png):
            with open(png, "wb") as f:  # 1x1 white PNG
                f.write(bytes.fromhex("89504e470d0a1a0a0000000d4948445200000001000000010802000000907753de0000000c4944415408d763f8ffff3f0005fe02fea7d6a4b60000000049454e44ae426082"))
        await levi.set_input_files("#dropFile", png); await levi.wait_for_timeout(1200)
        rows = await levi.locator("#importList .imp-row").all_inner_texts()
        check("confirmation read into two flight legs", len(rows) == 2 and "IND" in rows[0] and "DEN" in rows[1], rows)
        await levi.click("#importDlg .dlg-f .btn")

        # 10. Phone layout fits the screen
        phone, perr = await open_hub(b, base, backend, "Levi McNeely", width=390, mobile=True)
        check("phone: no sideways scrolling", await phone.evaluate("document.documentElement.scrollWidth") <= 390)

        check("no page errors", not (lerr or terr or perr), lerr + terr + perr)
        await b.close()
    srv.shutdown()
    print(f"\n{'ALL PASSED' if not FAILS else str(len(FAILS)) + ' FAILED'}")
    sys.exit(1 if FAILS else 0)


asyncio.run(main())
