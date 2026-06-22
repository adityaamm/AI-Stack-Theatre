# Deployment Walkthrough — AI Stack Overview Theatre

Follow these in order. Each step says exactly what to click/type and why.

## 1. Get a free Finnhub API key (Tier A live price/market-cap data)

1. Go to https://finnhub.io and click **Get free API key**.
2. Sign up with an email (no card required for the free tier).
3. Once logged in, your API key is shown on the Dashboard — copy it.
4. Keep this tab open; you'll paste the key into Netlify in Step 4.

## 2. Put the project in a GitHub repository

Netlify's Scheduled Functions and continuous deployment both work best from a Git
repository (rather than a one-off drag-and-drop upload), so future edits redeploy
automatically.

1. Create a new, empty repository on GitHub (e.g. `ai-stack-theatre`).
2. From the unzipped project folder on your machine, run:
   ```
   git init
   git add .
   git commit -m "Initial AI Stack Overview Theatre build"
   git branch -M main
   git remote add origin https://github.com/<your-username>/ai-stack-theatre.git
   git push -u origin main
   ```

## 3. Create the Netlify site

1. Go to https://app.netlify.com and sign up / log in (free, no card required).
2. Click **Add new site → Import an existing project**.
3. Choose **GitHub** and authorize Netlify to access your repository.
4. Select the `ai-stack-theatre` repo.
5. Build settings: leave them as detected — `netlify.toml` already sets the publish
   directory to `.` and the functions directory to `netlify/functions`. No build
   command is needed since this is a static site.
6. Click **Deploy site**. Netlify will give you a live URL immediately, e.g.
   `https://random-name-1234.netlify.app` — this is your public link. You can
   rename it or attach a custom domain later under **Site settings → Domain management**.

## 4. Set environment variables

1. In your new site, go to **Site settings → Environment variables**.
2. Add:
   - `FINNHUB_API_KEY` = the key you copied in Step 1.
   - `SEC_USER_AGENT` = a string identifying you to SEC EDGAR per their fair-access
     policy, e.g. `YourName your-email@example.com`.
3. Click **Save**, then trigger a redeploy (**Deploys → Trigger deploy → Deploy site**)
   so the functions pick up the new variables.

## 5. Confirm Blobs and Scheduled Functions are active

Both are native Netlify features and require no separate signup:
- **Blobs**: automatically provisioned the first time a function calls `getStore()` —
  nothing to switch on.
- **Scheduled Functions**: automatically detected from the `export const config = { schedule: ... }`
  block already in `scheduled-tier-a.js` and `scheduled-tier-b.js`. You can see them
  listed under **Functions** in the Netlify dashboard, including next run time.

## 6. Run the first refresh manually

The scheduled functions only run on their cadence (daily checks, with the 48-hour /
30-day guards) — so the very first time, trigger both manually to populate the store:

1. Visit `https://<your-site>.netlify.app/.netlify/functions/refresh` once in your browser
   (or `curl -X POST https://<your-site>.netlify.app/.netlify/functions/refresh`).
2. Visit `https://<your-site>.netlify.app/.netlify/functions/tier-b-refresh` once the same way.
3. Open your live site and click **Refresh** — it should now read real data from the store
   for the player entries currently configured (NVIDIA, AMD, Microsoft) rather than "pending."

## 7. Extend the player roster

`netlify/functions/refresh.js` currently tracks 3 example players. To extend coverage:

1. For each additional company, find its ticker and 10-digit SEC CIK (CIK lookup:
   `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&company=<name>&type=10-K`,
   or the `company_tickers.json` file SEC publishes).
2. Add an entry to `TRACKED_PLAYERS` in `refresh.js`:
   ```js
   { name: 'Company Name', ticker: 'TICK', cik: '0001234567' },
   ```
3. Commit and push — Netlify redeploys automatically.
4. Note: privately held companies (e.g. OpenAI, Anthropic) have no SEC CIK and no
   EDGAR data — their fundamentals fields will correctly stay "pending" / "not a
   public filer" rather than receiving fabricated figures.

## 8. Verify the two pending RSS endpoints before enabling

Two additional policy feeds are commented out pending endpoint verification in production. Confirm the live endpoint,
add it the same way as the existing entries, then redeploy.

## 9. Ongoing monitoring

- Netlify free tier: 300 credits/month shared across bandwidth, function compute,
  and deploys — check **Site settings → Usage** periodically.
- Finnhub free tier: rate-limited; the refresh cycle's call pattern (a handful of
  calls per refresh, not per visitor) is designed to stay well within it.
- SEC EDGAR: 10 requests/second cap — the per-refresh call volume here is far below that.

Once Steps 1–6 are done, you'll have a working public link. Steps 7–9 are ongoing
maintenance as you expand the player roster and verify the remaining sources.
