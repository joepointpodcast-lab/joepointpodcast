// Keeps the free Supabase database awake.
// Supabase pauses free projects after a week without activity;
// this function runs automatically every day and makes one tiny request.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../site/assets/js/config.js';

// Works with both the legacy 'anon' key (eyJ…) and the new 'publishable' key (sb_publishable_…)
const AUTH = SUPABASE_ANON_KEY.startsWith('eyJ') ? { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : { apikey: SUPABASE_ANON_KEY };

export default async () => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/ping`, {
    method: 'POST',
    headers: { ...AUTH, 'Content-Type': 'application/json' },
    body: '{}',
  });
  console.log('Supabase ping:', res.status, await res.text());
  return new Response('ok');
};

export const config = { schedule: '@daily' };
