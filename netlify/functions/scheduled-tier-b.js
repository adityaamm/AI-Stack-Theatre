// netlify/functions/scheduled-tier-b.js
//
// Runs daily (Netlify Scheduled Functions, UTC cron). tier-b-refresh.js itself
// contains the 30-day elapsed-time guard, so this wrapper simply invokes it on
// the same daily heartbeat as Tier A — the guard inside ensures the real-world
// research baseline only actually refreshes roughly once a month.

export const config = {
  schedule: '30 6 * * *', // staggered slightly after the Tier A check, daily at 06:30 UTC
};

export default async (req) => {
  const refreshUrl = `${process.env.URL || ''}/.netlify/functions/tier-b-refresh`;
  const res = await fetch(refreshUrl, { method: 'POST' });
  const body = await res.text();
  return new Response(body, { status: 200 });
};
