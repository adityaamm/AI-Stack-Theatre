// netlify/functions/_shared/tracked-players.js
//
// CIKs below are copied verbatim from https://www.sec.gov/files/company_tickers.json
// (fetched directly, not recalled from memory) — extend this list the same way:
// look up each new company there before adding it, never guess a CIK.
// TSMC files 20-F as a foreign private issuer (CIK 0001046179, verified).

export const TRACKED_PLAYERS = [
  { name: 'NVIDIA', ticker: 'NVDA', cik: '0001045810' },
  { name: 'AMD', ticker: 'AMD', cik: '0000002488' },
  { name: 'Intel', ticker: 'INTC', cik: '0000050863' },
  { name: 'Qualcomm', ticker: 'QCOM', cik: '0000804328' },
  { name: 'Broadcom', ticker: 'AVGO', cik: '0001730168' },
  { name: 'TSMC', ticker: 'TSM', cik: '0001046179' },
  { name: 'ASML', ticker: 'ASML', cik: '0000937966' },
  { name: 'Amazon (AWS)', ticker: 'AMZN', cik: '0001018724' },
  { name: 'Microsoft', ticker: 'MSFT', cik: '0000789019' },
  { name: 'Google Cloud', ticker: 'GOOGL', cik: '0001652044' },
  { name: 'Oracle Cloud', ticker: 'ORCL', cik: '0001341439' },
  { name: 'CoreWeave', ticker: 'CRWV', cik: '0001769628' },
  { name: 'Snowflake', ticker: 'SNOW', cik: '0001640147' },
  { name: 'MongoDB', ticker: 'MDB', cik: '0001441816' },
  { name: 'Salesforce', ticker: 'CRM', cik: '0001108524' },
  { name: 'ServiceNow', ticker: 'NOW', cik: '0001373715' },
  // Samsung Foundry and privately held companies (OpenAI, Anthropic, Databricks,
  // Hugging Face, LangChain, etc.) are intentionally absent — Korean-listed or
  // genuinely private with no SEC CIK. Their rows show "No data found."
];
