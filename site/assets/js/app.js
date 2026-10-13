// Joe Point Podcast — publieke website (single page app)
import { SUPABASE_URL } from './config.js';
import {
  sb, e, md, excerpt, nlDate, media, episodePlayer, icon, siteSocials, socialsHtml,
  POST_TYPES, applyTheme, resizeImage, upload, errMsg,
} from './lib.js';

const $main = document.getElementById('main');
let S = {};          // instellingen
let CATS = [];       // categorieën

/* =========================================================
   Opstarten
   ========================================================= */
async function boot() {
  if (SUPABASE_URL.includes('JOUW-PROJECT')) {
    $main.innerHTML = `<div class="setup-note"><h2>Bijna klaar!</h2><p>Vul de Supabase-gegevens in <code>assets/js/config.js</code> in. Zie <b>LEESMIJ.md</b>.</p></div>`;
    return;
  }
  const [{ data: settings, error }, { data: cats }] = await Promise.all([
    sb.from('settings').select('key,value'),
    sb.from('categories').select('*').order('sort').order('name'),
  ]);
  if (error) {
    $main.innerHTML = `<div class="setup-note"><h2>Even geduld…</h2><p>De database is niet bereikbaar. Probeer het over een minuutje opnieuw.</p><p class="muted">${e(error.message)}</p></div>`;
    return;
  }
  S = Object.fromEntries((settings || []).map((r) => [r.key, r.value]));
  CATS = cats || [];
  applyTheme(S);
  renderChrome();
  route();
}

/* =========================================================
   Router
   ========================================================= */
const routes = [
  [/^\/$/, viewHome],
  [/^\/over\/?$/, viewAbout],
  [/^\/afleveringen\/?$/, viewEpisodes],
  [/^\/aflevering\/([^/]+)\/?$/, viewEpisode],
  [/^\/gasten\/?$/, viewGuests],
  [/^\/gast\/([^/]+)\/?$/, viewGuest],
  [/^\/nieuws\/?$/, viewNews],
  [/^\/nieuws\/([^/]+)\/?$/, viewPost],
  [/^\/community\/?$/, viewCommunity],
  [/^\/community\/insturen\/?$/, viewStoryForm],
  [/^\/community\/(\d+)\/?$/, viewStory],
  [/^\/doe-mee\/?$/, viewParticipate],
  [/^\/contact\/?$/, viewContact],
];

async function route() {
  const path = decodeURIComponent(location.pathname);
  const q = new URLSearchParams(location.search);
  setNav(path);
  closeMenu();
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      try { await fn(m[1], q); }
      catch (err) { console.error(err); render('Er ging iets mis', `<section class="section"><div class="wrap narrow center"><h1>Oeps</h1><p class="lead">Er ging iets mis bij het laden. Probeer het opnieuw.</p></div></section>`); }
      afterRender();
      return;
    }
  }
  notFound();
  afterRender();
}

function navigate(href, replace = false) {
  history[replace ? 'replaceState' : 'pushState']({}, '', href);
  route().then(() => { if (!location.hash) window.scrollTo(0, 0); });
}

document.addEventListener('click', (ev) => {
  const a = ev.target.closest('a');
  if (!a || ev.defaultPrevented || ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || a.target || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || url.pathname.startsWith('/admin') || url.pathname === '/feed') return;
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return; // anker op dezelfde pagina
  ev.preventDefault();
  navigate(url.pathname + url.search + url.hash);
});
window.addEventListener('popstate', route);

function render(title, html, desc) {
  const site = S.site_title || 'Joe Point Podcast';
  document.title = title ? `${title} — ${site}` : `${site} — ${S.tagline || ''}`;
  const d = document.querySelector('meta[name=description]');
  if (d) d.content = excerpt(desc || S.tagline || '', 160);
  $main.innerHTML = html;
}

function afterRender() {
  bindForms();
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  $main.focus?.({ preventScroll: true });
}

function notFound() {
  render('Pagina niet gevonden', `<section class="section"><div class="wrap narrow center">
    <p class="eyebrow">404</p><h1>Deze pagina bestaat niet (meer)</h1>
    <p class="lead">Misschien is de link veranderd. Probeer de afleveringen of ga terug naar home.</p>
    <div class="btn-row center-row"><a class="btn" href="/">Naar home</a><a class="btn btn-ghost" href="/afleveringen">Afleveringen</a></div>
  </div></section>`);
}

function toast(type, msg) {
  const t = document.getElementById('toast');
  t.innerHTML = `<div class="flash flash-${type}" role="status">${e(msg)}</div>`;
  clearTimeout(toast.t);
  toast.t = setTimeout(() => { t.innerHTML = ''; }, 6000);
}

/* =========================================================
   Header & footer
   ========================================================= */
const MENU = () => [['afleveringen', 'Afleveringen'], ['gasten', 'Gasten'], ['over', 'Over ' + (S.host_name || 'Lamin')], ['nieuws', 'Nieuws'], ['community', 'Community'], ['doe-mee', 'Doe mee'], ['contact', 'Contact']];

