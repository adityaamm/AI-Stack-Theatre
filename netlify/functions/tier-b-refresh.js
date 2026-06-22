// netlify/functions/tier-b-refresh.js
//
// Refreshes the Tier B research baseline: TAM/TOM-adjacent macro indicators,
// growth-rate assumptions, and citation metadata. Runs monthly via the scheduled
// function (30-day elapsed-time guard) — never on every Tier A refresh, and never
// via a Claude/AI call. Only structured, open, verified APIs are used here.
//
// Sources in scope (per the verified governance list):
//   - World Bank Open Data API   (CC BY 4.0, free, no key)
//   - IMF Data API               (free, attribution-bound, non-commercial citation use)
//   - Eurostat API               (open reuse policy, free, no key)
//   - Stanford HAI AI Index      (open report — checked for new edition, not scraped)
//   - World Economic Forum       (CC BY-NC-ND reports — checked for new edition, cited not reproduced)
//
  // [source not listed — pending approved-source verification]
// every citation in the application, per explicit instruction.

import { getStore } from '@netlify/blobs';
import { TRACKED_PLAYERS } from './_shared/tracked-players.js';


const WORLD_BANK_INDICATORS = [
  { code: 'IT.NET.USER.ZS', label: 'Individuals using the Internet (% of population)' },
  { code: 'GB.XPD.RSDV.GD.ZS', label: 'R&D expenditure (% of GDP)' },
];

const IMF_DATASET = 'WEO'; // World Economic Outlook — citation-bound, non-commercial use only

async function fetchWorldBank(indicatorCode) {
  const res = await fetch(`https://api.worldbank.org/v2/country/WLD/indicator/${indicatorCode}?format=json&per_page=5&mrnev=1`);
  if (!res.ok) return null;
  const json = await res.json();
  const point = json?.[1]?.[0];
  if (!point) return null;
  return { value: point.value, year: point.date, source: 'World Bank Open Data', license: 'CC BY 4.0' };
}

async function fetchEurostat(datasetCode) {
  const res = await fetch(`https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/${datasetCode}?format=JSON&lang=EN`);
  if (!res.ok) return null;
  const json = await res.json();
  return { raw: json, source: 'Eurostat', license: 'EU reuse policy (attribution required)' };
}

// IMF SDMX endpoint — structured, free, attribution-bound (see governance notes above)
async function fetchImfWeo(seriesKey) {
  const res = await fetch(`https://www.imf.org/external/datamapper/api/v1/${seriesKey}`);
  if (!res.ok) return null;
  const json = await res.json();
  return { raw: json, source: 'IMF World Economic Outlook', citation: 'IMF. World Economic Outlook. © IMF.' };
}

// Delta-check pattern for annual/periodic open reports — records only whether a
// newer edition has appeared since the last check; never fabricates a figure.
async function checkReportEdition(store, key, currentKnownEdition) {
  const previous = await store.get(key, { type: 'json' }).catch(() => null);
  if (previous?.edition === currentKnownEdition) {
    return { changed: false, edition: previous.edition };
  }
  return { changed: true, edition: currentKnownEdition };
}

// ---- Researched per-player baseline (growth assumptions, sentiment) -----------
//
// Unlike the macro indicators above, there is no free structured API for company-
// specific analyst-consensus growth or sentiment (Finnhub's price-target/recommendation
// endpoints could not be confirmed as free-tier, so they are deliberately not used here).
// Each entry below was researched individually with a named, dated source — exactly
// the same standard applied throughout this build. Companies without a clear, citable
// consensus figure are simply omitted rather than estimated, and their RAG/projection
// fields will correctly read as pending until a future research pass adds them.
//
// sentimentScore (0-100), where available, is derived deterministically from a cited
// analyst buy/hold/sell breakdown: (buy + 0.5*hold) / total * 100 — not a judgment call.

