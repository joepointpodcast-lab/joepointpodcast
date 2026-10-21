// /robots.txt and /sitemap.xml — the list of all pages, so Google can find everything
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../site/assets/js/config.js';
import { tagPath } from '../../site/assets/js/seo.js';

const AUTH = SUPABASE_ANON_KEY.startsWith('eyJ') ? { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : { apikey: SUPABASE_ANON_KEY };
const x = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

async function q(path) {
  try { const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: AUTH }); return r.ok ? await r.json() : []; } catch { return []; }
}

export default async (request) => {
  const origin = new URL(request.url).origin;
  if (new URL(request.url).pathname === '/robots.txt') {
    return new Response(`User-agent: *\nAllow: /\nDisallow: /admin\n\nSitemap: ${origin}/sitemap.xml\n`, { headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
  }
  const now = encodeURIComponent(new Date().toISOString());
  const PUB = `status=eq.published&published_at=lte.${now}`;
  const [eps, guests, posts, stories, t1, t2, t3] = await Promise.all([
    q(`episodes?select=slug,updated_at,published_at&${PUB}&order=published_at.desc`),
    q('guests?select=slug,created_at'),
    q(`posts?select=slug,published_at&${PUB}&order=published_at.desc`),
    q('stories?select=id,approved_at&status=eq.approved'),
    q(`episodes?select=tags&${PUB}`), q('guests?select=tags'), q(`posts?select=tags&${PUB}`),
  ]);
  // Books only when switched on in the admin (otherwise the database returns none anyway)
  const books = await q('books?select=slug,updated_at&status=neq.draft');
  const day = (d) => (d ? String(d).slice(0, 10) : '');
  const urls = [
    ['/', day(eps[0]?.published_at), '1.0'], ['/episodes', day(eps[0]?.published_at), '0.9'], ['/about', '', '0.7'],
    ['/guests', '', '0.7'], ['/news', day(posts[0]?.published_at), '0.6'], ['/community', '', '0.5'], ['/get-involved', '', '0.5'], ['/contact', '', '0.3'],
    ...eps.map((r) => [`/episode/${r.slug}`, day(r.updated_at || r.published_at), '0.8']),
    ...guests.map((r) => [`/guest/${r.slug}`, day(r.created_at), '0.6']),
    ...posts.map((r) => [`/news/${r.slug}`, day(r.published_at), '0.5']),
    ...stories.map((r) => [`/community/${r.id}`, day(r.approved_at), '0.4']),
    ...(books.length ? [['/books', '', '0.8'], ...books.map((r) => [`/book/${r.slug}`, day(r.updated_at), '0.8'])] : []),
    ...[...new Set([...t1, ...t2, ...t3].flatMap((r) => r.tags || []))].map((t) => [tagPath(t), '', '0.5']),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map(([p, lm, pr]) => `  <url><loc>${x(origin + p)}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}<priority>${pr}</priority></url>`).join('\n')}
</urlset>`;
  return new Response(xml, { headers: { 'content-type': 'application/xml; charset=utf-8', 'cache-control': 'public, max-age=3600' } });
};

export const config = { path: ['/robots.txt', '/sitemap.xml'] };
