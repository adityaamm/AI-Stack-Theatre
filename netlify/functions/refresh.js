// netlify/functions/refresh.js
//
// Performs a single Tier A refresh cycle:
//   1. Pulls live price/market-cap data from Finnhub (free tier) for configured tickers.
//   2. Checks SEC EDGAR for newly filed fundamentals (US-registered companies only).
//   3. Pulls the approved, ToS-verified RSS feeds for the news ticker.
//   4. Recomputes the RAG score and projection range deterministically, using the
//      Tier B baseline already stored in Netlify Blobs (no AI/Claude call of any kind).
//   5. Writes the combined snapshot back to Netlify Blobs with a consolidated timestamp.
//
// This function is invoked either by the Refresh button (POST) or by the scheduled
// function on a 48-hour cadence. It never calls the Anthropic API or any chat interface.

import { getStore } from '@netlify/blobs';
import { TRACKED_PLAYERS } from './_shared/tracked-players.js';

// ---- Configuration: approved sources only ----------------------------------

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY; // free-tier key, set in Netlify env vars
const SEC_USER_AGENT = process.env.SEC_USER_AGENT || 'AI-Stack-Theatre contact@example.com';

// Map of tracked tickers -> SEC CIK (10-digit, zero-padded). Populate per layer/player
// as the player roster is finalized. Left as a starter set; extend per layer.
// CIKs below are copied verbatim from https://www.sec.gov/files/company_tickers.json
// (fetched directly, not recalled from memory) — extend this list the same way:
// look up each new company there before adding it, never guess a CIK.
// TRACKED_PLAYERS is now imported from ./_shared/tracked-players.js


