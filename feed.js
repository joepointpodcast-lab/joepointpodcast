// RSS feed of all episodes at /feed
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../site/assets/js/config.js';

// Works with both the legacy 'anon' key (eyJ…) and the new 'publishable' key (sb_publishable_…)
const AUTH = SUPABASE_ANON_KEY.startsWith('eyJ') ? { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : { apikey: SUPABASE_ANON_KEY };

const x = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

export default async (request) => {
  const origin = new URL(request.url).origin;
  const h = AUTH;
  const now = encodeURIComponent(new Date().toISOString());
  const [settings, eps] = await Promise.all([
    fetch(`${SUPABASE_URL}/rest/v1/settings?select=key,value`, { headers: h }).then((r) => r.json()),
    fetch(`${SUPABASE_URL}/rest/v1/episodes?select=title,slug,excerpt,shownotes,audio,published_at&status=eq.published&published_at=lte.${now}&order=published_at.desc&limit=100`, { headers: h }).then((r) => r.json()),
  ]);
  const S = Object.fromEntries((settings || []).map((r) => [r.key, r.value]));
  const items = (eps || []).map((ep) => `
  <item>
    <title>${x(ep.title)}</title>
    <link>${origin}/episode/${x(ep.slug)}</link>
    <guid>${origin}/episode/${x(ep.slug)}</guid>
    <pubDate>${new Date(ep.published_at).toUTCString()}</pubDate>
    <description>${x(ep.excerpt || String(ep.shownotes || '').slice(0, 400))}</description>${ep.audio ? `
    <enclosure url="${x(`${SUPABASE_URL}/storage/v1/object/public/media/${ep.audio}`)}" length="0" type="audio/mpeg"/>` : ''}
  </item>`).join('');
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${x(S.site_title || 'Joe Point Podcast')}</title>
  <link>${origin}/</link>
  <description>${x(S.tagline)}</description>
  <language>en</language>
  <atom:link href="${origin}/feed" rel="self" type="application/rss+xml"/>${items}
</channel>
</rss>`;
  return new Response(xml, { headers: { 'content-type': 'application/rss+xml; charset=utf-8', 'cache-control': 'public, max-age=600' } });
};

export const config = { path: '/feed' };
