// Google & share previews.
// Search engines (Google, Bing…) and share bots (WhatsApp, Facebook…) get a READY-MADE page:
// the right title, description, image, canonical address, structured data AND the text of the page
// (show notes, transcript, bio, news text). Normal visitors get the normal website.
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '../../site/assets/js/config.js';
import { normTags, tagPath, canonical, plain, mdLite, ldSeries, ldEpisode, ldPerson, ldArticle, ldCrumbs, ldBook } from '../../site/assets/js/seo.js';

// Works with both the legacy 'anon' key (eyJ…) and the new 'publishable' key (sb_publishable_…)
const AUTH = SUPABASE_ANON_KEY.startsWith('eyJ') ? { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } : { apikey: SUPABASE_ANON_KEY };

const BOTS = /bot|crawl|spider|slurp|facebookexternalhit|facebot|whatsapp|telegram|twitter|linkedin|slack|discord|skype|pinterest|embedly|vkshare|preview|google|bing|yandex|duckduck|applebot|lighthouse/i;

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const img = (p) => (p ? `${SUPABASE_URL}/storage/v1/object/public/media/${p}` : '');

async function q(path) {
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers: AUTH });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}
/** Try with the new columns first; if the database isn't updated yet, without them */
async function q2(...tries) { for (const t of tries) { const r = await q(t); if (r) return r; } return null; }
const imgTag = (path, alt) => (path ? `<img src="${esc(img(path))}" alt="${esc(alt)}">` : '');
/** Database not reachable → don't pretend the page is gone (serve the normal page instead) */
const need = (rows) => { if (!rows) throw new Error('Database not reachable'); return rows; };

