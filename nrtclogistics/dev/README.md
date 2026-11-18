# Tests for the NRTC Logistics Hub

Run from the repo root before pushing a change:

```
node nrtclogistics/dev/test_merge.js   # two people editing one trip: merge rules
node nrtclogistics/dev/test_time.js    # time-zone math for drives
node nrtclogistics/dev/test_parse.js   # reading confirmations (OCR text → flights, hotels, rentals)
python3 nrtclogistics/dev/e2e.py       # the whole hub in a real browser, everything outside it simulated
```

`e2e.py` needs Playwright once: `pip install playwright && playwright install chromium`.
It never touches the real Google Sheet: the Apps Script, map lookups, drive times, time zones
and Drive text recognition are all simulated, with the same save rules as `apps-script/Code.gs`.
