# Gate Check

A live-updating airport ranking site. It's a **single HTML file** — CSS and
JS are inlined, nothing to build. It pulls straight from your two published
Google Sheet CSVs on every page load, so once it's deployed you never have to
touch the site again — just fill out the form after a flight.

## How it works

Everything lives in `index.html`:
- a `<style>` block with the departure-board styling
- a `<script>` block that has an `AIRPORTS` lookup (IATA code → name/city/
  state — add a line here for any new code you want a full name for),
  fetches both CSVs, does the scoring math, and renders the board

Scoring: each response's Cleanliness / Space / Workability / Food Options /
Taxi Time come in as numbers already. Delay and Rental Car Situation come in
as text and get converted to a 0–10 rating using the "Type/Rating" table in
your Misc sheet. Every category is then averaged across all visits to that
airport, and the weighted average (using the "Question/Weight" table) becomes
the total score.

## Deploy to GitHub Pages (no domain needed)

1. Create a new **public** GitHub repo (e.g. `airport-rankings`).
2. Upload `index.html` to the repo root — drag-and-drop on github.com works
   fine, or:
   ```
   git init
   git add index.html
   git commit -m "Gate Check"
   git branch -M main
   git remote add origin https://github.com/<you>/airport-rankings.git
   git push -u origin main
   ```
3. In the repo, go to **Settings → Pages**.
4. Under **Build and deployment**, set Source to **Deploy from a branch**,
   branch `main`, folder `/ (root)`. Save.
5. GitHub gives you a URL like:
   `https://<you>.github.io/airport-rankings/`
   It usually takes a minute or two to go live after the first push.

No custom domain, no build step, no server — it's fully static and reads
your sheets live over HTTPS.

## Keeping the sheets published

The site fetches the CSV export links directly, which only works while both
sheets stay **File → Share → Publish to web** in your Google Sheet. If you
ever unpublish or change the sheet/tab, the CSV URLs (and the `gid=` values
in `app.js`) will need to be updated to match.

## Adding a new airport

Nothing to do — new airport codes from the form show up automatically. If
you want the full airport name/city to display instead of just the code,
add an entry to the `AIRPORTS` object in `airports.js`.

## Local preview

Any static file server works, e.g. from this folder:
```
python3 -m http.server 8000
```
then open `http://localhost:8000`.

## NRTC Logistics Hub (`/nrtclogistics/`)

Unlinked, `noindex`, passcode-protected trip planner at `/gatecheck/nrtclogistics/`: builds team
itineraries and copies them into Outlook.

| File | What it holds |
|---|---|
| `index.html` | Page markup; `window.SYNC_URL` (Apps Script URL) in `<head>` |
| `style.css` | All styles (NRTC brand colors at the top, phone layout, print) |
| `js/core.js` | Helpers, storage, co-op ids, places, geocoding, drive times, time zones, shared lookup cache |
| `js/merge.js` | Three-way merge so two people editing one trip don't erase each other |
| `js/itinerary.js` | Items → ordered rows; email HTML/text; one-person view; mileage |
| `js/ui.js` | Rendering, trip editing, item forms, copy/print |
| `js/import.js` | Reading confirmations (screenshot/PDF) |
| `js/views.js` | Add to calendar (.ics), Trips overview, mileage rate |
| `js/app.js` | Team, backup, sync, passcode gate, boot |
| `airports.js`, `parse.js` | Airport table (OurAirports); confirmation text parser |
| `apps-script/Code.gs` | Backend in the Google Sheet: passcode, Store tab, conflict-checked saves, Drive OCR |
| `dev/` | Tests — run them before pushing (see `dev/README.md`) |

- Data: Sheet tab `Store`, one row per record (`trip:<id>`, `team`, `territories`, `cache`).
  Saves carry the version they were made on; a save on an outdated copy is refused and merged.
- Outside services (all free, no keys): Valhalla/OSRM drive times, Nominatim/Open-Meteo/Photon
  places, Open-Meteo time zones, Google Drive text recognition (in the Apps Script).