const RESEARCHED_PLAYER_BASELINES = {
  NVDA: {
    growthLow: 0.65, growthHigh: 0.85,
    source: 'NVIDIA Q4 FY2026 earnings release (SEC 8-K, Feb 25 2026, CIK 0001045810): full-year FY2026 revenue $215.9B, up 65% YoY. NVIDIA Q1 FY2027 earnings release (SEC 8-K, May 20 2026): Q1 revenue $81.6B, up 85% YoY; Q2 FY2027 guidance $91B. Growth range: low = FY2026 full-year YoY +65%; high = Q1 FY2027 YoY +85%. Both from NVIDIA primary SEC 8-K filings only.',
  },
  AMD: {
    // FY2025 actual: $34.6B vs FY2024 $25.8B = +34.1% YoY.
    // Q1 2026 guidance: ~$9.8B at midpoint represents ~+32% YoY.
    growthLow: 0.32, growthHigh: 0.34,
    source: 'AMD 10-K FY2025 / 8-K (SEC, Feb 3 2026, CIK 0000002488): FY2025 actual revenue $34.6B, +34% YoY vs FY2024 $25.8B. Q1 2026 guidance ~$9.8B implies ~+32% YoY. Growth range derived solely from AMD primary SEC filings.',
  },
  AVGO: {
    growthLow: 0.48, growthHigh: 0.84,
    source: 'Broadcom Q2 FY2026 earnings (SEC 8-K, Jun 3 2026, CIK 0001730168): revenue $22.187B, +48% YoY; Q3 FY2026 guidance $29.4B, +84% YoY; AI revenue >$100B FY2027. All from Broadcom primary SEC 8-K filings only.',
  },
  INTC: {
    growthLow: 0.07, growthHigh: 0.11,
    source: 'Intel Q4 2025 earnings release (SEC 8-K, Jan 22 2026, CIK 0000050863): FY2025 revenue $52.9B, flat YoY. Intel Q1 2026 earnings release (SEC 8-K, Apr 23 2026): Q1 2026 revenue $13.6B, +7% YoY; Q2 2026 guidance $13.8-14.8B. Q2 2025 actual was $12.9B; Q2 2026 midpoint implies +10.9% YoY. Growth range: low = Q1 2026 actual YoY +7%; high = Q2 2026 guided YoY midpoint +11%. Both from Intel primary SEC filings.',
  },
  AMZN: {
    growthLow: 0.18, growthHigh: 0.20,
    source: 'Amazon quarterly earnings (Amazon 10-Q, SEC EDGAR): AWS segment revenue growth 18–20% YoY across recent quarters.',
  },
  MSFT: {
    growthLow: 0.31, growthHigh: 0.40,
    source: 'Microsoft quarterly earnings (Microsoft 10-Q, SEC EDGAR): Azure segment revenue growth 31–40% YoY across recent quarters.',
  },
  GOOGL: {
    growthLow: 0.28, growthHigh: 0.63,
    source: 'Alphabet Q4 2025 10-Q (SEC EDGAR, CIK 0001652044): Google Cloud revenue growth ~28–29% YoY. Alphabet Q1 2026 earnings (SEC 8-K, Apr 29 2026): Google Cloud grew 63% YoY to $20.03B. Growth range: low = 2025 full-year run rate per 10-Q; high = Q1 2026 actual per 8-K. All from Alphabet primary SEC filings only.',
  },
  ORCL: {
    growthLow: 0.40, growthHigh: 0.44,
    orderBookValue: { amountUSDBillions: 138, label: 'Remaining Performance Obligations (RPO)', asOf: 'Q4 FY2025' },
    source: 'Oracle management guidance (Oracle Q4 FY2025 earnings, Jun 2025): cloud revenue growth guided "over 40%" for FY2026; Remaining Performance Obligations (RPO) grew 41% to $138B — both figures are Oracle\'s own published guidance. The 44% YoY total cloud revenue figure reflects the most recent quarterly result per Oracle\'s own earnings releases.',
  },
  CRWV: {
    // CoreWeave 10-K (FY2025, CIK 0001769628): FY2025 revenue $5.131B.
    // CoreWeave Q1 2026 8-K (May 7 2026): Q1 revenue $2.078B, +112% YoY.
    // CoreWeave maintained full-year 2026 guidance of $12B-$13B (same 8-K).
    // Growth: $12B/$5.131B - 1 = 134% low; $13B/$5.131B - 1 = 153% high.
    growthLow: 1.34, growthHigh: 1.53,
    orderBookValue: { amountUSDBillions: 99.4, label: 'Revenue backlog (contracted)', asOf: 'Q1 2026' },
    source: 'CoreWeave 10-K FY2025 (SEC CIK 0001769628): FY2025 revenue $5.131B. CoreWeave Q1 2026 earnings 8-K (May 7 2026): Q1 revenue $2.078B, +112% YoY; FY2026 guidance maintained at $12B-$13B; revenue backlog $99.4B. Growth range = company guidance $12B-$13B / FY2025 actual $5.131B. All from CoreWeave primary SEC filings only.',
  },

  // Meta AI is a division of Meta Platforms (META) — no independent listing.
  // Growth data from Meta Platforms primary SEC filings for the parent company.
  META_AI_PROXY: {
    growthLow: 0.22, growthHigh: 0.30,
    source: 'Meta Platforms Q4 2025 earnings (SEC 8-K, Jan 28 2026, CIK 0001326801): FY2025 revenue $200.97B, +22% YoY. Q1 2026 guidance $53.5-56.5B vs Q1 2025 actual $42.31B implies +30% YoY at midpoint. Reflects Meta Platforms (parent); Meta AI is a product division with no independent listing. All from Meta Platforms primary SEC 8-K filing only.',
  },

  // Google DeepMind is a division of Alphabet (GOOGL) — no independent listing.
  // Growth data from Alphabet primary SEC filings for the parent company.
  DEEPMIND_PROXY: {
    growthLow: 0.22, growthHigh: 0.63,
    source: 'Alphabet Q1 2026 earnings (SEC 8-K, Apr 29 2026, CIK 0001652044): total Alphabet revenue +22% YoY; Google Cloud specifically +63% YoY to $20.03B. Low = total Alphabet YoY; high = Google Cloud YoY (the segment most directly associated with AI/DeepMind activity). Reflects Alphabet/GOOGL (parent); Google DeepMind is a division with no independent listing. All from Alphabet primary SEC 8-K filing only.',
  },

  // ---- 7 remaining companies (primary-source-only pass, June 2026) ----
  //
  // GOVERNANCE NOTE: Only company-published guidance (earnings releases, IR pages)
  // is used below — the same class of primary source as SEC EDGAR filings.
  // [source not listed — pending approved-source verification]
  // [source not listed — pending approved-source verification]
  // [source not listed — pending approved-source verification]
  // fully removed pending governance review and explicit approval of each source.
  // Companies where no primary-source growth figure was found are explicitly marked
  // as insufficient-primary-source-data rather than left blank or estimated.

  QCOM: {
    growthLow: 0.00, growthHigh: 0.14,
    source: 'Qualcomm FY2025 earnings release (SEC 8-K, Nov 5 2025, CIK 0000804328): fiscal 2025 GAAP revenues $44.3B; non-Apple QCT revenues grew 18% YoY. FY2024 Qualcomm GAAP revenues were $38.96B per the same filing; FY2025 $44.3B / $38.96B - 1 = +13.7% YoY. Qualcomm Q2 FY2026 earnings (SEC 8-K, Apr 29 2026): Q2 revenue $10.6B with management citing near-term headwinds from memory environment. Growth range: low = 0% (near-term caution per Q2 FY2026 guidance); high = +14% (FY2025 total GAAP revenue growth vs FY2024 from same primary filing). Both from Qualcomm primary SEC 8-K filings only.',
  },

  ASML: {
    // ASML's own published 2026 guidance (€36B–€40B total net sales) is a primary
    // source. However, computing a YoY growth rate requires the prior-year actuals
    // (2025 revenue €32.67B), which comes from ASML's own published annual results —
    // a primary source. Both figures are from ASML directly.
    growthLow: 0.10, growthHigh: 0.225,
    // No sentiment score: analyst rating breakdowns came exclusively from unapproved
  // [source not listed — pending approved-source verification]
    source: 'ASML company guidance (ASML Holding N.V. Q4 2025 / FY2025 earnings, Jan 2026): 2026 total net sales guided at €36B–€40B. ASML FY2025 actual revenue: €32.67B (ASML published annual results). Growth range derived purely from these two primary figures: low = €36B/€32.67B - 1 = +10.2%; high = €40B/€32.67B - 1 = +22.5%. No analyst-consensus sources used.',
  },

  TSM: {
    growthLow: 0.25, growthHigh: 0.30,
    // No sentiment score: analyst rating breakdowns came exclusively from unapproved
    // aggregators — stripped.
    source: 'TSMC company guidance (TSMC Q4 2025 earnings, Jan 15, 2026): full-year 2026 revenue expected to increase "close to 30%" in USD terms. TSMC Q1 2026 guidance: revenue USD $34.6B–$35.8B with operating margin 54%–56% (same earnings release). Growth range: company guidance midpoint ~30% as high end; 25% as conservative low end reflecting that "close to 30%" is directional rather than a hard floor. No analyst-consensus sources used.',
  },

  SNOW: {
    // Snowflake does not publish a multi-year revenue growth rate in its own guidance.
    // Its FY2026 product revenue guidance ($4.28B, per company IR) and FY2025 actuals
    // ($3.63B) yield a single-year primary-source growth rate of ~18%, which is used
    // here as a point estimate rather than a range, since only one year of guidance exists.
    growthLow: 0.18, growthHigh: 0.18,
    source: 'Snowflake company guidance (Snowflake Q4 FY2025 earnings, Mar 2025): FY2026 product revenue guidance $4.28B. Snowflake FY2025 actual product revenue $3.63B (same earnings release). Growth rate = $4.28B / $3.63B - 1 = ~18%. Single primary-source point estimate; shown as low=high since no range was published. No analyst-consensus sources used.',
  },

  MDB: {
    growthLow: 0.21, growthHigh: 0.22,
    // No sentiment score: analyst rating breakdowns came exclusively from unapproved
    // aggregators — stripped.
    source: 'MongoDB company guidance (MongoDB Q3 FY2026 earnings, Dec 2025): FY2026 revenue guidance raised to $2.434B–$2.439B, representing 21%–22% YoY growth versus FY2025 actual revenue of $2.006B (same earnings release). Growth range low/high = company\'s own published guidance range. No analyst-consensus sources used.',
  },

  CRM: {
    growthLow: 0.09, growthHigh: 0.10,
    // No sentiment score: analyst rating breakdowns came exclusively from unapproved
    // aggregators — stripped.
    source: 'Salesforce company guidance (Salesforce Q3 FY2026 earnings, Nov 2025): full-year FY2026 revenue guidance $41.45B–$41.55B, up 9%–10% YoY versus FY2025 actual revenue $37.9B (same earnings release). Growth range = company\'s own published FY2026 guidance range of 9%–10%. No analyst-consensus sources used.',
  },

  NOW: {
    growthLow: 0.22, growthHigh: 0.225,
    // No sentiment score: analyst rating breakdowns came exclusively from unapproved
    // aggregators — stripped.
    source: 'ServiceNow company guidance (ServiceNow Q1 2026 earnings, Apr 2026): full-year 2026 GAAP subscription revenue guidance $15,735M–$15,775M, representing 22%–22.5% YoY growth versus 2025 actual subscription revenue of $12,870M (same earnings release). Growth range = company\'s own published guidance range. No analyst-consensus sources used.',
  },
};

