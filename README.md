# AI Stack Overview Theatre — Build Notes

## What is fully built and functional right now

- **Front end** (`index.html`): landing page with animated network-style background,
  illuminated title and Enter button, source/methods dialogue (closable), full
  disclaimer dialogue, 9-layer horizontal waterfall stack with animated flow arrows,
  hover descriptions per layer, layer drill-down (overview, sub-components, players
  table, TAM/TOM block, latest-developments banner), second-level sub-component
  drill-down modal, top news ticker with pulsating Refresh button, consolidated
  single-statement timestamp, and a persistent floating disclaimer bar.
- **Backend** (`netlify/functions/*.js`): real, working code (not pseudocode) that
  calls Finnhub, SEC EDGAR, the approved RSS feeds, World Bank, IMF, and Eurostat —
  recomputes the RAG score and projection range deterministically — and reads/writes
  Netlify Blobs. No function anywhere calls Claude, the Anthropic API, or any chat
  interface, satisfying the standing instruction that runtime refresh must be fully
  self-contained.
- **Scheduling**: `scheduled-tier-a.js` and `scheduled-tier-b.js` implement the
  daily-check + elapsed-time-guard pattern (48 hours for Tier A, 30 days for Tier B)
  using Netlify's native Scheduled Functions — no external cron service.

## What is intentionally left unpopulated, and why

Every financial figure in the players table (market cap, revenue, P/E, debt, FCF,
order book value, price history, RAG score) currently renders as **"pending"**
rather than a number. This is deliberate: this chat environment cannot make live
outbound API calls, so any number I hardcoded here would be unverifiable by you and
would risk presenting an unverified figure as fact — exactly what you've asked this
build to avoid throughout. Once deployed (next step), the Refresh button and the
scheduled functions populate these fields for real, from the named sources only.

Similarly, the news ticker shows "Awaiting live refresh" placeholders tagged to
their real, approved source names — the tag is real, the headline text is not,
again to avoid fabricating a news item.

`TRACKED_PLAYERS` in `refresh.js` currently has three example entries (NVIDIA, AMD,
Microsoft) with their real SEC CIK numbers, to demonstrate the working pattern. The
full roster across all nine layers needs each company's correct ticker and CIK
added the same way before deployment — I did not fabricate CIK numbers for the
remaining players rather than risk an incorrect identifier.

## Governance rules enforced in code, not just narratively

- `APPROVED_FEEDS` in `refresh.js` contains only the Strongest/Strong-tier sources
  confirmed earlier (TechCrunch, NIST, Federal Register, Federal Reserve, WHO) —
  Two additional policy feeds are commented out pending URL verification.
- `tier-b-refresh.js` only calls World Bank, IMF, and Eurostat's structured APIs,
  plus an edition-presence check (not a scrape) for Stanford HAI and WEF.
- The RSS parser silently drops a feed that fails rather than substituting any
  placeholder content, consistent with "never fabricate a missing source."
- Order-book-value and similar undisclosed fields are designed to render literally
  as "not disclosed in public domain" once Tier B data exists for a player — never
  estimated.

## Next step

Deployment walkthrough (Netlify account, connecting this repository, setting the
`FINNHUB_API_KEY` and `SEC_USER_AGENT` environment variables, enabling Blobs and
Scheduled Functions, and getting the live public link) — ready whenever you want
to proceed.
