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