async function buildPlayerBaselines() {
  const players = {};

  for (const player of TRACKED_PLAYERS) {
    const researched = RESEARCHED_PLAYER_BASELINES[player.ticker];
    const entry = researched
      ? { source: researched.source, researchedAsOf: '2026-06' }
      : { researchedAsOf: '2026-06' };
    if (researched?.insufficientPrimarySourceData) entry.insufficientPrimarySourceData = true;
    if (!researched?.insufficientPrimarySourceData && researched?.growthLow != null) entry.growthLow = researched.growthLow;
    if (!researched?.insufficientPrimarySourceData && researched?.growthHigh != null) entry.growthHigh = researched.growthHigh;
    if (!researched?.insufficientPrimarySourceData && researched?.sentimentScore != null) entry.sentimentScore = researched.sentimentScore;
    if (researched?.orderBookValue != null) entry.orderBookValue = researched.orderBookValue;

    // Historical prices are immutable facts, not something a live feed is needed
    // for — hard-coded from HISTORICAL_PRICES (individually cited, see that file)
    // rather than fetched from any API.
    // Historical prices are hardwired in the frontend (historical-prices.js / HISTORICAL_PRICES)
    // as immutable facts — no API or store entry needed here.

    players[player.ticker] = entry;
  }
  return players;
}

