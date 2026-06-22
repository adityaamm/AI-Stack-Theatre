// netlify/functions/_shared/historical-prices.js
//
// Hardwired Jan-2025 and Jan-2026 closing prices for every company in the stack.
// These are immutable historical facts — no live API is used or needed here.
//
// Data source: provided by the tool operator from their own verified source,
// uploaded June 2026. Where no price exists (company was private, not yet listed,
// or data was not provided), the field is explicitly set to null and the frontend
// renders "No data found" — never estimated or inferred.
//
// Notes:
// - Google DeepMind is a wholly-owned division of Alphabet (GOOGL); prices shown
//   are Alphabet/GOOGL prices, noted as such in the frontend.
// - Meta AI is a division of Meta Platforms (META); prices shown are Meta/META
//   prices, noted as such in the frontend.
// - CoreWeave (CRWV) IPO'd in March 2025, so no Jan-2025 price exists.
// - Samsung Foundry is Korean-listed with no SEC filing; not tracked in the
//   live pipeline, and no price data was provided.

export const HISTORICAL_PRICES = {
  // Layer 1 — Semiconductors & AI Chip Design
  NVDA:  { jan2025: 128,  jan2026: 188,  note: null },
  AMD:   { jan2025: 115,  jan2026: 249,  note: null },
  INTC:  { jan2025: 20,   jan2026: 49,   note: null },
  QCOM:  { jan2025: 171,  jan2026: 152,  note: null },
  AVGO:  { jan2025: 202,  jan2026: 333,  note: null },

  // Layer 2 — Chip Fabrication & Manufacturing Equipment
  TSM:   { jan2025: 208,  jan2026: 339,  note: null },
  // Samsung Foundry: Korean-listed, no SEC filing, no price data provided
  ASML:  { jan2025: 683,  jan2026: 1339, note: null },

  // Layer 3 — Cloud & AI Infrastructure
  AMZN:  { jan2025: 237,  jan2026: 243,  note: null },
  MSFT:  { jan2025: 415,  jan2026: 433,  note: null },
  GOOGL: { jan2025: 204,  jan2026: 338,  note: null },
  ORCL:  { jan2025: 168,  jan2026: 169,  note: null },
  CRWV:  { jan2025: null, jan2026: 99,   note: 'CoreWeave IPO\'d March 2025 — no Jan-2025 price exists.' },

  // Layer 4 — Data Infrastructure & Management
  SNOW:  { jan2025: 181,  jan2026: 209,  note: null },
  // Databricks: private — no price data
  MDB:   { jan2025: 273,  jan2026: 374,  note: null },

  // Layer 5 — Foundation Models / Frontier AI Labs
  // OpenAI, Anthropic, xAI, Mistral AI: private — no price data
  // Google DeepMind: Alphabet/GOOGL division — price reflects parent company (GOOGL)
  DEEPMIND_PROXY: { jan2025: 204, jan2026: 338, note: 'Google DeepMind is a division of Alphabet (GOOGL); price reflects Alphabet/GOOGL.' },
  // Meta AI: Meta Platforms division — price reflects parent company (META)
  META_AI_PROXY:  { jan2025: 647, jan2026: 738, note: 'Meta AI is a division of Meta Platforms (META); price reflects Meta Platforms.' },

  // Layer 6 — MLOps & Model Development Tooling
  // Hugging Face, Weights & Biases, Scale AI: private — no price data

  // Layer 7 — AI Agent & Orchestration Layer
  // LangChain, LlamaIndex: private — no price data

  // Layer 8 — Application Layer
  // MSFT already in Layer 3
  CRM:   { jan2025: 343,  jan2026: 214,  note: null },
  NOW:   { jan2025: 202,  jan2026: 129,  note: null },

  // Layer 9 — AI Governance, Safety & Compliance Tooling
  // Credo AI, Holistic AI: private — no price data
};
