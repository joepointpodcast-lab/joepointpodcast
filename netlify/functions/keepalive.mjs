// Houdt de gratis Supabase-database wakker.
// Supabase pauzeert gratis projecten na een week zonder activiteit;
// deze functie draait elke dag automatisch en doet één klein verzoekje.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../site/assets/js/config.js';

// Werkt met zowel de oude 'anon' key (eyJ…) als de nieuwe 'publishable' key (sb_publishable_…)
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