// ---- Layer-level TAM/TOM ------------------------------------------------------
//
// Unlike player-level figures, these are sourced from Stanford HAI's AI Index and
// named analyst estimates reported in established financial press — never from
  // [source not listed — pending approved-source verification]
// Only 3 of 9 layers have a clean, citable figure as of this research pass; the
// rest are marked insufficient rather than estimated.

const LAYER_TAM_TOM = {
  'semiconductors-design': {
    tam: { value: 'Not available from approved sources', label: 'No approved-source data available' },
    projection: {
      nineMonth: 'Not available from approved sources',
      eighteenMonth: 'Not available from approved sources',
    },
    source: 'No approved-source TAM currently available for this layer.',
  },
  'cloud-infra': {
    tam: { value: 'Not available from approved sources', label: 'No approved-source data available' },
    projection: {
      nineMonth: 'Not available from approved sources',
      eighteenMonth: 'Not available from approved sources',
    },
    source: 'No approved-source TAM currently available for this layer.',
  },
  'foundation-models': {
    tam: { value: '$581.7 billion (2025)', label: 'Global corporate AI investment, +130% YoY' },
    projection: {
      nineMonth: 'insufficient public consensus data for a forward-looking projection',
      eighteenMonth: 'insufficient public consensus data for a forward-looking projection',
    },
    source: 'Stanford HAI, 2026 AI Index Report (published Apr 2026): global corporate AI investment reached $581.7B in 2025, up 130% YoY. Historical actual shown for context \u2014 not projected forward, since a single YoY figure does not support a reliable forward estimate.',
  },
  // ---- Layer 2: Chip Fabrication & Manufacturing Equipment ----
  // [source not listed — pending approved-source verification]
  // industry trade association that publishes the authoritative semiconductor equipment
  // market forecast. SEMI press releases are free, openly published, and represent
  // primary industry data, not a third-party aggregator.
  // ---- Layer 2: Chip Fabrication & Manufacturing Equipment ----
  // GOVERNANCE NOTE: The primary market-data source for this segment was reviewed
  // and found to explicitly prohibit redistribution (verified Jun 2026). No
  // approved alternative found among World Bank, IMF, Eurostat, Stanford HAI, or WEF.
  // This layer TAM therefore renders as 'not available from approved sources'.
  'fabrication': {
    tam: { value: 'Not available from approved sources', label: 'See governance note' },
    projection: {
      nineMonth: 'Not available from approved sources — SEMI ToS prohibits redistribution',
      eighteenMonth: 'Not available from approved sources — SEMI ToS prohibits redistribution',
    },
    source: 'No approved-source TAM available for this layer from World Bank, IMF, Eurostat, Stanford HAI, or WEF.',
  },

  // ---- Layer 4: Data Infrastructure & Management ----
  // Stanford HAI 2026 AI Index is the approved open-access source for this layer.
  // No standalone "data infrastructure TAM" figure was found in Stanford HAI or
  // World Bank/IMF/Eurostat without relying on unapproved commercial research firms.
  // Using the approved Stanford HAI investment figure as the closest proxy.
  'data-layer': {
    tam: { value: '$344.7 billion private AI investment (2025), of which data and infrastructure is a substantial share', label: 'Total private AI investment (Stanford HAI, 2026 AI Index)' },
    projection: {
      nineMonth: 'Insufficient standalone data-layer TAM available from approved primary sources',
      eighteenMonth: 'Insufficient standalone data-layer TAM available from approved primary sources',
    },
    source: 'Stanford HAI, 2026 AI Index Report (Apr 2026): private AI investment reached $344.7B in 2025, up 127.5% from 2024. A standalone "data infrastructure" sub-market figure was not found in approved sources (Stanford HAI, World Bank, IMF, Eurostat, WEF) without relying on commercial research firms not yet governance-approved. Parent investment figure shown as the best available proxy with appropriate scope caveat.',
  },

  // ---- Layer 6: MLOps & Model Development Tooling ----
  'mlops-tooling': {
    tam: { value: 'Part of $581.7B global corporate AI investment (2025)', label: 'No standalone MLOps TAM available from approved primary sources' },
    projection: {
      nineMonth: 'Insufficient standalone MLOps TAM available from approved primary sources',
      eighteenMonth: 'Insufficient standalone MLOps TAM available from approved primary sources',
    },
    source: 'Stanford HAI, 2026 AI Index Report (Apr 2026): global corporate AI investment $581.7B in 2025. A standalone MLOps/model-tooling market size figure was not found in approved primary sources. The Stanford HAI total is shown as context only; it covers the entire AI investment landscape, not MLOps specifically.',
  },

  // ---- Layer 7: AI Agent & Orchestration Layer ----
  'agent-orchestration': {
    tam: { value: 'AI agent deployment in single digits across nearly all business functions as of early 2026', label: 'Adoption rate proxy (Stanford HAI 2026 AI Index)' },
    projection: {
      nineMonth: 'Insufficient standalone agent-orchestration TAM from approved primary sources',
      eighteenMonth: 'Insufficient standalone agent-orchestration TAM from approved primary sources',
    },
    source: 'Stanford HAI, 2026 AI Index Report (Apr 2026): AI agent deployment was "in the single digits across nearly all business functions" as of early 2026, despite strong investment interest. A market-size dollar figure for the agent/orchestration tooling layer specifically was not found in approved primary sources without relying on unapproved commercial research firms.',
  },

  // ---- Layer 8: Application Layer ----
  'application-layer': {
    tam: { value: '70% of organizations use GenAI in ≥1 business function (2025–26)', label: 'Enterprise GenAI adoption rate (Stanford HAI 2026 AI Index)' },
    projection: {
      nineMonth: 'Adoption expected to continue rising; U.S. consumer AI surplus $172B annually (early 2026, up from $112B a year earlier)',
      eighteenMonth: 'Insufficient forward application-layer TAM from approved primary sources beyond directional adoption trends',
    },
    source: 'Stanford HAI, 2026 AI Index Report (Apr 2026): Generative AI used in at least one business function at 70% of organizations; estimated U.S. consumer surplus from AI tools reached $172B annually by early 2026, up from $112B a year earlier, with median value per user tripling over the same period. Dollar TAM figure for the enterprise AI applications market specifically was not found in approved primary sources without relying on unapproved commercial research firms.',
  },

  // ---- Layer 9: AI Governance, Safety & Compliance Tooling ----
  'governance-safety': {
    tam: { value: 'Nascent market; governance frameworks lagging AI capability development', label: 'Stanford HAI 2026 AI Index qualitative assessment' },
    projection: {
      nineMonth: 'EU AI Act transparency obligations applicable from 2 August 2026 expected to drive compliance tooling demand',
      eighteenMonth: 'Insufficient standalone governance tooling TAM from approved primary sources',
    },
    source: 'Stanford HAI, 2026 AI Index Report (Apr 2026): "the frameworks needed to govern, evaluate, and understand this technology are falling behind" AI capability development — qualitative assessment confirming nascent state of this market segment. EU AI Act transparency obligations apply from 2 August 2026 (Regulation (EU) 2024/1689, EU Official Journal — public law). No dollar TAM figure for this specific sub-market found in approved primary sources.',
  },
};

