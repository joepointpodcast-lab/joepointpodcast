// Mooie previews bij delen (WhatsApp, Facebook, Google…)
// Zoekmachines en deel-bots krijgen de juiste titel, omschrijving en afbeelding in de HTML.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../site/assets/js/config.js';

// Werkt met zowel de oude 'anon' key (eyJ…) als de nieuwe 'publishable' key (sb_publishable_…)
const AUTH = SUPABASE_ANON_KEY.startsWith('eyJ') ? { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : { apikey: SUPABASE_ANON_KEY };

const BOTS = /bot|crawl|spider|slurp|facebookexternalhit|facebot|whatsapp|telegram|twitter|linkedin|slack|discord|skype|pinterest|embedly|vkshare|preview|google|bing|yandex|duckduck|applebot/i;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const plain = (t, n = 200) => { const s = String(t || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[#*_>]/g, '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n) + '…' : s; };
const img = (p) => p ? `${SUPABASE_URL}/storage/v1/object/public/media/${p}` : '';

async function q(path) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: AUTH });
  return r.ok ? r.json() : [];
}

export default async (request, context) => {
  if (!BOTS.test(request.headers.get('user-agent') || '') || SUPABASE_URL.includes('JOUW-PROJECT')) return context.next();
  const url = new URL(request.url);
  const [, kind, slug] = url.pathname.split('/');
  const now = encodeURIComponent(new Date().toISOString());

  try {
    const settings = Object.fromEntries((await q('settings?select=key,value')).map((r) => [r.key, r.value]));
    const site = settings.site_title || 'Joe Point Podcast';
    let title = `${site} — ${settings.tagline || ''}`;
    let desc = plain(settings.intro_text || settings.tagline);
    let image = img(settings.hero_image || settings.logo);

    const s = encodeURIComponent(decodeURIComponent(slug || ''));
    if (kind === 'aflevering' && slug) {
      const [ep] = await q(`episodes?select=title,excerpt,shownotes,cover&slug=eq.${s}&status=eq.published&published_at=lte.${now}`);
      if (ep) { title = `${ep.title} — ${site}`; desc = plain(ep.excerpt || ep.shownotes); image = img(ep.cover) || image; }
    } else if (kind === 'gast' && slug) {
      const [g] = await q(`guests?select=name,tagline,bio,photo&slug=eq.${s}`);
      if (g) { title = `${g.name} — ${site}`; desc = plain(g.tagline || g.bio); image = img(g.photo) || image; }
    } else if (kind === 'nieuws' && slug) {
      const [p] = await q(`posts?select=title,excerpt,body,image&slug=eq.${s}&status=eq.published&published_at=lte.${now}`);
      if (p) { title = `${p.title} — ${site}`; desc = plain(p.excerpt || p.body); image = img(p.image) || image; }
    } else if (kind === 'community' && /^\d+$/.test(slug || '')) {
      const [st] = await q(`stories?select=title,name,body,photo&id=eq.${slug}&status=eq.approved`);
      if (st) { title = `${st.title} — ${st.name} — ${site}`; desc = plain(st.body); image = img(st.photo) || image; }
    } else if (kind === 'over') {
      title = `Over ${settings.host_name || 'Lamin'} — ${site}`; desc = plain(settings.host_intro); image = img(settings.host_photo) || image;
    }

    const res = await context.next();
    if (!(res.headers.get('content-type') || '').includes('text/html')) return res;
    let html = await res.text();
    const meta = `<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${esc(url.href)}">
${image ? `<meta property="og:image" content="${esc(image)}">\n<meta name="twitter:card" content="summary_large_image">` : ''}`;
    html = html
      .replace(/<title>[\s\S]*?<\/title>/, '')
      .replace(/<meta (name="description"|property="og:[a-z]+")[^>]*>\s*/g, '')
      .replace('</head>', meta + '\n</head>');
    const headers = new Headers(res.headers);
    headers.delete('content-length');
    return new Response(html, { status: res.status, headers });
  } catch (err) {
    console.error(err);
    return context.next();
  }
};

export const config = { path: ['/', '/over', '/aflevering/*', '/gast/*', '/nieuws/*', '/community/*'] };
