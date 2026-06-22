// netlify/functions/scheduled-tier-a.js
//
// Runs daily (Netlify Scheduled Functions, UTC cron). Internally checks whether
// 48 hours have actually elapsed since the last Tier A refresh; if not, it exits
// without doing anything. This gives an accurate 48-hour cadence without relying
// on an external scheduler.

import { getStore } from '@netlify/blobs';

export const config = {
  schedule: '0 6 * * *', // runs daily at 06:00 UTC; the guard below enforces the real 48h cadence
};

export default async (req) => {
  const store = getStore('ai-stack-theatre');
  const snapshot = await store.get('tier-a-snapshot', { type: 'json' }).catch(() => null);
  const last = snapshot?.tierALastRefreshed ? new Date(snapshot.tierALastRefreshed) : null;
  const fortyEightHoursMs = 48 * 60 * 60 * 1000;

  if (last && Date.now() - last.getTime() < fortyEightHoursMs) {
    return new Response('Skipped — within 48-hour window', { status: 200 });
  }

  // Delegate to the same refresh logic used by the manual button, by invoking
  // the deployed refresh function's URL within the same site.
  const refreshUrl = `${process.env.URL || ''}/.netlify/functions/refresh`;
  await fetch(refreshUrl, { method: 'POST' });

  return new Response('Tier A refresh triggered', { status: 200 });
};