function renderChrome() {
  const brand = document.getElementById('brand');
  brand.setAttribute('aria-label', (S.site_title || 'Joe Point Podcast') + ' — home');
  brand.innerHTML = S.logo
    ? `<img src="${e(media(S.logo))}" alt="${e(S.site_title)}">`
    : `<span class="brand-mark">${icon('mic')}</span><span class="brand-text">Joe Point<small>Podcast</small></span>`;
  if (S.logo) {
    let fav = document.querySelector('link[rel=icon]');
    if (!fav) { fav = document.createElement('link'); fav.rel = 'icon'; document.head.appendChild(fav); }
    fav.href = media(S.logo);
  }
  document.getElementById('menu').innerHTML = MENU().map(([s, l]) => `<a href="/${s}" data-nav="${s}">${e(l)}</a>`).join('');
  document.getElementById('footer').innerHTML = `
    <div class="wrap footer-grid">
      <div><div class="footer-brand">${e(S.site_title || 'Joe Point Podcast')}</div><p class="muted">${e(S.footer_text)}</p>${socialsHtml(siteSocials(S))}</div>
      <div><h3>Ontdek</h3><ul class="footer-links">${MENU().slice(0, 5).map(([s, l]) => `<li><a href="/${s}">${e(l)}</a></li>`).join('')}</ul></div>
      <div><h3>Doe mee</h3><ul class="footer-links">
        <li><a href="/community/insturen">Deel jouw verhaal</a></li>
        <li><a href="/doe-mee#voice">Stuur een voice message</a></li>
        <li><a href="/doe-mee#topic">Stel een onderwerp voor</a></li>
        <li><a href="/contact">Contact</a></li></ul></div>
    </div>
    <div class="wrap footer-bottom"><span>© ${new Date().getFullYear()} ${e(S.site_title || 'Joe Point Podcast')}</span><a href="/feed">RSS</a></div>`;
  const btn = document.querySelector('.menu-btn');
  btn.onclick = () => { const open = document.getElementById('menu').classList.toggle('open'); btn.setAttribute('aria-expanded', open); };
}
function closeMenu() { document.getElementById('menu')?.classList.remove('open'); }
function setNav(path) {
  const first = path.split('/')[1] || '';
  const map = { aflevering: 'afleveringen', gast: 'gasten' };
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === (map[first] || first)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

/* =========================================================
   Data
   ========================================================= */
const nowIso = () => new Date().toISOString();
const EP_FIELDS = 'id,title,slug,number,season,excerpt,shownotes,cover,audio,media_url,duration,published_at,category_id,categories(name,slug)';

function publishedEpisodes(fields = EP_FIELDS) {
  // RLS laat alleen gepubliceerde afleveringen zien; extra filter houdt de beheerder-preview gelijk aan bezoekers
  return sb.from('episodes').select(fields, { count: 'exact' }).eq('status', 'published').lte('published_at', nowIso());
}
function publishedPosts() {
  return sb.from('posts').select('*', { count: 'exact' }).eq('status', 'published').lte('published_at', nowIso());
}
async function guestsOf(epId) {
  const { data } = await sb.from('episode_guests').select('guests(*)').eq('episode_id', epId);
  return (data || []).map((r) => r.guests).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}
const must = ({ data, error, count }) => { if (error) throw error; return count !== undefined && count !== null ? { data, count } : data; };

/* =========================================================
   Bouwstenen
   ========================================================= */
const coverFallback = (n) => `<span class="cover-fallback">${icon('headphones')}${n ? `<b>#${+n}</b>` : ''}</span>`;
const PAGE = 9;

function episodeCard(ep) {
  const cat = ep.categories?.name;
  return `<article class="card ep-card">
    <a class="ep-cover" href="/aflevering/${e(ep.slug)}" tabindex="-1" aria-hidden="true">
      ${ep.cover ? `<img src="${e(media(ep.cover))}" alt="" loading="lazy">` : coverFallback(ep.number)}
      <span class="play-badge">${icon('play')}</span></a>
    <div class="card-body">
      <div class="meta">${ep.number ? `<span>Afl. ${+ep.number}</span>` : ''}${cat ? `<span class="tag">${e(cat)}</span>` : ''}</div>
      <h3><a href="/aflevering/${e(ep.slug)}">${e(ep.title)}</a></h3>
      <p>${e(excerpt(ep.excerpt || ep.shownotes, 130))}</p>
      <div class="meta meta-foot"><span>${nlDate(ep.published_at)}</span>${ep.duration ? `<span>${icon('clock')} ${e(ep.duration)}</span>` : ''}</div>
    </div></article>`;
}

function storyCard(s) {
  return `<article class="card story-card">
    <a href="/community/${s.id}" class="story-photo" tabindex="-1" aria-hidden="true">${s.photo ? `<img src="${e(media(s.photo))}" alt="" loading="lazy">` : `<span class="cover-fallback">${icon('quote')}</span>`}</a>
    <div class="card-body"><h3><a href="/community/${s.id}">${e(s.title)}</a></h3><p>${e(excerpt(s.body, 140))}</p>
      <div class="meta meta-foot"><span><strong>${e(s.name)}</strong></span>${s.location ? `<span>${icon('pin')} ${e(s.location)}</span>` : ''}</div></div></article>`;
}

function postCard(p) {
  return `<article class="card post-card">
    ${p.image ? `<a href="/nieuws/${e(p.slug)}" class="post-img" tabindex="-1" aria-hidden="true"><img src="${e(media(p.image))}" alt="" loading="lazy"></a>` : ''}
    <div class="card-body"><div class="meta"><span class="tag tag-${e(p.type)}">${e(POST_TYPES[p.type] || 'Nieuws')}</span><span>${nlDate(p.published_at)}</span></div>
      <h3><a href="/nieuws/${e(p.slug)}">${e(p.title)}</a></h3><p>${e(excerpt(p.excerpt || p.body, 140))}</p></div></article>`;
}

function pager(page, total, per) {
  const pages = Math.max(1, Math.ceil(total / per));
  if (pages <= 1) return '';
  const link = (p) => { const q = new URLSearchParams(location.search); q.set('pagina', p); return location.pathname + '?' + q; };
  return `<nav class="pager" aria-label="Paginering">${page > 1 ? `<a href="${e(link(page - 1))}">← Vorige</a>` : ''}<span>Pagina ${page} van ${pages}</span>${page < pages ? `<a href="${e(link(page + 1))}">Volgende →</a>` : ''}</nav>`;
}
const pageNum = (q) => Math.max(1, parseInt(q.get('pagina') || '1', 10) || 1);
const grid = (items, fn) => `<div class="grid grid-3">${items.map(fn).join('')}</div>`;
const photoPh = (label) => `<div class="photo-placeholder">${icon('mic')}<span>${e(label)}</span></div>`;

/* =========================================================
   Pagina's
   ========================================================= */
async function viewHome() {
  const [latest, news, stories] = await Promise.all([
    publishedEpisodes().order('published_at', { ascending: false }).limit(4).then(must),
    publishedPosts().order('published_at', { ascending: false }).limit(3).then(must),
    sb.from('stories').select('id,name,location,title,body,photo,approved_at').eq('status', 'approved').order('approved_at', { ascending: false }).limit(3).then(must),
  ]);
  const eps = latest.data, first = eps[0];
  const host = S.host_name || 'Lamin';
  const hero = S.hero_image || S.host_photo;
  const platforms = Object.fromEntries(Object.entries(siteSocials(S)).filter(([k]) => ['spotify', 'apple', 'youtube'].includes(k)));
  const firstGuests = first ? await guestsOf(first.id) : [];

  render('', `
  <section class="hero"><div class="wrap hero-grid">
    <div class="hero-text">
      <p class="eyebrow">${e(S.tagline)}</p>
      <h1>${e(S.intro_title || 'Welkom bij Joe Point')}</h1>
      <div class="lead">${md(S.intro_text)}</div>
      <div class="btn-row">
        ${first ? `<a class="btn" href="/aflevering/${e(first.slug)}">${icon('play')} Luister de nieuwste aflevering</a>` : ''}
        <a class="btn btn-ghost" href="/over">Wie is ${e(host)}?</a>
      </div>
      ${Object.keys(platforms).length ? `<div class="listen-on"><span>Luister op</span>${socialsHtml(platforms, true)}</div>` : ''}
    </div>
    <div class="hero-photo">${hero ? `<img src="${e(media(hero))}" alt="${e(host)}, host van Joe Point Podcast">` : photoPh(`Grote foto van ${host} — upload in Beheer → Instellingen`)}<div class="pattern" aria-hidden="true"></div></div>
  </div></section>

  ${first ? `<section class="section"><div class="wrap">
    <div class="section-head"><h2>Laatste aflevering</h2><a class="link-arrow" href="/afleveringen">Alle afleveringen ${icon('arrow')}</a></div>
    <article class="feature">
      <div class="feature-cover">${first.cover ? `<img src="${e(media(first.cover))}" alt="">` : coverFallback(first.number)}</div>
      <div class="feature-body">
        <div class="meta">${first.number ? `<span>Aflevering ${+first.number}</span>` : ''}${first.categories ? `<span class="tag">${e(first.categories.name)}</span>` : ''}<span>${nlDate(first.published_at)}</span></div>
        <h3><a href="/aflevering/${e(first.slug)}">${e(first.title)}</a></h3>
        <p>${e(excerpt(first.excerpt || first.shownotes, 260))}</p>
        ${episodePlayer(first)}
        ${firstGuests.length ? `<p class="with-guests">Met ${firstGuests.map((g) => `<a href="/gast/${e(g.slug)}">${e(g.name)}</a>`).join(', ')}</p>` : ''}
        <a class="link-arrow" href="/aflevering/${e(first.slug)}">Show notes ${icon('arrow')}</a>
      </div>
    </article>
    ${eps.length > 1 ? `<div class="mt">${grid(eps.slice(1), episodeCard)}</div>` : ''}
  </div></section>` : ''}

  <section class="section band"><div class="wrap host-teaser">
    <div class="host-teaser-photo">${(S.host_photo || hero) ? `<img src="${e(media(S.host_photo || hero))}" alt="${e(host)}" loading="lazy">` : `<div class="photo-placeholder small">${icon('mic')}</div>`}</div>
    <div><p class="eyebrow">Je host</p><h2>${e(host)}</h2><p class="lead">${e(S.host_intro)}</p>
      <blockquote class="mission">${e(excerpt(S.host_mission, 220))}</blockquote>
      <a class="btn btn-ghost" href="/over">Lees het hele verhaal</a></div>
  </div></section>

  ${S.question_active === '1' && S.question_of_week ? `<section class="section"><div class="wrap qotw">
    <div><p class="eyebrow">Vraag van de week</p><h2 class="qotw-q">“${e(S.question_of_week)}”</h2>
      <p class="muted">Typ je antwoord of spreek een voice message in. Misschien hoor je jezelf terug in de volgende aflevering!</p></div>
    <div class="btn-col"><a class="btn" href="/doe-mee#question">Geef je antwoord</a><a class="btn btn-ghost" href="/doe-mee#voice">${icon('mic')} Stuur een voice message</a><a class="btn btn-ghost" href="/doe-mee#topic">Stel een onderwerp voor</a></div>
  </div></section>` : ''}

  <section class="section section-alt"><div class="wrap">
    <div class="section-head"><h2>Community stories</h2><a class="link-arrow" href="/community">Alle verhalen ${icon('arrow')}</a></div>
    <p class="section-intro">${e(S.stories_intro)}</p>
    ${stories.length ? grid(stories, storyCard) : ''}
    <p class="center mt"><a class="btn" href="/community/insturen">Deel jouw verhaal</a></p>
  </div></section>

  ${news.data.length ? `<section class="section"><div class="wrap">
    <div class="section-head"><h2>Nieuws & updates</h2><a class="link-arrow" href="/nieuws">Alles bekijken ${icon('arrow')}</a></div>
    ${grid(news.data, postCard)}</div></section>` : ''}

  ${Object.keys(siteSocials(S)).length ? `<section class="section band follow"><div class="wrap center"><h2>Volg Joe Point</h2>${socialsHtml(siteSocials(S), true)}</div></section>` : ''}
  `, S.intro_text);
}

async function viewAbout() {
  const host = S.host_name || 'Lamin';
  const photo = S.host_photo || S.hero_image;
  const recent = await publishedEpisodes().order('published_at', { ascending: false }).limit(3).then(must);
  render('Over ' + host, `
  <section class="page-hero"><div class="wrap about-hero">
    <div><p class="eyebrow">Over de host</p><h1>${e(host)}</h1><p class="lead">${e(S.host_intro)}</p>${socialsHtml(siteSocials(S), true)}</div>
    <div class="about-photo">${photo ? `<img src="${e(media(photo))}" alt="${e(host)}">` : photoPh('Foto van ' + host)}</div>
  </div></section>
  <section class="section"><div class="wrap about-blocks">
    <article class="about-block"><h2>Wie is ${e(host)}?</h2><div class="prose">${md(S.host_bio)}</div></article>
    <article class="about-block"><h2>Waarom deze podcast?</h2><div class="prose">${md(S.host_why)}</div></article>
    <article class="about-block"><h2>Achtergrond</h2><div class="prose">${md(S.host_background)}</div></article>
    <article class="about-block about-mission"><h2>Missie</h2><div class="prose">${md(S.host_mission)}</div></article>
  </div></section>
  ${recent.data.length ? `<section class="section section-alt"><div class="wrap">
    <div class="section-head"><h2>Begin met luisteren</h2><a class="link-arrow" href="/afleveringen">Alle afleveringen ${icon('arrow')}</a></div>
    ${grid(recent.data, episodeCard)}</div></section>` : ''}`, S.host_intro);
}

async function viewEpisodes(_, q) {
  const term = (q.get('q') || '').trim().slice(0, 80);
  const catSlug = q.get('categorie') || '';
  const cat = CATS.find((c) => c.slug === catSlug) || null;
  const page = pageNum(q);

  let query = publishedEpisodes();
  if (cat) query = query.eq('category_id', cat.id);
  if (term) {
    const clean = term.replace(/[%_,()*"\\]/g, ' ').trim();
    const like = `%${clean}%`;
    const { data: gs } = await sb.from('guests').select('id').ilike('name', like);
    let epIds = [];
    if (gs?.length) {
      const { data: eg } = await sb.from('episode_guests').select('episode_id').in('guest_id', gs.map((g) => g.id));
      epIds = (eg || []).map((r) => r.episode_id);
    }
    const ors = [`title.ilike."${like}"`, `excerpt.ilike."${like}"`, `shownotes.ilike."${like}"`];
    if (epIds.length) ors.push(`id.in.(${epIds.join(',')})`);
    query = query.or(ors.join(','));
  }
  const { data, count } = await query.order('published_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1).then(must);

  const chip = (label, slug) => {
    const p = new URLSearchParams(); if (slug) p.set('categorie', slug); if (term) p.set('q', term);
    const cur = (cat?.slug || '') === (slug || '');
    return `<a href="/afleveringen${p.toString() ? '?' + p : ''}"${cur ? ' aria-current="true"' : ''}>${e(label)}</a>`;
  };
  render(cat ? cat.name : 'Afleveringen', `
  <section class="page-hero"><div class="wrap">
    <p class="eyebrow">Alle afleveringen</p><h1>${e(cat ? cat.name : 'Afleveringen')}</h1>
    <form class="search" method="get" action="/afleveringen" role="search" data-search>
      <label class="sr" for="q">Zoek een aflevering</label><span class="search-ico">${icon('search')}</span>
      <input id="q" type="search" name="q" value="${e(term)}" placeholder="Zoek op onderwerp, titel of gast…">
      ${cat ? `<input type="hidden" name="categorie" value="${e(cat.slug)}">` : ''}
      <button class="btn">Zoeken</button>
    </form>
    <nav class="chips" aria-label="Categorieën">${chip('Alles', '')}${CATS.map((c) => chip(c.name, c.slug)).join('')}</nav>
  </div></section>
  <section class="section"><div class="wrap">
    ${term || cat ? `<p class="muted results-line">${count} ${count === 1 ? 'aflevering' : 'afleveringen'} gevonden${term ? ` voor “${e(term)}”` : ''}. <a href="/afleveringen">Wis filters</a></p>` : ''}
    ${data.length ? grid(data, episodeCard) + pager(page, count, PAGE)
      : `<div class="empty">${icon('headphones')}<p>Geen afleveringen gevonden.${term ? ' Probeer een ander zoekwoord.' : ''}</p><a class="btn btn-ghost" href="/doe-mee#topic">Stel dit onderwerp voor</a></div>`}
  </div></section>`);
}

async function viewEpisode(slug) {
  const { data: ep } = await publishedEpisodes().eq('slug', slug).maybeSingle();
  if (!ep) return notFound();
  const [guests, prev, next] = await Promise.all([
    guestsOf(ep.id),
    publishedEpisodes('title,slug').lt('published_at', ep.published_at).order('published_at', { ascending: false }).limit(1).maybeSingle(),
    publishedEpisodes('title,slug').gt('published_at', ep.published_at).order('published_at', { ascending: true }).limit(1).maybeSingle(),
  ]);
  const shareText = encodeURIComponent(ep.title + ' — ' + location.href);
  render(ep.title, `
  <section class="page-hero ep-hero"><div class="wrap ep-head">
    <div class="ep-head-cover">${ep.cover ? `<img src="${e(media(ep.cover))}" alt="">` : coverFallback(ep.number)}</div>
    <div>
      <div class="meta">${ep.season ? `<span>Seizoen ${+ep.season}</span>` : ''}${ep.number ? `<span>Aflevering ${+ep.number}</span>` : ''}${ep.categories ? `<a class="tag" href="/afleveringen?categorie=${e(ep.categories.slug)}">${e(ep.categories.name)}</a>` : ''}</div>
      <h1>${e(ep.title)}</h1>
      <div class="meta"><span>${nlDate(ep.published_at)}</span>${ep.duration ? `<span>${icon('clock')} ${e(ep.duration)}</span>` : ''}</div>
      ${ep.excerpt ? `<p class="lead">${e(ep.excerpt)}</p>` : ''}
    </div></div></section>
  <section class="section">
    <div class="wrap ep-layout">
      <div>
        <div class="player-box">${episodePlayer(ep) || '<p class="muted">Audio volgt binnenkort.</p>'}</div>
        ${ep.shownotes ? `<h2 class="h-sm">Show notes</h2><div class="prose">${md(ep.shownotes)}</div>` : ''}
        <div class="share"><span>Deel deze aflevering:</span>
          <button class="btn btn-ghost btn-sm" data-share data-title="${e(ep.title)}">Link kopiëren</button>
          <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="https://wa.me/?text=${shareText}">${icon('whatsapp')} WhatsApp</a></div>
      </div>
      <aside class="ep-aside">
        ${guests.length ? `<h2 class="h-sm">Te gast</h2>` + guests.map((g) => `<a class="guest-mini" href="/gast/${e(g.slug)}">
          ${g.photo ? `<img src="${e(media(g.photo))}" alt="">` : `<span class="avatar">${e(g.name[0] || '?')}</span>`}
          <span><strong>${e(g.name)}</strong>${g.tagline ? `<small>${e(g.tagline)}</small>` : ''}</span></a>`).join('') : ''}
        <div class="aside-cta"><h2 class="h-sm">Wat vond jij?</h2><p class="muted">Reageer met een voice message of stel een vervolgonderwerp voor.</p>
          <a class="btn btn-sm" href="/doe-mee#voice">${icon('mic')} Voice message</a></div>
      </aside>
    </div>
    <div class="wrap prevnext">
      ${next.data ? `<a href="/aflevering/${e(next.data.slug)}"><small>← Nieuwere aflevering</small>${e(next.data.title)}</a>` : '<span></span>'}
      ${prev.data ? `<a class="right" href="/aflevering/${e(prev.data.slug)}"><small>Oudere aflevering →</small>${e(prev.data.title)}</a>` : ''}
    </div>
  </section>`, ep.excerpt || ep.shownotes);
}

async function viewGuests() {
  const [{ data: guests }, { data: eps }] = await Promise.all([
    sb.from('guests').select('*').order('name'),
    publishedEpisodes('id, episode_guests(guest_id)'),
  ]);
  const n = {};
  (eps || []).forEach((ep) => (ep.episode_guests || []).forEach((r) => { n[r.guest_id] = (n[r.guest_id] || 0) + 1; }));
  render('Gasten', `
  <section class="page-hero"><div class="wrap"><p class="eyebrow">Wie schoof er aan?</p><h1>Gasten</h1><p class="lead">De mensen die hun verhaal deelden bij Joe Point.</p></div></section>
  <section class="section"><div class="wrap">
    ${guests?.length ? `<div class="grid grid-4">${guests.map((g) => `<a class="card guest-card" href="/gast/${e(g.slug)}">
      <div class="guest-photo">${g.photo ? `<img src="${e(media(g.photo))}" alt="" loading="lazy">` : `<span class="avatar avatar-lg">${e(g.name[0] || '?')}</span>`}</div>
      <div class="card-body"><h3>${e(g.name)}</h3>${g.tagline ? `<p>${e(g.tagline)}</p>` : ''}<span class="meta">${n[g.id] || 0} ${(n[g.id] || 0) === 1 ? 'aflevering' : 'afleveringen'}</span></div></a>`).join('')}</div>`
      : `<div class="empty">${icon('mic')}<p>Binnenkort de eerste gasten!</p></div>`}
  </div></section>`);
}

async function viewGuest(slug) {
  const { data: g } = await sb.from('guests').select('*').eq('slug', slug).maybeSingle();
  if (!g) return notFound();
  const { data: links } = await sb.from('episode_guests').select('episode_id').eq('guest_id', g.id);
  const ids = (links || []).map((r) => r.episode_id);
  const eps = ids.length ? (await publishedEpisodes().in('id', ids).order('published_at', { ascending: false })).data || [] : [];
  const soc = {}; ['website', 'instagram', 'tiktok', 'youtube', 'facebook', 'x', 'linkedin'].forEach((k) => { if (g[k]) soc[k] = g[k]; });
  render(g.name, `
  <section class="page-hero"><div class="wrap guest-head">
    <div class="guest-head-photo">${g.photo ? `<img src="${e(media(g.photo))}" alt="${e(g.name)}">` : `<span class="avatar avatar-xl">${e(g.name[0] || '?')}</span>`}</div>
    <div><p class="eyebrow"><a href="/gasten">Gasten</a></p><h1>${e(g.name)}</h1>${g.tagline ? `<p class="lead">${e(g.tagline)}</p>` : ''}${socialsHtml(soc, true)}</div>
  </div></section>
  ${g.bio ? `<section class="section"><div class="wrap narrow"><h2 class="h-sm">Bio</h2><div class="prose">${md(g.bio)}</div></div></section>` : ''}
  <section class="section section-alt"><div class="wrap"><h2>Afleveringen met ${e(g.name)}</h2>
    ${eps.length ? grid(eps, episodeCard) : '<p class="muted">De aflevering verschijnt binnenkort.</p>'}</div></section>`, g.tagline || g.bio);
}

async function viewNews(_, q) {
  const type = POST_TYPES[q.get('type')] ? q.get('type') : '';
  const page = pageNum(q);
  let query = publishedPosts();
  if (type) query = query.eq('type', type);
  const { data, count } = await query.order('published_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1).then(must);
  render('Nieuws & updates', `
  <section class="page-hero"><div class="wrap"><p class="eyebrow">Achter de schermen</p><h1>Nieuws & updates</h1>
    <nav class="chips" aria-label="Soort bericht"><a href="/nieuws"${!type ? ' aria-current="true"' : ''}>Alles</a>
      ${Object.entries(POST_TYPES).map(([k, l]) => `<a href="/nieuws?type=${k}"${type === k ? ' aria-current="true"' : ''}>${e(l)}</a>`).join('')}</nav></div></section>
  <section class="section"><div class="wrap">${data.length ? grid(data, postCard) + pager(page, count, PAGE) : '<div class="empty"><p>Nog geen berichten in deze categorie.</p></div>'}</div></section>`);
}

async function viewPost(slug) {
  const { data: p } = await publishedPosts().eq('slug', slug).maybeSingle();
  if (!p) return notFound();
  const { data: imgs } = await sb.from('post_images').select('*').eq('post_id', p.id).order('sort').order('id');
  render(p.title, `
  <article><section class="page-hero"><div class="wrap narrow">
    <div class="meta"><a class="tag tag-${e(p.type)}" href="/nieuws?type=${e(p.type)}">${e(POST_TYPES[p.type] || 'Nieuws')}</a><span>${nlDate(p.published_at)}</span></div>
    <h1>${e(p.title)}</h1>${p.excerpt ? `<p class="lead">${e(p.excerpt)}</p>` : ''}</div></section>
  <section class="section"><div class="wrap narrow">
    ${p.image ? `<img class="post-hero-img" src="${e(media(p.image))}" alt="">` : ''}
    <div class="prose">${md(p.body)}</div>
    ${imgs?.length ? `<div class="gallery">${imgs.map((im) => `<figure><a href="${e(media(im.file))}" target="_blank" rel="noopener"><img src="${e(media(im.file))}" alt="${e(im.caption)}" loading="lazy"></a>${im.caption ? `<figcaption>${e(im.caption)}</figcaption>` : ''}</figure>`).join('')}</div>` : ''}
    <p class="mt"><a class="link-arrow" href="/nieuws">← Terug naar nieuws</a></p>
  </div></section></article>`, p.excerpt || p.body);
}

async function viewCommunity(_, q) {
  const page = pageNum(q), per = 12;
  const { data, count } = await sb.from('stories').select('id,name,location,title,body,photo,approved_at', { count: 'exact' })
    .eq('status', 'approved').order('approved_at', { ascending: false }).range((page - 1) * per, page * per - 1).then(must);
  render('Community stories', `
  <section class="page-hero"><div class="wrap community-hero">
    <div><p class="eyebrow">Van Gambia tot overal</p><h1>Community stories</h1><p class="lead">${e(S.stories_intro)}</p></div>
    <a class="btn" href="/community/insturen">Deel jouw verhaal</a></div></section>
  <section class="section"><div class="wrap">
    ${data.length ? grid(data, storyCard) + pager(page, count, per) : `<div class="empty">${icon('quote')}<p>Nog geen verhalen — wees de eerste!</p><a class="btn" href="/community/insturen">Deel jouw verhaal</a></div>`}
  </div></section>`, S.stories_intro);
}

async function viewStory(id) {
  const { data: s } = await sb.from('stories').select('id,name,location,title,body,photo,approved_at,created_at').eq('id', id).eq('status', 'approved').maybeSingle();
  if (!s) return notFound();
  render(s.title, `
  <article><section class="page-hero"><div class="wrap narrow">
    <p class="eyebrow"><a href="/community">Community stories</a></p><h1>${e(s.title)}</h1>
    <div class="meta"><span><strong>${e(s.name)}</strong></span>${s.location ? `<span>${icon('pin')} ${e(s.location)}</span>` : ''}<span>${nlDate(s.approved_at || s.created_at)}</span></div>
  </div></section>
  <section class="section"><div class="wrap narrow">
    ${s.photo ? `<img class="post-hero-img" src="${e(media(s.photo))}" alt="Foto bij het verhaal van ${e(s.name)}">` : ''}
    <div class="prose story-body">${md(s.body)}</div>
    <div class="aside-cta mt"><h2 class="h-sm">Heb jij ook een verhaal?</h2><p class="muted">Deel het met de Joe Point community.</p><a class="btn btn-sm" href="/community/insturen">Deel jouw verhaal</a></div>
  </div></section></article>`, s.body);
}

/* ---------- Formulieren ---------- */
const HP = `<div class="hp" aria-hidden="true"><label>Laat leeg<input type="text" name="website_url" tabindex="-1" autocomplete="off"></label></div>`;
const nameEmail = (emailLabel = 'E-mail <small>(optioneel)</small>', req = false) => `<div class="row-2">
  <label>Naam${req ? ' *' : ''}<input name="name" maxlength="80"${req ? ' required' : ''}></label>
  <label>${emailLabel}<input type="email" name="email"${req ? ' required' : ''}></label></div>`;
const recorder = (label) => `<div class="recorder" data-recorder>
  <span class="label">${e(label)}</span>
  <div class="rec-controls">
    <button type="button" class="btn btn-ghost btn-sm rec-start">${icon('mic')} Opnemen</button>
    <button type="button" class="btn btn-sm rec-stop" hidden>${icon('stop')} Stop <span class="rec-time">0:00</span></button>
    <span class="rec-or">of</span>
    <label class="btn btn-ghost btn-sm rec-file">Bestand kiezen<input type="file" name="audio" accept="audio/*" hidden></label>
  </div>
  <audio class="player rec-preview" controls hidden></audio>
  <small class="rec-msg muted"></small></div>`;

function viewStoryForm() {
  render('Deel jouw verhaal', `
  <section class="page-hero"><div class="wrap narrow"><p class="eyebrow"><a href="/community">Community stories</a></p><h1>Deel jouw verhaal</h1>
    <p class="lead">Waar kom je vandaan, wat heb je meegemaakt, wat wil je de wereld vertellen? Stuur je verhaal en een foto in. ${e(S.host_name || 'Lamin')} leest alles en plaatst het na goedkeuring.</p></div></section>
  <section class="section"><div class="wrap narrow">
    <form class="form card" id="story" data-form="story">${HP}
      <div class="row-2"><label>Je naam *<input name="name" required maxlength="80"></label><label>Woonplaats / land<input name="location" maxlength="80" placeholder="bv. Brikama, Gambia"></label></div>
      <label>E-mail <small>(niet zichtbaar, alleen als ${e(S.host_name || 'Lamin')} je iets wil vragen)</small><input type="email" name="email"></label>
      <label>Titel van je verhaal *<input name="title" required maxlength="140"></label>
      <label>Je verhaal *<textarea name="body" rows="10" required minlength="30" maxlength="8000"></textarea></label>
      <label class="file">Foto bij je verhaal <small>(wordt automatisch verkleind; locatiegegevens worden verwijderd)</small>
        <input type="file" name="photo" accept="image/*" data-preview><img class="preview" alt="" hidden></label>
      <label class="check"><input type="checkbox" name="consent" value="1" required> Ik geef toestemming om mijn verhaal, naam, woonplaats en foto op deze website te plaatsen. Ik heb het recht om deze foto te delen.</label>
      <button class="btn">Verhaal insturen</button>
    </form></div></section>`);
}

async function viewParticipate() {
  const { data: answers } = await sb.from('submissions').select('id,type,name,message,question,public_audio,created_at').eq('is_public', true).order('created_at', { ascending: false }).limit(12);
  const qOn = S.question_active === '1' && S.question_of_week;
  render('Doe mee', `
  <section class="page-hero"><div class="wrap"><p class="eyebrow">Jouw stem in de podcast</p><h1>Doe mee</h1>
    <p class="lead">Joe Point maak je samen. Beantwoord de vraag van de week, spreek een voice message in of vertel welk onderwerp jij graag terughoort.</p>
    <nav class="chips">${qOn ? '<a href="#question">Vraag van de week</a>' : ''}<a href="#voice">Voice message</a><a href="#topic">Onderwerp insturen</a><a href="/community/insturen">Verhaal delen</a></nav></div></section>

  ${qOn ? `<section class="section" id="question"><div class="wrap two-col">
    <div><p class="eyebrow">Vraag van de week</p><h2 class="qotw-q">“${e(S.question_of_week)}”</h2><p class="muted">De leukste antwoorden komen misschien voorbij in de volgende aflevering.</p></div>
    <form class="form card" data-form="question">${HP}${nameEmail()}
      <label>Je antwoord<textarea name="message" rows="4" maxlength="5000"></textarea></label>
      ${recorder('Of spreek je antwoord in')}<button class="btn">Verstuur antwoord</button></form>
  </div></section>` : ''}

  ${answers?.length ? `<section class="section section-alt"><div class="wrap"><h2>Reacties van luisteraars</h2><div class="grid grid-3">
    ${answers.map((a) => `<figure class="card answer">${a.question ? `<p class="answer-q">${e(a.question)}</p>` : ''}
      ${a.message ? `<blockquote>“${e(excerpt(a.message, 400))}”</blockquote>` : ''}
      ${a.public_audio ? `<audio class="player" controls preload="none" src="${e(media(a.public_audio))}"></audio>` : ''}
      <figcaption>— ${e(a.name || 'Anonieme luisteraar')}</figcaption></figure>`).join('')}</div></div></section>` : ''}

  <section class="section" id="voice"><div class="wrap two-col">
    <div><p class="eyebrow">Voice message</p><h2>Spreek iets in voor ${e(S.host_name || 'Lamin')}</h2>
      <p class="muted">Een vraag, een reactie op een aflevering, een groet uit Gambia — neem het direct op in je browser of upload een audiobestand (max 12 MB). Met jouw toestemming kan het in de podcast te horen zijn.</p></div>
    <form class="form card" data-form="voice">${HP}${nameEmail()}
      ${recorder('Je bericht')}
      <label>Toelichting <small>(optioneel)</small><input name="message" maxlength="500"></label>
      <button class="btn">${icon('mic')} Verstuur voice message</button></form>
  </div></section>

  <section class="section section-alt" id="topic"><div class="wrap two-col">
    <div><p class="eyebrow">Onderwerp insturen</p><h2>Welk onderwerp wil jij terughoren?</h2><p class="muted">Een thema, een vraag, of iemand die je graag als gast zou zien. Alles is welkom.</p></div>
    <form class="form card" data-form="topic">${HP}
      <label>Onderwerp *<input name="subject" required maxlength="140"></label>
      <label>Vertel er iets meer over<textarea name="message" rows="4" maxlength="5000"></textarea></label>
      ${nameEmail()}<button class="btn">Stuur onderwerp in</button></form>
  </div></section>`);
}

function viewContact() {
  const mail = S.contact_email;
  const soc = siteSocials(S);
  render('Contact', `
  <section class="page-hero"><div class="wrap"><p class="eyebrow">Neem contact op</p><h1>Contact</h1><p class="lead">${e(S.contact_intro)}</p></div></section>
  <section class="section"><div class="wrap two-col">
    <div class="contact-info">
      ${mail ? `<h2 class="h-sm">E-mail</h2><p><a class="contact-mail" href="mailto:${e(mail)}">${icon('mail')} ${e(mail)}</a></p>` : ''}
      ${Object.keys(soc).length ? `<h2 class="h-sm">Socials</h2>${socialsHtml(soc, true)}` : ''}
      <div class="aside-cta mt"><h2 class="h-sm">Zelf te gast zijn?</h2><p class="muted">Vertel in je bericht kort wie je bent en waar je over wilt praten.</p></div>
    </div>
    <form class="form card" id="contact" data-form="contact">${HP}${nameEmail('E-mail *', true)}
      <label>Onderwerp<input name="subject" maxlength="140"></label>
      <label>Bericht *<textarea name="message" rows="7" required maxlength="5000"></textarea></label>
      <button class="btn">Verstuur bericht</button></form>
  </div></section>`);
}

/* =========================================================
   Formulieren versturen
   ========================================================= */
const OK_MSG = {
  story: 'Dank je wel voor je verhaal! Het wordt gelezen en na goedkeuring geplaatst.',
  topic: 'Top, je onderwerp staat op de lijst!',
  question: 'Bedankt voor je antwoord! Misschien hoor je het terug in de podcast.',
  voice: 'Je voice message is binnen. Dank je!',
  contact: 'Je bericht is verstuurd. We reageren zo snel mogelijk.',
};

function bindForms() {
  $main.querySelectorAll('form[data-search]').forEach((f) => f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const p = new URLSearchParams(new FormData(f));
    if (!p.get('q')) p.delete('q');
    navigate('/afleveringen' + (p.toString() ? '?' + p : ''));
  }));

  $main.querySelectorAll('form[data-form]').forEach((f) => {
    const started = Date.now();
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const kind = f.dataset.form;
      const fd = new FormData(f);
      const btn = f.querySelector('button:not([type=button])');
      const val = (k) => String(fd.get(k) || '').trim();
      if (Date.now() - started < 3000 || val('website_url')) { toast('ok', OK_MSG[kind]); f.reset(); return; } // spam
      btn.disabled = true; const label = btn.innerHTML; btn.textContent = 'Bezig met versturen…';
      try {
        if (kind === 'story') {
          if (val('body').length < 30) throw new Error('Je verhaal mag wat langer — schrijf minimaal een paar zinnen.');
          let path = null;
          const photo = fd.get('photo');
          if (photo && photo.size) path = await upload('inbox', 'stories', await resizeImage(photo));
          const { error } = await sb.rpc('submit_story', {
            p_name: val('name'), p_location: val('location'), p_email: val('email'), p_title: val('title'),
            p_body: val('body'), p_upload_path: path, p_consent: !!fd.get('consent'), p_hp: '',
          });
          if (error) throw error;
        } else {
          let path = null;
          const audio = fd.get('audio');
          if (audio && audio.size) {
            if (audio.size > 12 * 1024 * 1024) throw new Error('Het audiobestand is groter dan 12 MB.');
            path = await upload('inbox', 'voice', audio);
          }
          if (kind === 'voice' && !path) throw new Error('Neem een berichtje op of kies een audiobestand.');
          const { error } = await sb.rpc('submit_message', {
            p_type: kind, p_name: val('name'), p_email: val('email'), p_subject: val('subject'),
            p_message: val('message'), p_upload_path: path, p_hp: '',
          });
          if (error) throw error;
        }
        f.reset();
        f.querySelectorAll('.preview, .rec-preview').forEach((x) => { x.hidden = true; });
        f.querySelectorAll('.rec-msg').forEach((x) => { x.textContent = ''; });
        toast('ok', OK_MSG[kind]);
        if (kind === 'story') setTimeout(() => navigate('/community'), 400);
      } catch (err) {
        toast('error', errMsg(err));
      } finally {
        btn.disabled = false; btn.innerHTML = label;
      }
    });
  });

  // Foto-preview
  $main.querySelectorAll('input[type=file][data-preview]').forEach((inp) => inp.addEventListener('change', () => {
    const img = inp.parentElement.querySelector('.preview'); const f = inp.files[0];
    if (img && f && f.type.startsWith('image/')) { img.src = URL.createObjectURL(f); img.hidden = false; }
  }));

  // Delen
  $main.querySelectorAll('[data-share]').forEach((b) => b.addEventListener('click', async () => {
    try {
      if (navigator.share) await navigator.share({ title: b.dataset.title, url: location.href });
      else { await navigator.clipboard.writeText(location.href); b.textContent = 'Gekopieerd!'; }
    } catch { /* geannuleerd */ }
  }));

  $main.querySelectorAll('[data-recorder]').forEach(setupRecorder);
}

function setupRecorder(box) {
  const start = box.querySelector('.rec-start'), stop = box.querySelector('.rec-stop'), time = box.querySelector('.rec-time');
  const input = box.querySelector('input[type=file]'), preview = box.querySelector('.rec-preview'), msg = box.querySelector('.rec-msg');
  const MAX = 5 * 60;
  let rec, chunks = [], timer, secs = 0, stream;
  const show = (blob) => { preview.src = URL.createObjectURL(blob); preview.hidden = false; };
  input.addEventListener('change', () => { const f = input.files[0]; if (f) { show(f); msg.textContent = f.name; } });
  if (!navigator.mediaDevices || !window.MediaRecorder) { start.hidden = true; box.querySelector('.rec-or').hidden = true; return; }
  start.addEventListener('click', async () => {
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { msg.textContent = 'Geen toegang tot de microfoon. Kies anders een audiobestand.'; return; }
    const type = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/ogg'].find((t) => MediaRecorder.isTypeSupported(t)) || '';
    rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
    chunks = [];
    rec.ondataavailable = (ev) => ev.data.size && chunks.push(ev.data);
    rec.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      const mime = (rec.mimeType || 'audio/webm').split(';')[0];
      const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
      const blob = new Blob(chunks, { type: mime });
      const dt = new DataTransfer(); dt.items.add(new File([blob], 'voice-message.' + ext, { type: mime }));
      input.files = dt.files;
      show(blob);
      msg.textContent = `Opname klaar (${time.textContent}). Luister terug en verstuur, of neem opnieuw op.`;
    };
    rec.start();
    secs = 0; time.textContent = '0:00';
    start.hidden = true; stop.hidden = false; preview.hidden = true; msg.textContent = 'Opnemen…';
    timer = setInterval(() => { secs++; time.textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'); if (secs >= MAX) stop.click(); }, 1000);
  });
  stop.addEventListener('click', () => {
    clearInterval(timer);
    if (rec && rec.state !== 'inactive') rec.stop();
    stop.hidden = true; start.hidden = false; start.lastChild.textContent = ' Opnieuw opnemen';
  });
}

boot();