const list = (items, fn) => (items.length ? `<ul>${items.map(fn).join('')}</ul>` : '');
const tagLinks = (tags) => { const t = normTags(tags); return t.length ? `<p>Topics: ${t.map((x) => `<a href="${esc(tagPath(x))}">#${esc(x)}</a>`).join(' ')}</p>` : ''; };

export default async (request, context) => {
  if (!BOTS.test(request.headers.get('user-agent') || '') || SUPABASE_URL.includes('JOUW-PROJECT')) return context.next();
  const res = await context.next();
  if (!(res.headers.get('content-type') || '').includes('text/html')) return res;
  let html = await res.text();
  const headers = new Headers(res.headers);
  headers.delete('content-length');
  const url = new URL(request.url);
  const origin = url.origin;
  const parts = url.pathname.replace(/\/+$/, '').split('/');
  const kind = parts[1] || '', slug = decodeURIComponent(parts[2] || '');
  const now = encodeURIComponent(new Date().toISOString());
  const PUB = `status=eq.published&published_at=lte.${now}`;

  try {
    const S = Object.fromEntries(((await q('settings?select=key,value')) || []).map((r) => [r.key, r.value]));
    const site = S.site_title || 'Joe Point Podcast';
    let title = `${site}${S.tagline ? ' — ' + S.tagline : ''}`;
    let desc = S.seo_description || S.tagline || plain(S.intro_text);
    let image = img(S.hero_image || S.host_photo || S.logo);
    let body = '', ld = [], status = 200, noindex = false;
    const s = encodeURIComponent(slug);
    const notFound = () => { status = 404; noindex = true; title = `Page not found — ${site}`; body = `<h1>This page doesn't exist (anymore)</h1><p><a href="/episodes">All episodes</a></p>`; };

    if (kind === '') {
      const [eps, posts] = await Promise.all([
        q(`episodes?select=title,slug,excerpt&${PUB}&order=published_at.desc&limit=20`),
        q(`posts?select=title,slug&${PUB}&order=published_at.desc&limit=10`),
      ]);
      ld = [ldSeries({ origin, S, image })];
      body = `<h1>${esc(S.intro_title || site)}</h1>${S.tagline ? `<p>${esc(S.tagline)}</p>` : ''}${mdLite(S.intro_text)}
        <h2>Latest episodes</h2>${list(eps || [], (x) => `<li><a href="/episode/${esc(x.slug)}">${esc(x.title)}</a> — ${esc(plain(x.excerpt, 140))}</li>`)}
        <h2>News</h2>${list(posts || [], (x) => `<li><a href="/news/${esc(x.slug)}">${esc(x.title)}</a></li>`)}`;
    } else if (kind === 'episode' && slug) {
      const base = `title,slug,number,excerpt,shownotes,cover,audio,media_url,duration,published_at`;
      const [ep] = need(await q2(`episodes?select=${base},transcript,tags,seo_title,seo_description,cover_alt&slug=eq.${s}&${PUB}`, `episodes?select=${base},transcript,tags,seo_title,seo_description&slug=eq.${s}&${PUB}`, `episodes?select=${base}&slug=eq.${s}&${PUB}`));
      if (!ep) notFound();
      else {
        const links = (await q(`episodes?select=episode_guests(guests(name,slug,tagline))&slug=eq.${s}`)) || [];
        const guests = (links[0]?.episode_guests || []).map((r) => r.guests).filter(Boolean);
        title = ep.seo_title || `${ep.title} — ${site}`; desc = ep.seo_description || plain(ep.excerpt || ep.shownotes); image = img(ep.cover) || image;
        ld = [ldEpisode({ origin, S, ep, guests, image, audio: img(ep.audio) }), ldCrumbs(origin, [['Episodes', '/episodes'], [ep.title, '/episode/' + ep.slug]])];
        body = `<article><p><a href="/episodes">Episodes</a></p><h1>${esc(ep.title)}</h1>${imgTag(ep.cover, ep.cover_alt || ep.title)}${ep.number ? `<p>Episode ${+ep.number}${ep.duration ? ' · ' + esc(ep.duration) : ''}</p>` : ''}
          ${ep.excerpt ? `<p>${esc(ep.excerpt)}</p>` : ''}
          ${guests.length ? `<h2>Guests</h2>${list(guests, (g) => `<li><a href="/guest/${esc(g.slug)}">${esc(g.name)}</a>${g.tagline ? ' — ' + esc(g.tagline) : ''}</li>`)}` : ''}
          ${ep.shownotes ? `<h2>Show notes</h2>${mdLite(ep.shownotes)}` : ''}${tagLinks(ep.tags)}
          ${ep.transcript ? `<h2>Transcript</h2>${mdLite(ep.transcript)}` : ''}</article>`;
      }
    } else if (kind === 'guest' && slug) {
      const [g] = need(await q(`guests?select=*,episode_guests(episodes(title,slug,status))&slug=eq.${s}`));
      if (!g) notFound();
      else {
        const eps = (g.episode_guests || []).map((r) => r.episodes).filter((x) => x && x.status === 'published');
        title = g.seo_title || `${g.name}${g.tagline ? ' — ' + g.tagline : ''} | ${site}`; desc = g.seo_description || plain(g.tagline || g.bio); image = img(g.photo) || image;
        ld = [ldPerson({ origin, g, image: img(g.photo) }), ldCrumbs(origin, [['Guests', '/guests'], [g.name, '/guest/' + g.slug]])];
        body = `<p><a href="/guests">Guests</a></p><h1>${esc(g.name)}</h1>${imgTag(g.photo, g.photo_alt || g.name)}${g.tagline ? `<p>${esc(g.tagline)}</p>` : ''}${mdLite(g.bio)}${tagLinks(g.tags)}
          <h2>Episodes with ${esc(g.name)}</h2>${list(eps, (x) => `<li><a href="/episode/${esc(x.slug)}">${esc(x.title)}</a></li>`)}`;
      }
    } else if (kind === 'news' && slug) {
      const [p] = need(await q(`posts?select=*&slug=eq.${s}&${PUB}`));
      if (!p) notFound();
      else {
        title = p.seo_title || `${p.title} — ${site}`; desc = p.seo_description || plain(p.excerpt || p.body); image = img(p.image) || image;
        ld = [ldArticle({ origin, S, p, image }), ldCrumbs(origin, [['News', '/news'], [p.title, '/news/' + p.slug]])];
        body = `<article><p><a href="/news">News</a></p><h1>${esc(p.title)}</h1>${imgTag(p.image, p.image_alt || p.title)}${p.excerpt ? `<p>${esc(p.excerpt)}</p>` : ''}${mdLite(p.body)}${tagLinks(p.tags)}</article>`;
      }
    } else if (kind === 'tag' && slug) {
      const tag = normTags(slug)[0] || '';
      const c = encodeURIComponent(`{"${tag.replace(/"/g, '')}"}`);
      const [eps, gs, ps] = await Promise.all([
        q(`episodes?select=title,slug,excerpt&tags=cs.${c}&${PUB}&order=published_at.desc`),
        q(`guests?select=name,slug,tagline&tags=cs.${c}`), q(`posts?select=title,slug&tags=cs.${c}&${PUB}`),
      ]);
      const E = eps || [], G = gs || [], P = ps || [];
      const nice = tag.replace(/\b\w/g, (x) => x.toUpperCase());
      if (!E.length && !G.length && !P.length) noindex = true;
      title = `${nice} — episodes, guests & news | ${site}`;
      desc = `Everything about ${nice} on ${site}: ${E.slice(0, 3).map((x) => x.title).join(', ') || 'episodes, guests and news'}.`;
      ld = [ldCrumbs(origin, [['Topics', '/episodes'], ['#' + tag, tagPath(tag)]])];
      body = `<h1>#${esc(tag)}</h1>${E.length ? `<h2>Episodes</h2>${list(E, (x) => `<li><a href="/episode/${esc(x.slug)}">${esc(x.title)}</a> — ${esc(plain(x.excerpt, 140))}</li>`)}` : ''}
        ${G.length ? `<h2>Guests</h2>${list(G, (x) => `<li><a href="/guest/${esc(x.slug)}">${esc(x.name)}</a></li>`)}` : ''}
        ${P.length ? `<h2>News</h2>${list(P, (x) => `<li><a href="/news/${esc(x.slug)}">${esc(x.title)}</a></li>`)}` : ''}`;
    } else if (kind === 'episodes') {
      const eps = (await q(`episodes?select=title,slug,excerpt&${PUB}&order=published_at.desc&limit=200`)) || [];
      title = `Episodes — ${site}`; desc = `All episodes of ${site}. ${S.tagline || ''}`.trim();
      body = `<h1>Episodes</h1>${list(eps, (x) => `<li><a href="/episode/${esc(x.slug)}">${esc(x.title)}</a> — ${esc(plain(x.excerpt, 140))}</li>`)}`;
    } else if (kind === 'guests') {
      const gs = (await q('guests?select=name,slug,tagline&order=name')) || [];
      title = `Guests — ${site}`; desc = `The people who shared their stories on ${site}.`;
      body = `<h1>Guests</h1>${list(gs, (x) => `<li><a href="/guest/${esc(x.slug)}">${esc(x.name)}</a>${x.tagline ? ' — ' + esc(x.tagline) : ''}</li>`)}`;
    } else if (kind === 'news') {
      const ps = (await q(`posts?select=title,slug,excerpt&${PUB}&order=published_at.desc&limit=100`)) || [];
      title = `News & updates — ${site}`; desc = `News, updates and guest announcements from ${site}.`;
      body = `<h1>News & updates</h1>${list(ps, (x) => `<li><a href="/news/${esc(x.slug)}">${esc(x.title)}</a></li>`)}`;
    } else if (kind === 'community' && /^\d+$/.test(slug)) {
      const [st] = need(await q(`stories?select=title,name,body,photo&id=eq.${slug}&status=eq.approved`));
      if (!st) notFound();
      else { title = `${st.title} — ${st.name} — ${site}`; desc = plain(st.body); image = img(st.photo) || image; body = `<h1>${esc(st.title)}</h1><p>${esc(st.name)}</p>${mdLite(st.body)}`; }
    } else if ((kind === 'books' || kind === 'book') && S.books_enabled !== '1') {
      notFound();   // books switched off in the admin: they don't exist for the outside world
    } else if (kind === 'books') {
      const bs = (await q('books?select=title,slug,subtitle,blurb,series_no&status=neq.draft&order=series_no.asc.nullslast')) || [];
      const t = S.books_title || 'The books';
      title = `${t} — ${S.books_series || 'the story of ' + (S.host_name || 'Lamin')} | ${site}`; desc = plain(S.books_intro || bs.map((b) => b.title).join(', '));
      ld = [ldCrumbs(origin, [[t, '/books']])];
      body = `<h1>${esc(t)}</h1>${mdLite(S.books_intro)}${list(bs, (b) => `<li><a href="/book/${esc(b.slug)}">${b.series_no ? 'Book ' + +b.series_no + ': ' : ''}${esc(b.title)}</a>${b.subtitle ? ' — ' + esc(b.subtitle) : ''}${b.blurb ? `<br>${esc(b.blurb)}` : ''}</li>`)}`;
    } else if (kind === 'book' && slug) {
      const [b] = need(await q(`books?select=*&slug=eq.${s}&status=neq.draft`));
      if (!b) notFound();
      else {
        title = b.seo_title || `${b.title}${b.subtitle ? ' — ' + b.subtitle : ''} | ${site}`; desc = b.seo_description || plain(b.blurb || b.description); image = img(b.cover) || image;
        ld = [ldBook({ origin, S, b, image: img(b.cover) }), ldCrumbs(origin, [[S.books_title || 'The books', '/books'], [b.title, '/book/' + b.slug]])];
        body = `<article><p><a href="/books">${esc(S.books_title || 'The books')}</a></p><h1>${esc(b.title)}</h1>${imgTag(b.cover, b.cover_alt || 'Cover of ' + b.title)}${b.subtitle ? `<p>${esc(b.subtitle)}</p>` : ''}
          ${b.blurb ? `<p>${esc(b.blurb)}</p>` : ''}${mdLite(b.description)}${b.excerpt ? `<h2>Sneak preview</h2>${mdLite(b.excerpt)}` : ''}${tagLinks(b.tags)}</article>`;
      }
    } else if (kind === 'about') {
      const host = S.host_name || 'Lamin';
      title = `About ${host} — ${site}`; desc = plain(S.host_intro || S.host_bio); image = img(S.host_photo) || image;
      body = `<h1>About ${esc(host)}</h1>${S.host_intro ? `<p>${esc(S.host_intro)}</p>` : ''}${mdLite(S.host_bio)}${mdLite(S.host_why)}${mdLite(S.host_background)}${mdLite(S.host_mission)}`;
    } else if (kind === 'community') {
      title = `Community stories — ${site}`;
    } else if (kind === 'get-involved') {
      title = `Get involved — ${site}`; desc = `Answer the question of the week, send a voice message or suggest a topic for ${site}.`;
    } else if (kind === 'contact') {
      title = `Contact — ${site}`;
    }

    const canon = canonical(origin, url.pathname, url.search);
    const verify = String(S.google_verification || '').replace(/[^\w-]/g, '');
    const head = `<title>${esc(title)}</title>
<meta name="description" content="${esc(plain(desc, 160))}">
<link rel="canonical" href="${esc(canon)}">
${noindex ? '<meta name="robots" content="noindex">\n' : ''}${verify ? `<meta name="google-site-verification" content="${esc(verify)}">\n` : ''}<meta property="og:site_name" content="${esc(site)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(plain(desc, 200))}">
<meta property="og:type" content="${kind === 'episode' || kind === 'news' ? 'article' : 'website'}">
<meta property="og:url" content="${esc(canon)}">
${image ? `<meta property="og:image" content="${esc(image)}">\n<meta name="twitter:card" content="summary_large_image">\n` : ''}${ld.map((o) => `<script type="application/ld+json">${JSON.stringify(o).replace(/</g, '\\u003c')}</script>`).join('\n')}`;

    html = html
      .replace(/<title>[\s\S]*?<\/title>/, '')
      .replace(/<meta (name="description"|property="og:[a-z_]+")[^>]*>\s*/g, '')
      .replace('</head>', head + '\n</head>');
    if (body) html = html.replace(/<main id="main">[\s\S]*?<\/main>/, `<main id="main"><div class="wrap prerender">${body}</div></main>`);
    return new Response(html, { status, headers });
  } catch (err) {
    console.error(err);
    return new Response(html, { status: res.status, headers });
  }
};

export const config = {
  path: ['/', '/about', '/episodes', '/episode/*', '/guests', '/guest/*', '/news', '/news/*', '/community', '/community/*', '/tag/*', '/get-involved', '/contact', '/books', '/book/*'],
};