export default async (req) => {
  const store = getStore('ai-stack-theatre');

  // 30-day elapsed-time guard — mirrors the Tier A 48-hour guard pattern.
  const meta = await store.get('tier-b-meta', { type: 'json' }).catch(() => null);
  const last = meta?.lastResearched ? new Date(meta.lastResearched) : null;
  const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
  if (last && Date.now() - last.getTime() < thirtyDaysMs) {
    return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'within 30-day window' }), {
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const macroIndicators = {};
  for (const ind of WORLD_BANK_INDICATORS) {
    macroIndicators[ind.code] = await fetchWorldBank(ind.code);
  }

  const imfWeo = await fetchImfWeo('NGDP_RPCH/USA'); // example series — extend per layer's relevant indicator
  const eurostatDigital = await fetchEurostat('isoc_ci_ifp_iu'); // example dataset — extend as needed

  // Stanford HAI / WEF: edition-presence check only. The actual figure used in the
  // UI continues to be the previously verified, manually-confirmed citation until a
  // new edition is detected and the citation is reviewed and updated accordingly.
  const haiCheck = await checkReportEdition(store, 'hai-edition', 'AI Index Report (current known edition — update on verified release)');
  const wefCheck = await checkReportEdition(store, 'wef-edition', 'WEF AI-related report (current known edition — update on verified release)');

  const nowIso = new Date().toISOString();
  const baseline = {
    lastResearched: nowIso,
    macroIndicators,
    imfWeo,
    eurostatDigital,
    haiEditionStatus: haiCheck,
    wefEditionStatus: wefCheck,
    layers: LAYER_TAM_TOM,
    // Player-level growth-rate assumptions and sentiment are populated from
    // RESEARCHED_PLAYER_BASELINES above — individually researched and cited.
    // TSMC, Samsung Foundry, the privately held labs/tooling companies, and any
    // tracked company not listed there (Qualcomm, ASML, Snowflake, MongoDB,
    // Salesforce, ServiceNow as of this research pass) intentionally have no
    // entry here — their RAG/projection fields stay "pending" rather than guessed.
    players: await buildPlayerBaselines(),
  };

  await store.setJSON('tier-b-baseline', baseline);
  await store.setJSON('tier-b-meta', { lastResearched: nowIso });

  return new Response(JSON.stringify({ ok: true, lastResearched: nowIso }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