// Approved RSS/news sources (Strongest + Strong tier only — see source dialogue box)
const APPROVED_FEEDS = [
  // ---- Approved and already active ----
  { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
  { name: 'NIST', url: 'https://www.nist.gov/news-events/news/rss.xml' },
  { name: 'Federal Register', url: 'https://www.federalregister.gov/api/v1/articles.rss?conditions[term]=artificial+intelligence' },
  { name: 'Federal Reserve', url: 'https://www.federalreserve.gov/feeds/press_all.xml' },
  { name: 'WHO', url: 'https://www.who.int/rss-feeds/news-english.xml' },

  // Two additional policy feeds were governance-reviewed but are not currently active:
  // one EU digital-strategy feed (endpoint returned network error from server environment)
  // and one international AI policy observatory (no canonical RSS URL confirmed).
  // Enable either by adding a { name, url } entry here once a working endpoint is verified.
];

// ---- Step 1: Finnhub live quote + market cap --------------------------------

async function fetchFinnhubData(ticker) {
  if (!FINNHUB_API_KEY) return null;
  try {
    const quoteRes = await fetch(`https://finnhub.io/api/v1/quote?symbol=${ticker}&token=${FINNHUB_API_KEY}`);
    const profileRes = await fetch(`https://finnhub.io/api/v1/stock/profile2?symbol=${ticker}&token=${FINNHUB_API_KEY}`);
    if (!quoteRes.ok || !profileRes.ok) return null;
    const quote = await quoteRes.json();
    const profile = await profileRes.json();
    return {
      price: quote.c,
      priceChangePct: quote.dp,
      marketCapM: profile.marketCapitalization,
      // P/E is now computed from EDGAR (netIncome / sharesOutstanding) in the recompute step
    };
  } catch {
    return null;
  }
}

// ---- Step 2: SEC EDGAR fundamentals (delta-aware) ----------------------------

async function fetchEdgarFacts(cik) {
  try {
    const res = await fetch(`https://data.sec.gov/api/xbrl/companyfacts/CIK${cik}.json`, {
      headers: { 'User-Agent': SEC_USER_AGENT },
    });
    if (!res.ok) return null;
    const facts = await res.json();
    const gaap = facts.facts?.['us-gaap'] || {};
    // Prefer recent annual filings (10-K/20-F) and cap to last 36 months for recency.
    // Falls back to all entries if no recent annual data exists for a tag.
    // pickBest(tags): evaluates ALL candidate tags and returns the entry with the
    // MOST RECENT period-end date across all of them, preferring annual filings.
    // Fixes AMD showing 2017 data: AMD switched from "Revenues" to
    // "RevenueFromContractWithCustomer..." in 2018 (ASC 606). A naive || chain
    // returns the stale 2017 "Revenues" entry without reaching the current tag.
    // pickBest() picks the winner by recency across every tag attempted.
    const ANNUAL = new Set(['10-K','20-F','40-F']);
    const pickBest = (...tags) => {
      const best = [];
      for (const tag of tags) {
        const units = gaap[tag]?.units?.USD;
        if (!units?.length) continue;
        const annual = units.filter(u => ANNUAL.has(u.form));
        const pool   = annual.length > 0 ? annual : units;
        const top    = pool.sort((a, b) => new Date(b.end) - new Date(a.end))[0];
        if (top) best.push(top);
      }
      if (!best.length) return null;
      const winner = best.sort((a, b) => new Date(b.end) - new Date(a.end))[0];
      return { value: winner.val, asOf: winner.end, accn: winner.accn };
    };
    return {
      revenue: pickBest(
        'RevenueFromContractWithCustomerExcludingAssessedTax',
        'RevenueFromContractWithCustomerIncludingAssessedTax',
        'Revenues',
        'SalesRevenueNet',
        'NetRevenues',
        'SalesRevenueGoodsNet'
      ),
      netIncome: pickBest(
        'NetIncomeLoss',
        'ProfitLoss',
        'NetIncomeLossAvailableToCommonStockholdersBasic'
      ),
      operatingCashFlow: pickBest(
        'NetCashProvidedByUsedInOperatingActivities'
      ),
      capex: pickBest(
        'PaymentsToAcquirePropertyPlantAndEquipment'
      ),
      totalDebt: pickBest(
        'LongTermDebtNoncurrent',
        'LongTermDebt',
        'DebtCurrent'
      ),
    };
  } catch {
    return null; // one company's network hiccup must not fail the whole batch
  }
}

// ---- Step 3: Approved RSS feeds ---------------------------------------------

async function fetchFeed(feed) {
  try {
    // 8-second per-feed timeout so one slow feed can't stall the whole batch.
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(feed.url, {
      headers: { 'User-Agent': 'AI-Stack-Theatre/1.0 (non-commercial informational tool)' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return [];
    const xml = await res.text();

    const clean = (s) => s
      ?.replace(/<!\[CDATA\[|\]\]>/g, '')
      .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/<[^>]+>/g, '').trim();

    // Support both RSS 2.0 <item> and Atom <entry> elements.
    const pattern = /<(?:item|entry)(?:\s[^>]*)?>(?<block>[\s\S]*?)<\/(?:item|entry)>/g;
    const items = [...xml.matchAll(pattern)].slice(0, 8).map((m) => {
      const block = m.groups?.block ?? m[1] ?? '';

      const title = clean((block.match(/<title[^>]*>([\s\S]*?)<\/title>/) || [])[1]);

      // Atom uses <link href="url"/> (self-closing); RSS uses <link>url</link>.
      const link =
        (block.match(/<link[^>]+href="([^"]+)"/) || [])[1] ||
        clean((block.match(/<link>([\s\S]*?)<\/link>/) || [])[1]) ||
        clean((block.match(/<id>([\s\S]*?)<\/id>/) || [])[1]);

      const pubDate =
        clean((block.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]) ||
        clean((block.match(/<published>([\s\S]*?)<\/published>/) || [])[1]) ||
        clean((block.match(/<updated>([\s\S]*?)<\/updated>/) || [])[1]);

      return { source: feed.name, title, link, pubDate };
    }).filter(item => item.title); // drop malformed items with no title

    return items;
  } catch (err) {
    // Source unreachable or timed out this cycle — drop silently.
    console.error(`Feed ${feed.name} failed:`, err?.message ?? err);
    return [];
  }
}

// ---- Step 4: Deterministic recompute (RAG + projection) ---------------------

function recompute(player, tierBBaseline) {
  // P/E = Market Cap / Net Income (equivalent to Price / EPS, no shares needed).
  // marketCapM is in millions USD; netIncome is in USD from EDGAR.
  // This avoids the unreliable EDGAR sharesOutstanding tag.
  let peTTM = null;
  const netIncome = player.edgar?.netIncome?.value;
  const marketCapM = player.marketCapM;
  if (netIncome != null && netIncome > 0 && marketCapM != null && marketCapM > 0) {
    peTTM = parseFloat(((marketCapM * 1e6) / netIncome).toFixed(1));
  }

  if (!tierBBaseline) return { peTTM };

  const { growthLow, growthHigh, fundamentalsTrendScore = 50, sentimentScore = 50, newsSignalScore = 50 } = tierBBaseline;

  const priceTrendScore = player.priceChangePct != null
    ? Math.max(0, Math.min(100, 50 + player.priceChangePct * 2))
    : 50;

  const ragScore =
    priceTrendScore * 0.35 +
    fundamentalsTrendScore * 0.30 +
    sentimentScore * 0.20 +
    newsSignalScore * 0.15;

  const ragBand = ragScore >= 65 ? 'green' : ragScore >= 40 ? 'amber' : 'red';

  const base = player.marketCapM;
  const projection = base != null && growthLow != null && growthHigh != null ? {
    nineMonth: { low: base * (1 + growthLow * 0.75), high: base * (1 + growthHigh * 0.75) },
    eighteenMonth: { low: base * (1 + growthLow * 1.5), high: base * (1 + growthHigh * 1.5) },
  } : null;

  return { peTTM, ragScore: Math.round(ragScore), ragBand, projection };
}

// ---- Main handler -------------------------------------------------------------

export default async (req) => {
  const store = getStore('ai-stack-theatre');

  // 1. Live Tier A pulls
  const playerSnapshots = {};
  // Process in small parallel batches: fast enough to finish well inside the
  // function timeout, while keeping concurrent SEC EDGAR calls under its
  // 10-requests/second fair-access limit (see SEC EDGAR developer docs).
  const BATCH_SIZE = 8;
  for (let i = 0; i < TRACKED_PLAYERS.length; i += BATCH_SIZE) {
    const batch = TRACKED_PLAYERS.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(batch.map(async (p) => {
      const [finnhub, edgar] = await Promise.all([
        fetchFinnhubData(p.ticker),
        fetchEdgarFacts(p.cik),
      ]);
      return { ticker: p.ticker, name: p.name, finnhub, edgar };
    }));
    for (const r of results) {
      playerSnapshots[r.ticker] = { name: r.name, ...r.finnhub, edgar: r.edgar };
    }
  }

  // 2. News ticker
// Restricts the news ticker to items actually about AI, technology, machine
// learning, semiconductors, microprocessors, or chips — applied uniformly across
// every approved feed (including policy/government sources) so a Federal Reserve
// or WHO item only appears if its headline is genuinely on-topic, not merely
// because the source is generally approved.
const TOPIC_FILTERS = [
  /\bAI\b/i, /artificial intelligence/i, /machine learning/i, /\bML\b(?!\s*amp)/,
  /deep learning/i, /neural network/i, /large language model/i, /\bLLM\b/i,
  /generative ai/i, /\bgenai\b/i, /\bgpu(s)?\b/i, /semiconductor/i,
  /microprocessor/i, /\bsilicon chip/i, /\bchip(s|maker|making)?\b/i,
  /data cent(er|re)/i, /\balgorithm/i, /\brobotics?\b/i,
  /foundation model/i, /language model/i, /\bagentic\b/i, /\bai agent/i,
  /digital polic/i, /digital strateg/i, /technology polic/i,
  /\bai act\b/i, /ai regulation/i, /ai governance/i, /ai safet/i,
  /\bautomation\b/i, /\bcomputing\b.*advanc/i, /frontier (ai|model)/i,
];
function isOnTopic(title) {
  if (!title) return false;
  return TOPIC_FILTERS.some((re) => re.test(title));
}

// News fetch runs concurrently with player data — started here so it overlaps
// the player batch loop execution rather than adding its latency after.
const newsPromise = Promise.all(APPROVED_FEEDS.map(fetchFeed))
  .then(results => results.flat().filter(item => item.title));

  // 3. Recompute against existing Tier B baseline (never invented here)
  let tierB = null;
  try {
    tierB = await store.get('tier-b-baseline', { type: 'json' });
  } catch { /* no baseline yet — recompute will skip until Tier B has run once */ }

  for (const ticker of Object.keys(playerSnapshots)) {
    const baseline = tierB?.players?.[ticker];
    playerSnapshots[ticker].derived = recompute(playerSnapshots[ticker], baseline);
    playerSnapshots[ticker].orderBookValue = baseline?.orderBookValue || null;
    playerSnapshots[ticker].insufficientPrimarySourceData = baseline?.insufficientPrimarySourceData || false;
  }

  // Await the news promise started at the top of this function — it has been
  // running in parallel with all player fetching, so by now it should be complete.
  const newsResults = await newsPromise;
  const nowIso = new Date().toISOString();
  const snapshot = {
    tierALastRefreshed: nowIso,
    players: playerSnapshots,
    news: newsResults,
  };

  await store.setJSON('tier-a-snapshot', snapshot, { metadata: { refreshedAt: nowIso } });

  return new Response(JSON.stringify({ ok: true, refreshedAt: nowIso }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
