// netlify/functions/get-data.js
//
// Read-only endpoint the frontend calls on page load and after Refresh.
// Returns whatever is currently stored in Netlify Blobs — never triggers a new
// fetch itself (that's refresh.js's job) — so visitors don't each cause their own
// API calls, consistent with the shared-cache architecture.

import { getStore } from '@netlify/blobs';

export default async (req) => {
  const store = getStore('ai-stack-theatre');

  const [tierA, tierB] = await Promise.all([
    store.get('tier-a-snapshot', { type: 'json' }).catch(() => null),
    store.get('tier-b-baseline', { type: 'json' }).catch(() => null),
  ]);

  if (!tierA) {
    return new Response(JSON.stringify({
      ok: false,
      message: 'No live snapshot yet. Trigger /.netlify/functions/refresh at least once after deployment.',
    }), { status: 404, headers: { 'Content-Type': 'application/json' } });
  }

  return new Response(JSON.stringify({
    ok: true,
    tierA,
    tierBLastResearched: tierB?.lastResearched || null,
    tierBLayers: tierB?.layers || null,
  }), { headers: { 'Content-Type': 'application/json' } });
};
