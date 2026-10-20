// Joe Point Podcast — public website (single page app)
import { SUPABASE_URL } from './config.js';
import {
  sb, e, md, excerpt, fmtDate, media, episodePlayer, embedHtml, icon, siteSocials, socialsHtml,
  POST_TYPES, applyTheme, resizeImage, upload, errMsg, validUrl,
} from './lib.js';
import { normTags, tagPath, canonical, plain, ldSeries, ldEpisode, ldPerson, ldArticle, ldCrumbs } from './seo.js';

const $main = document.getElementById('main');
let S = {};          // settings
let CATS = [];       // categories
let IS_ADMIN = false; // logged in as admin? → show shortcut bar
let ACTIONS = [];     // shortcuts for the current page (only shown to the admin)
const act = (...list) => { ACTIONS = list; };

/* =========================================================
   Start-up
   ========================================================= */
async function boot() {
  if (SUPABASE_URL.includes('JOUW-PROJECT')) {
    $main.innerHTML = `<div class="setup-note"><h2>Almost there!</h2><p>Fill in the Supabase details in <code>assets/js/config.js</code>. See <b>LEESMIJ.md</b>.</p></div>`;
    return;
  }
  const [{ data: settings, error }, { data: cats }] = await Promise.all([
    sb.from('settings').select('key,value'),
    sb.from('categories').select('*').order('sort').order('name'),
  ]);
  if (error) {
    $main.innerHTML = `<div class="setup-note"><h2>One moment…</h2><p>The database can't be reached right now. Please try again in a minute.</p><p class="muted">${e(error.message)}</p></div>`;
    return;
  }
  S = Object.fromEntries((settings || []).map((r) => [r.key, r.value]));
  CATS = cats || [];
  applyTheme(S);
  renderChrome();
  // Message from the admin after saving ("Saved — the episode is live")
  try { const m = sessionStorage.getItem('jp-flash'); if (m) { sessionStorage.removeItem('jp-flash'); setTimeout(() => toast('ok', '✓ ' + m), 300); } } catch { /* no storage */ }
  await checkAdmin();
  route();
}

/* =========================================================
   Router
   ========================================================= */
const routes = [
  [/^\/$/, viewHome],
  [/^\/about\/?$/, viewAbout],
  [/^\/episodes\/?$/, viewEpisodes],
  [/^\/episode\/([^/]+)\/?$/, viewEpisode],
  [/^\/guests\/?$/, viewGuests],
  [/^\/guest\/([^/]+)\/?$/, viewGuest],
  [/^\/news\/?$/, viewNews],
  [/^\/news\/([^/]+)\/?$/, viewPost],
  [/^\/community\/?$/, viewCommunity],
  [/^\/community\/share\/?$/, viewStoryForm],
  [/^\/community\/(\d+)\/?$/, viewStory],
  [/^\/get-involved\/?$/, viewParticipate],
  [/^\/contact\/?$/, viewContact],
  [/^\/tag\/([^/]+)\/?$/, viewTag],
];

// Old Dutch addresses keep working (links that were already shared)
const OLD = [
  [/^\/over\/?$/, '/about'], [/^\/afleveringen\/?$/, '/episodes'], [/^\/aflevering\/(.+)$/, '/episode/$1'],
  [/^\/gasten\/?$/, '/guests'], [/^\/gast\/(.+)$/, '/guest/$1'], [/^\/nieuws(\/.*)?$/, '/news$1'],
  [/^\/community\/insturen\/?$/, '/community/share'], [/^\/doe-mee\/?$/, '/get-involved'],
];

async function route() {
  let path = decodeURIComponent(location.pathname);
  for (const [re, to] of OLD) {
    if (re.test(path)) { history.replaceState({}, '', path.replace(re, to) + location.search + location.hash); path = decodeURIComponent(location.pathname); break; }
  }
  const q = new URLSearchParams(location.search);
  ACTIONS = [];
  setNav(path);
  closeMenu();
  for (const [re, fn] of routes) {
    const m = path.match(re);
    if (m) {
      try { await fn(m[1], q); }
      catch (err) { console.error(err); render('Something went wrong', `<section class="section"><div class="wrap narrow center"><h1>Oops</h1><p class="lead">Something went wrong while loading. Please try again.</p></div></section>`); }
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
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return; // anchor on the same page
  ev.preventDefault();
  navigate(url.pathname + url.search + url.hash);
});
window.addEventListener('popstate', route);

// Facebook share. Always copies a ready-made text (title + intro + link) first.
// - phone/tablet: the phone's own share menu → pick the Facebook app (already logged in there)
// - Lamin on a computer: a small step-by-step window → opens his podcast page on Facebook,
//   where he clicks "Create post" and pastes. (Facebook's own share window often fails when
//   posting as a Page: "This page isn't available".)
// - visitors on a computer: Facebook's share page in a new tab
const isTouch = () => matchMedia('(pointer: coarse)').matches;
document.addEventListener('click', (ev) => {
  const a = ev.target.closest('[data-caption]');
  if (!a) return;
  ev.preventDefault();
  const cap = a.dataset.caption || '';
  const pageUrl = a.dataset.url || location.origin + location.pathname;
  const copied = cap ? navigator.clipboard?.writeText(cap).then(() => true, () => false) : Promise.resolve(false);
  if (isTouch() && navigator.share) {
    copied.then((ok) => ok && toast('ok', '📋 Text copied — paste it in your Facebook post.'));
    navigator.share({ url: pageUrl }).catch(() => {});
    return;
  }
  if (IS_ADMIN) { copied.then((ok) => fbSteps(ok, cap)); return; }
  copied.then((ok) => ok && toast('ok', '📋 Text copied — paste it in your Facebook post.'));
  window.open(a.href, '_blank', 'noopener');
}, true);

/** Step-by-step window for Lamin: text is copied → open the podcast page → Create post → paste */
function fbSteps(ok, cap) {
  const page = validUrl(S.social_facebook) || 'https://www.facebook.com/';
  document.getElementById('fb-steps')?.remove();
  const d = document.createElement('dialog');
  d.id = 'fb-steps'; d.className = 'fb-steps';
  d.innerHTML = `<h2>Share on Facebook</h2>
    <ol>
      <li>${ok ? '✅ The text and link are <strong>copied</strong>.' : 'Copy this text:<textarea readonly rows="5"></textarea>'}</li>
      <li>Click the blue button: your ${S.social_facebook ? '<strong>podcast page</strong>' : 'Facebook'} opens.</li>
      <li>Click <strong>Create post</strong> and <strong>paste</strong> (right-click → Paste, or Ctrl+V).</li>
      <li>Wait a moment for the preview with the picture, then click <strong>Post</strong>.</li>
    </ol>
    <p class="muted">Tip: then share that post from the podcast page to your own profile — no double posts.</p>
    <div class="fb-steps-btns"><a class="btn share-fb" href="${e(page)}" target="_blank" rel="noopener">${icon('facebook')} Open Facebook</a>
    <button class="btn btn-ghost" type="button" data-close>Close</button></div>`;
  if (!ok) d.querySelector('textarea').value = cap;
  document.body.appendChild(d);
  d.addEventListener('click', (ev) => { if (ev.target === d || ev.target.closest('[data-close]') || ev.target.closest('.share-fb')) d.close(); });
  d.addEventListener('close', () => d.remove());
  d.showModal();
}

/**
 * Put a page on screen + tell Google about it.
 * seo: { title: own Google title, description: own Google description, ld: structured data (object or array), noindex }
 */
function render(title, html, desc, seo = {}) {
  const site = S.site_title || 'Joe Point Podcast';
  document.title = seo.title || (title ? `${title} — ${site}` : `${site} — ${S.tagline || ''}`);
  headTag('meta[name=description]', 'meta', { name: 'description' }).content = plain(seo.description || desc || S.seo_description || S.tagline || '', 160);
  headTag('link[rel=canonical]', 'link', { rel: 'canonical' }).href = canonical(location.origin, location.pathname, location.search);
  headTag('meta[name=robots]', 'meta', { name: 'robots' }).content = seo.noindex ? 'noindex' : 'index, follow';
  document.querySelectorAll('script[data-ld]').forEach((x) => x.remove());
  [].concat(seo.ld || []).forEach((obj) => {
    const sc = document.createElement('script'); sc.type = 'application/ld+json'; sc.dataset.ld = '';
    sc.textContent = JSON.stringify(obj).replace(/</g, '\\u003c'); document.head.appendChild(sc);
  });
  $main.innerHTML = html;
}
function headTag(sel, tag, attrs) {
  let el = document.head.querySelector(sel);
  if (!el) { el = document.createElement(tag); Object.assign(el, attrs); if (attrs.name) el.setAttribute('name', attrs.name); document.head.appendChild(el); }
  return el;
}
/** Clickable topics (tags) → /tag/… pages */
function tagsHtml(tags, label = 'Topics') {
  const list = normTags(tags);
  return list.length ? `<nav class="topic-tags" aria-label="${e(label)}"><span>${e(label)}:</span>${list.map((t) => `<a href="${e(tagPath(t))}">#${e(t)}</a>`).join('')}</nav>` : '';
}
const img = (p) => (p ? media(p) : '');

function afterRender() {
  bindForms();
  bindTimestamps();
  renderAdminBar();
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
}

function notFound() {
  render('Page not found', `<section class="section"><div class="wrap narrow center">
    <p class="eyebrow">404</p><h1>This page doesn't exist (anymore)</h1>
    <p class="lead">The link may have changed. Try the episodes or head back home.</p>
    <div class="btn-row center-row"><a class="btn" href="/">Go home</a><a class="btn btn-ghost" href="/episodes">Episodes</a></div>
  </div></section>`, '', { noindex: true });
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
const MENU = () => [['episodes', 'Episodes'], ['guests', 'Guests'], ['about', 'About ' + (S.host_name || 'Lamin')], ['news', 'News'], ['community', 'Community'], ['get-involved', 'Get involved'], ['contact', 'Contact']];

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
  const mainSoc = Object.fromEntries(['facebook', 'instagram', 'youtube', 'tiktok'].filter((k) => S['social_' + k]).map((k) => [k, S['social_' + k]]));
  document.getElementById('menu').innerHTML = MENU().map(([s, l]) => `<a href="/${s}" data-nav="${s}">${e(l)}</a>`).join('')
    + (Object.keys(mainSoc).length ? `<div class="nav-socials">${socialsHtml(mainSoc)}</div>` : '');
  document.getElementById('footer').innerHTML = `
    <div class="wrap footer-grid">
      <div><div class="footer-brand">${e(S.site_title || 'Joe Point Podcast')}</div><p class="muted">${e(S.footer_text)}</p>${socialsHtml(siteSocials(S))}</div>
      <div><h3>Explore</h3><ul class="footer-links">${MENU().slice(0, 5).map(([s, l]) => `<li><a href="/${s}">${e(l)}</a></li>`).join('')}</ul></div>
      <div><h3>Get involved</h3><ul class="footer-links">
        <li><a href="/community/share">Share your story</a></li>
        <li><a href="/get-involved#voice">Send a voice message</a></li>
        <li><a href="/get-involved#topic">Suggest a topic</a></li>
        <li><a href="/contact">Contact</a></li>
        <li><a href="#install" data-install>📲 Add to home screen</a></li></ul></div>
    </div>
    <div class="wrap footer-bottom"><span>© ${new Date().getFullYear()} ${e(S.site_title || 'Joe Point Podcast')}</span>${creditHtml()}<a href="/feed">RSS</a></div>`;
  const btn = document.querySelector('.menu-btn');
  btn.onclick = () => { const open = document.getElementById('menu').classList.toggle('open'); btn.setAttribute('aria-expanded', open); };
}
/** "Website by …" with a WhatsApp button to the website builder (only if filled in under Settings) */
function creditHtml() {
  const num = String(S.credit_whatsapp || '').replace(/\D/g, '');
  const name = S.credit_name || '';
  if (!num && !name) return '';
  const msg = encodeURIComponent(`Hi${name ? ' ' + name : ''}! I saw the ${S.site_title || 'Joe Point Podcast'} website and I would like a website too.`);
  return `<span class="credit">Website by ${e(name || 'us')}${num ? ` · <a class="credit-wa" href="https://wa.me/${num}?text=${msg}" target="_blank" rel="noopener">${icon('whatsapp')} Want a website like this?</a>` : ''}</span>`;
}

function closeMenu() { document.getElementById('menu')?.classList.remove('open'); }
function setNav(path) {
  const first = path.split('/')[1] || '';
  const map = { episode: 'episodes', guest: 'guests' };
  document.querySelectorAll('[data-nav]').forEach((a) => {
    if (a.dataset.nav === (map[first] || first)) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
  });
}

/* =========================================================
   Admin shortcut bar (only visible when Lamin is logged in)
   ========================================================= */
async function checkAdmin() {
  try {
    const { data } = await sb.auth.getSession();
    if (!data.session) return;
    const { data: ok } = await sb.rpc('is_admin');
    IS_ADMIN = !!ok;
  } catch { IS_ADMIN = false; }
}

async function renderAdminBar() {
  if (!IS_ADMIN) return;
  let bar = document.getElementById('adminbar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'adminbar';
    bar.className = 'adminbar';
    document.querySelector('.site-header').after(bar);
  }
  // ?return=… → after saving, the admin brings Lamin straight back to this page
  const here = encodeURIComponent(location.pathname + location.search);
  const link = (label, hash, cls = '', back = true) => `<a class="ab-btn ${cls}" href="/admin/${hash}${back ? (hash.includes('?') ? '&' : '?') + 'return=' + here : ''}">${e(label)}</a>`;
  bar.innerHTML = `<div class="wrap ab-inner">
    <span class="ab-label" title="Only you can see this bar">🔑 Admin</span>
    <div class="ab-actions">${ACTIONS.map(([l, h, cap], i) => (/^https?:/.test(h)
      ? `<a class="ab-btn ab-fb" href="${e(h)}" target="_blank" rel="noopener" data-caption="${e(cap || '')}">${e(l)}</a>`
      : link(l, h, i === 0 ? 'ab-main' : ''))).join('')}</div>
    <div class="ab-right">${link('📥 Inbox', '#/inbox', 'ab-count" data-c="inbox')}${link('📝 Stories', '#/stories/pending', 'ab-count" data-c="stories')}${link('🏠 Dashboard', '#/', '', false)}</div>
  </div>`;
  // live counters
  const [{ count: unread }, { count: pending }] = await Promise.all([
    sb.from('submissions').select('id', { count: 'exact', head: true }).eq('is_read', false),
    sb.from('stories').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
  ]);
  const badge = (sel, n) => { const a = bar.querySelector(`[data-c="${sel}"]`); if (a && n) a.insertAdjacentHTML('beforeend', ` <b>${n}</b>`); };
  badge('inbox', unread); badge('stories', pending);
}

/* =========================================================
   Data
   ========================================================= */
const nowIso = () => new Date().toISOString();
const EP_FIELDS = 'id,title,slug,number,season,excerpt,shownotes,cover,audio,media_url,duration,published_at,category_id,categories(name,slug)';

function publishedEpisodes(fields = EP_FIELDS) {
  // RLS only shows published episodes; the extra filter keeps the admin's view identical to visitors'
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
   Building blocks
   ========================================================= */
const coverFallback = (n) => `<span class="cover-fallback">${icon('headphones')}${n ? `<b>#${+n}</b>` : ''}</span>`;
const PAGE = 9;

function episodeCard(ep) {
  const cat = ep.categories?.name;
  return `<article class="card ep-card">
    <a class="ep-cover" href="/episode/${e(ep.slug)}" tabindex="-1" aria-hidden="true">
      ${ep.cover ? `<img src="${e(media(ep.cover))}" alt="" loading="lazy">` : coverFallback(ep.number)}
      <span class="play-badge">${icon('play')}</span></a>
    <div class="card-body">
      <div class="meta">${ep.number ? `<span>Ep. ${+ep.number}</span>` : ''}${cat ? `<span class="tag">${e(cat)}</span>` : ''}</div>
      <h3><a href="/episode/${e(ep.slug)}">${e(ep.title)}</a></h3>
      <p>${e(excerpt(ep.excerpt || ep.shownotes, 130))}</p>
      <div class="meta meta-foot"><span>${fmtDate(ep.published_at)}</span>${ep.duration ? `<span>${icon('clock')} ${e(ep.duration)}</span>` : ''}${fbMini('/episode/' + ep.slug, ep.title, ep.excerpt || ep.shownotes)}</div>
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
    ${p.image ? `<a href="/news/${e(p.slug)}" class="post-img" tabindex="-1" aria-hidden="true"><img src="${e(media(p.image))}" alt="" loading="lazy"></a>` : ''}
    <div class="card-body"><div class="meta"><span class="tag tag-${e(p.type)}">${e(POST_TYPES[p.type] || 'News')}</span><span>${fmtDate(p.published_at)}</span></div>
      <h3><a href="/news/${e(p.slug)}">${e(p.title)}</a></h3><p>${e(excerpt(p.excerpt || p.body, 140))}</p>
      <div class="meta meta-foot">${p.episode_id ? `<span>${icon('headphones')} Episode</span>` : ''}${p.link_url ? `<span>${icon('link')} Link</span>` : ''}${fbMini('/news/' + p.slug, p.title, p.excerpt || p.body)}</div></div></article>`;
}

function guestCard(g) {
  return `<a class="card guest-card" href="/guest/${e(g.slug)}">
    <div class="guest-photo">${g.photo ? `<img src="${e(media(g.photo))}" alt="${e(g.name)}" loading="lazy">` : `<span class="avatar avatar-lg">${e(g.name[0] || '?')}</span>`}</div>
    <div class="card-body"><h3>${e(g.name)}</h3>${g.tagline ? `<p>${e(g.tagline)}</p>` : ''}</div></a>`;
}

function pager(page, total, per) {
  const pages = Math.max(1, Math.ceil(total / per));
  if (pages <= 1) return '';
  const link = (p) => { const q = new URLSearchParams(location.search); q.set('page', p); return location.pathname + '?' + q; };
  return `<nav class="pager" aria-label="Pagination">${page > 1 ? `<a href="${e(link(page - 1))}">← Previous</a>` : ''}<span>Page ${page} of ${pages}</span>${page < pages ? `<a href="${e(link(page + 1))}">Next →</a>` : ''}</nav>`;
}
const pageNum = (q) => Math.max(1, parseInt(q.get('page') || '1', 10) || 1);
const grid = (items, fn) => `<div class="grid grid-3">${items.map(fn).join('')}</div>`;
const photoPh = (label) => `<div class="photo-placeholder">${icon('mic')}<span>${e(label)}</span></div>`;

/* =========================================================
   Pages
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
  act(['✏️ Edit homepage text & photo', '#/settings/general'], ['🎨 Colours & logo', '#/settings/style'], ['🔗 Social media links', '#/settings/social'], ['➕ New episode', '#/episode/new'], ['➕ News post', '#/post/new']);

  render('', `
  <section class="hero"><div class="wrap hero-grid">
    <div class="hero-text">
      <p class="eyebrow">${e(S.tagline)}</p>
      <h1>${e(S.intro_title || 'Welcome to Joe Point')}</h1>
      <div class="lead">${md(S.intro_text)}</div>
      <div class="btn-row">
        ${first ? `<a class="btn" href="/episode/${e(first.slug)}">${icon('play')} Listen to the latest episode</a>` : ''}
        <a class="btn btn-ghost" href="/about">Who is ${e(host)}?</a>
      </div>
      ${Object.keys(platforms).length ? `<div class="listen-on"><span>Listen on</span>${socialsHtml(platforms, true)}</div>` : ''}
    </div>
    <div class="hero-photo">${hero ? `<img src="${e(media(hero))}" alt="${e(host)}, host of Joe Point Podcast">` : photoPh(`Big photo of ${host} — upload it in Admin → Settings`)}<div class="pattern" aria-hidden="true"></div></div>
  </div></section>

  ${first ? `<section class="section"><div class="wrap">
    <div class="section-head"><h2>Latest episode</h2><a class="link-arrow" href="/episodes">All episodes ${icon('arrow')}</a></div>
    <article class="feature">
      <div class="feature-cover">${first.cover ? `<img src="${e(media(first.cover))}" alt="">` : coverFallback(first.number)}</div>
      <div class="feature-body">
        <div class="meta">${first.number ? `<span>Episode ${+first.number}</span>` : ''}${first.categories ? `<span class="tag">${e(first.categories.name)}</span>` : ''}<span>${fmtDate(first.published_at)}</span></div>
        <h3><a href="/episode/${e(first.slug)}">${e(first.title)}</a></h3>
        <p>${e(excerpt(first.excerpt || first.shownotes, 260))}</p>
        ${episodePlayer(first)}
        ${firstGuests.length ? `<p class="with-guests">With ${firstGuests.map((g) => `<a href="/guest/${e(g.slug)}">${e(g.name)}</a>`).join(', ')}</p>` : ''}
        <a class="link-arrow" href="/episode/${e(first.slug)}">Show notes ${icon('arrow')}</a>
      </div>
    </article>
    ${eps.length > 1 ? `<div class="mt">${grid(eps.slice(1), episodeCard)}</div>` : ''}
  </div></section>` : ''}

  <section class="section band"><div class="wrap host-teaser">
    <div class="host-teaser-photo">${(S.host_photo || hero) ? `<img src="${e(media(S.host_photo || hero))}" alt="${e(host)}" loading="lazy">` : `<div class="photo-placeholder small">${icon('mic')}</div>`}</div>
    <div><p class="eyebrow">Your host</p><h2>${e(host)}</h2><p class="lead">${e(S.host_intro)}</p>
      <blockquote class="mission">${e(excerpt(S.host_mission, 220))}</blockquote>
      <a class="btn btn-ghost" href="/about">Read the full story</a></div>
  </div></section>

  ${S.question_active === '1' && S.question_of_week ? `<section class="section"><div class="wrap qotw">
    <div><p class="eyebrow">Question of the week</p><h2 class="qotw-q">“${e(S.question_of_week)}”</h2>
      <p class="muted">Type your answer or record a voice message. You might hear yourself in the next episode!</p></div>
    <div class="btn-col"><a class="btn" href="/get-involved#question">Give your answer</a><a class="btn btn-ghost" href="/get-involved#voice">${icon('mic')} Send a voice message</a><a class="btn btn-ghost" href="/get-involved#topic">Suggest a topic</a></div>
  </div></section>` : ''}

  <section class="section section-alt"><div class="wrap">
    <div class="section-head"><h2>Community stories</h2><a class="link-arrow" href="/community">All stories ${icon('arrow')}</a></div>
    <p class="section-intro">${e(S.stories_intro)}</p>
    ${stories.length ? grid(stories, storyCard) : ''}
    <p class="center mt"><a class="btn" href="/community/share">Share your story</a></p>
  </div></section>

  ${news.data.length ? `<section class="section"><div class="wrap">
    <div class="section-head"><h2>News & updates</h2><a class="link-arrow" href="/news">See all ${icon('arrow')}</a></div>
    ${grid(news.data, postCard)}</div></section>` : ''}

  <section class="section share-friends"><div class="wrap narrow center"><h2>Enjoying ${e(S.site_title || 'Joe Point')}?</h2>
    <p class="muted">Share the podcast with your friends and family.</p>
    ${shareBox('', S.site_title || 'Joe Point Podcast', S.tagline || '')}</div></section>
  ${Object.keys(siteSocials(S)).length ? `<section class="section band follow"><div class="wrap center"><h2>Follow Joe Point</h2>${socialsHtml(siteSocials(S), true)}</div></section>` : ''}
  `, S.intro_text, {
    title: `${S.site_title || 'Joe Point Podcast'}${S.tagline ? ' — ' + S.tagline : ''}`, description: S.seo_description || S.tagline || S.intro_text,
    ld: ldSeries({ origin: location.origin, S, image: img(S.hero_image || S.host_photo || S.logo) }),
  });
}

/** Most used topics over all published episodes, guests and posts (tolerant: [] when the database has no tags yet) */
async function topTags(limit = 24) {
  const n = {};
  const res = await Promise.all([
    publishedEpisodes('tags').limit(500), sb.from('guests').select('tags').limit(500),
    sb.from('posts').select('tags').eq('status', 'published').lte('published_at', nowIso()).limit(500),
  ]);
  for (const r of res) for (const row of r.data || []) for (const t of row.tags || []) n[t] = (n[t] || 0) + 1;
  return Object.entries(n).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, limit).map(([t]) => t);
}

/** /tag/gambia → everything about one topic */
async function viewTag(raw) {
  const tag = normTags(raw)[0];
  if (!tag) return notFound();
  const [eps, gs, ps, all] = await Promise.all([
    publishedEpisodes().contains('tags', [tag]).order('published_at', { ascending: false }).limit(60),
    sb.from('guests').select('*').contains('tags', [tag]).order('name').limit(60),
    publishedPosts().contains('tags', [tag]).order('published_at', { ascending: false }).limit(30),
    topTags(30),
  ]);
  const E = eps.data || [], G = gs.data || [], P = ps.data || [];
  const total = E.length + G.length + P.length;
  const nice = tag.replace(/\b\w/g, (c) => c.toUpperCase());
  const site = S.site_title || 'Joe Point Podcast';
  act(['🎙️ Episodes', '#/episodes'], ['📰 News', '#/posts']);
  render(nice, `
  <section class="page-hero"><div class="wrap"><p class="eyebrow">Topic</p><h1>#${e(tag)}</h1>
    <p class="lead">${total ? `${total} ${total === 1 ? 'item' : 'items'} about ${e(nice)} on ${e(site)}.` : `Nothing about ${e(nice)} yet.`}</p></div></section>
  ${E.length ? `<section class="section"><div class="wrap"><h2>Episodes about ${e(nice)}</h2>${grid(E, episodeCard)}</div></section>` : ''}
  ${G.length ? `<section class="section section-alt"><div class="wrap"><h2>Guests</h2>${grid(G, guestCard)}</div></section>` : ''}
  ${P.length ? `<section class="section"><div class="wrap"><h2>News</h2>${grid(P, postCard)}</div></section>` : ''}
  ${!total ? `<section class="section"><div class="wrap narrow center"><div class="empty"><p>Have an idea about this topic?</p><a class="btn btn-ghost" href="/get-involved#topic">Suggest it</a></div></div></section>` : ''}
  ${all.length ? `<section class="section"><div class="wrap">${tagsHtml(all.filter((t) => t !== tag), 'More topics')}</div></section>` : ''}`,
  '', {
    title: `${nice} — episodes, guests & news | ${site}`,
    description: `Everything about ${nice} on ${site}: ${E.slice(0, 3).map((x) => x.title).join(', ') || 'episodes, guests and news'}.`,
    noindex: !total,
    ld: ldCrumbs(location.origin, [['Topics', '/episodes'], ['#' + tag, tagPath(tag)]]),
  });
}

async function viewAbout() {
  const host = S.host_name || 'Lamin';
  const photo = S.host_photo || S.hero_image;
  const recent = await publishedEpisodes().order('published_at', { ascending: false }).limit(3).then(must);
  act(['✏️ Edit this page', '#/settings/host']);
  render('About ' + host, `
  <section class="page-hero"><div class="wrap about-hero">
    <div><p class="eyebrow">About the host</p><h1>${e(host)}</h1><p class="lead">${e(S.host_intro)}</p>${socialsHtml(siteSocials(S), true)}</div>
    <div class="about-photo">${photo ? `<img src="${e(media(photo))}" alt="${e(host)}">` : photoPh('Photo of ' + host)}</div>
  </div></section>
  <section class="section"><div class="wrap about-blocks">
    <article class="about-block"><h2>Who is ${e(host)}?</h2><div class="prose">${md(S.host_bio)}</div></article>
    <article class="about-block"><h2>Why this podcast?</h2><div class="prose">${md(S.host_why)}</div></article>
    <article class="about-block"><h2>Background</h2><div class="prose">${md(S.host_background)}</div></article>
    <article class="about-block about-mission"><h2>Mission</h2><div class="prose">${md(S.host_mission)}</div></article>
  </div></section>
  ${recent.data.length ? `<section class="section section-alt"><div class="wrap">
    <div class="section-head"><h2>Start listening</h2><a class="link-arrow" href="/episodes">All episodes ${icon('arrow')}</a></div>
    ${grid(recent.data, episodeCard)}</div></section>` : ''}`, S.host_intro);
}

async function viewEpisodes(_, q) {
  const term = (q.get('q') || '').trim().slice(0, 80);
  const catSlug = q.get('category') || '';
  const cat = CATS.find((c) => c.slug === catSlug) || null;
  const page = pageNum(q);

  let epIds = [], like = '';
  const topic = normTags(term.replace(/[%_,()*"\\{}]/g, ' '))[0] || '';
  if (term) {
    const clean = term.replace(/[%_,()*"\\]/g, ' ').trim();
    like = `%${clean}%`;
    const { data: gs } = await sb.from('guests').select('id').ilike('name', like);
    if (gs?.length) {
      const { data: eg } = await sb.from('episode_guests').select('episode_id').in('guest_id', gs.map((g) => g.id));
      epIds = (eg || []).map((r) => r.episode_id);
    }
  }
  const run = (withTranscript) => {
    let query = publishedEpisodes();
    if (cat) query = query.eq('category_id', cat.id);
    if (term) {
      const ors = [`title.ilike."${like}"`, `excerpt.ilike."${like}"`, `shownotes.ilike."${like}"`];
      if (withTranscript) { ors.push(`transcript.ilike."${like}"`); if (topic) ors.push(`tags.cs.{"${topic}"}`); }   // also search inside what was said + topics
      if (epIds.length) ors.push(`id.in.(${epIds.join(',')})`);
      query = query.or(ors.join(','));
    }
    return query.order('published_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1);
  };
  let [res, topics] = await Promise.all([run(true), topTags(20)]);
  if (res.error && term) res = await run(false);   // database not updated yet → search without transcript/topics
  const { data, count } = must(res);

  const chip = (label, slug) => {
    const p = new URLSearchParams(); if (slug) p.set('category', slug); if (term) p.set('q', term);
    const cur = (cat?.slug || '') === (slug || '');
    return `<a href="/episodes${p.toString() ? '?' + p : ''}"${cur ? ' aria-current="true"' : ''}>${e(label)}</a>`;
  };
  act(['➕ New episode', '#/episode/new'], ['🏷️ Categories', '#/categories']);
  render(cat ? cat.name : 'Episodes', `
  <section class="page-hero"><div class="wrap">
    <p class="eyebrow">All episodes</p><h1>${e(cat ? cat.name : 'Episodes')}</h1>
    <form class="search" method="get" action="/episodes" role="search" data-search>
      <label class="sr" for="q">Search episodes</label><span class="search-ico">${icon('search')}</span>
      <input id="q" type="search" name="q" value="${e(term)}" placeholder="Search by topic, title or guest…">
      ${cat ? `<input type="hidden" name="category" value="${e(cat.slug)}">` : ''}
      <button class="btn">Search</button>
    </form>
    <nav class="chips" aria-label="Categories">${chip('All', '')}${CATS.map((c) => chip(c.name, c.slug)).join('')}</nav>
    ${tagsHtml(topics)}
  </div></section>
  <section class="section"><div class="wrap">
    ${term || cat ? `<p class="muted results-line">${count} ${count === 1 ? 'episode' : 'episodes'} found${term ? ` for “${e(term)}”` : ''}. <a href="/episodes">Clear filters</a></p>` : ''}
    ${data.length ? grid(data, episodeCard) + pager(page, count, PAGE)
      : `<div class="empty">${icon('headphones')}<p>No episodes found.${term ? ' Try a different search.' : ''}</p><a class="btn btn-ghost" href="/get-involved#topic">Suggest this topic</a></div>`}
  </div></section>`);
}

async function viewEpisode(slug) {
  let { data: ep, error } = await publishedEpisodes(EP_FIELDS + ',transcript,clips,tags,seo_title,seo_description').eq('slug', slug).maybeSingle();
  if (error) ({ data: ep, error } = await publishedEpisodes(EP_FIELDS + ',transcript,clips').eq('slug', slug).maybeSingle());   // database not updated yet
  if (error) ({ data: ep } = await publishedEpisodes().eq('slug', slug).maybeSingle());   // database not updated yet
  if (!ep) return notFound();
  const [guests, prev, next] = await Promise.all([
    guestsOf(ep.id),
    publishedEpisodes('title,slug').lt('published_at', ep.published_at).order('published_at', { ascending: false }).limit(1).maybeSingle(),
    publishedEpisodes('title,slug').gt('published_at', ep.published_at).order('published_at', { ascending: true }).limit(1).maybeSingle(),
  ]);
  act(['✏️ Edit this episode', `#/episode/${ep.id}`], ['📣 Share on Facebook', fbShareUrl(), caption(ep.title, ep.excerpt || ep.shownotes)], ['➕ New episode', '#/episode/new']);
  render(ep.title, `
  <section class="page-hero ep-hero"><div class="wrap ep-head">
    <div class="ep-head-cover">${ep.cover ? `<img src="${e(media(ep.cover))}" alt="">` : coverFallback(ep.number)}</div>
    <div>
      <div class="meta">${ep.season ? `<span>Season ${+ep.season}</span>` : ''}${ep.number ? `<span>Episode ${+ep.number}</span>` : ''}${ep.categories ? `<a class="tag" href="/episodes?category=${e(ep.categories.slug)}">${e(ep.categories.name)}</a>` : ''}</div>
      <h1>${e(ep.title)}</h1>
      <div class="meta"><span>${fmtDate(ep.published_at)}</span>${ep.duration ? `<span>${icon('clock')} ${e(ep.duration)}</span>` : ''}</div>
      ${ep.excerpt ? `<p class="lead">${e(ep.excerpt)}</p>` : ''}
      ${shareBox('Share:', ep.title, ep.excerpt || ep.shownotes)}
    </div></div></section>
  <section class="section">
    <div class="wrap ep-layout">
      <div>
        <div class="player-box">${episodePlayer(ep) || '<p class="muted">Audio coming soon.</p>'}</div>
        ${ep.shownotes ? `<h2 class="h-sm">Show notes</h2><div class="prose">${md(ep.shownotes)}</div>` : ''}
        ${tagsHtml(ep.tags)}
        ${clipsHtml(ep.clips)}
        ${ep.transcript ? `<details class="transcript"><summary><span>📝 Read the transcript</span><small>${Math.max(1, Math.round(ep.transcript.split(/\s+/).length / 200))} min read</small></summary>
          <div class="transcript-body">${transcriptHtml(ep.transcript)}</div></details>` : ''}
      </div>
      <aside class="ep-aside">
        ${guests.length ? `<h2 class="h-sm">Guests</h2>` + guests.map((g) => `<a class="guest-mini" href="/guest/${e(g.slug)}">
          ${g.photo ? `<img src="${e(media(g.photo))}" alt="">` : `<span class="avatar">${e(g.name[0] || '?')}</span>`}
          <span><strong>${e(g.name)}</strong>${g.tagline ? `<small>${e(g.tagline)}</small>` : ''}</span></a>`).join('') : ''}
        <div class="aside-cta"><h2 class="h-sm">What did you think?</h2><p class="muted">Reply with a voice message or suggest a follow-up topic.</p>
          <a class="btn btn-sm" href="/get-involved#voice">${icon('mic')} Voice message</a></div>
      </aside>
    </div>
    <div class="wrap prevnext">
      ${next.data ? `<a href="/episode/${e(next.data.slug)}"><small>← Newer episode</small>${e(next.data.title)}</a>` : '<span></span>'}
      ${prev.data ? `<a class="right" href="/episode/${e(prev.data.slug)}"><small>Older episode →</small>${e(prev.data.title)}</a>` : ''}
    </div>
  </section>`, ep.excerpt || ep.shownotes, {
    title: ep.seo_title, description: ep.seo_description,
    ld: [ldEpisode({ origin: location.origin, S, ep, guests, image: img(ep.cover) || img(S.logo), audio: img(ep.audio) }),
      ldCrumbs(location.origin, [['Episodes', '/episodes'], [ep.title, '/episode/' + ep.slug]])],
  });
}

/** Share buttons: Facebook, WhatsApp, copy link (the page gets a nice preview thanks to the share edge function) */
function shareBox(label, title, text = '') {
  const url = location.origin + location.pathname;
  const fb = 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
  const wa = 'https://wa.me/?text=' + encodeURIComponent(title + ' — ' + url);
  return `<div class="share">${label ? `<span>${e(label)}</span>` : ''}
    <a class="btn btn-sm share-fb" target="_blank" rel="noopener" href="${e(fb)}" data-caption="${e(caption(title, text))}">${icon('facebook')} Facebook</a>
    <a class="btn btn-ghost btn-sm" target="_blank" rel="noopener" href="${e(wa)}">${icon('whatsapp')} WhatsApp</a>
    <button class="btn btn-ghost btn-sm" data-share data-title="${e(title)}">${icon('share')} Share with friends</button></div>`;
}
/** Ready-made text for a Facebook post: title, short intro and the link */
function caption(title, text, url = location.origin + location.pathname) {
  const intro = excerpt(text, 220);
  return [title, intro, url].filter(Boolean).join('\n\n');
}
const fbShareUrl = (url = location.origin + location.pathname) => 'https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url);
/** Small round Facebook button on a card (news / episode in lists and on the homepage) */
function fbMini(path, title, text) {
  const url = location.origin + path;
  return `<a class="fb-mini" href="${e(fbShareUrl(url))}" target="_blank" rel="noopener" data-url="${e(url)}" data-caption="${e(caption(title, text, url))}" aria-label="Share on Facebook" title="Share on Facebook">${icon('facebook')}<span>Share</span></a>`;
}

/** Highlights: short clips (YouTube Shorts/videos get a player; TikTok, Instagram, Facebook… get a button) */
function clipsHtml(text) {
  const urls = String(text || '').split(/\s+/).map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, 12);
  if (!urls.length) return '';
  const items = urls.map((u) => {
    const yt = u.match(/(?:youtube\.com\/(?:shorts\/|watch\?(?:.*&)?v=|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (yt) {
      const vertical = /shorts\//.test(u);
      return `<div class="clip${vertical ? ' clip-vertical' : ''}"><iframe src="https://www.youtube-nocookie.com/embed/${yt[1]}" title="Clip" loading="lazy" allow="accelerometer; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
    }
    let host = ''; try { host = new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; }
    const net = [['tiktok', 'TikTok'], ['instagram', 'Instagram'], ['facebook', 'Facebook'], ['fb.', 'Facebook'], ['x.com', 'X'], ['twitter', 'X'], ['riverside', 'Riverside']].find(([k]) => host.includes(k));
    const key = net ? net[1].toLowerCase().replace(' ', '') : 'link';
    return `<a class="clip-link" href="${e(u)}" target="_blank" rel="noopener">${icon(key === 'riverside' ? 'play' : key)} Watch clip${net ? ' on ' + net[1] : ''} ↗</a>`;
  }).join('');
  return `<h2 class="h-sm">Highlights</h2><div class="clips">${items}</div>`;
}

/** Transcript from Riverside: keep line breaks, bold speaker names, make timestamps clickable */
function transcriptHtml(text) {
  return String(text || '').replace(/\r\n?/g, '\n').trim().split(/\n{2,}/).map((para) => '<p>' + para.split('\n').map((line) => {
    let h = e(line);
    h = h.replace(/^((?:\[)?\d{1,2}:\d{2}(?::\d{2})?(?:\])?)\s*/, (m, t) => `<span class="ts">${t.replace(/[\[\]]/g, '')}</span> `);
    h = h.replace(/^((?:<span class="ts">[^<]+<\/span> )?)([A-Z][\w .'-]{0,30}?)(:|\s{2,}(?=<span class="ts">|\d))/, (m, ts, name, sep) => `${ts}<strong>${name}</strong>${sep === ':' ? ':' : ' '}`);
    h = h.replace(/(\s)(\d{1,2}:\d{2}(?::\d{2})?)(?=\s|$)/g, (m, sp, t) => `${sp}<span class="ts">${t}</span>`);
    return h;
  }).join('<br>') + '</p>').join('');
}

/** Clicking a timestamp (12:30) jumps the player to that moment (works for uploaded audio and YouTube) */
function bindTimestamps() {
  const box = $main.querySelector('.player-box');
  if (!box) return;
  const audio = box.querySelector('audio');
  const yt = box.querySelector('iframe[src*="youtube"]');
  if (!audio && !yt) return;
  $main.querySelectorAll('.ts').forEach((el) => {
    el.classList.add('ts-link');
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');
    el.title = 'Play from here';
    const go = () => {
      const secs = el.textContent.trim().split(':').map(Number).reduce((a, b) => a * 60 + b, 0);
      if (audio) { audio.currentTime = secs; audio.play().catch(() => {}); }
      else yt.src = yt.src.replace(/[?&](start|autoplay)=\d+/g, '').replace(/(\?|$)/, `?start=${secs}&autoplay=1&`).replace(/[&?]$/, '');
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
    el.addEventListener('click', go);
    el.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); go(); } });
  });
}

async function viewGuests() {
  const [{ data: guests }, { data: eps }] = await Promise.all([
    sb.from('guests').select('*').order('name'),
    publishedEpisodes('id, episode_guests(guest_id)'),
  ]);
  const n = {};
  (eps || []).forEach((ep) => (ep.episode_guests || []).forEach((r) => { n[r.guest_id] = (n[r.guest_id] || 0) + 1; }));
  act(['➕ New guest', '#/guest/new']);
  render('Guests', `
  <section class="page-hero"><div class="wrap"><p class="eyebrow">Who joined us?</p><h1>Guests</h1><p class="lead">The people who shared their stories on Joe Point.</p></div></section>
  <section class="section"><div class="wrap">
    ${guests?.length ? `<div class="grid grid-4">${guests.map((g) => `<a class="card guest-card" href="/guest/${e(g.slug)}">
      <div class="guest-photo">${g.photo ? `<img src="${e(media(g.photo))}" alt="" loading="lazy">` : `<span class="avatar avatar-lg">${e(g.name[0] || '?')}</span>`}</div>
      <div class="card-body"><h3>${e(g.name)}</h3>${g.tagline ? `<p>${e(g.tagline)}</p>` : ''}<span class="meta">${n[g.id] || 0} ${(n[g.id] || 0) === 1 ? 'episode' : 'episodes'}</span></div></a>`).join('')}</div>`
      : `<div class="empty">${icon('mic')}<p>The first guests are coming soon!</p></div>`}
  </div></section>`);
}

async function viewGuest(slug) {
  const { data: g } = await sb.from('guests').select('*').eq('slug', slug).maybeSingle();
  if (!g) return notFound();
  const { data: links } = await sb.from('episode_guests').select('episode_id').eq('guest_id', g.id);
  const ids = (links || []).map((r) => r.episode_id);
  const eps = ids.length ? (await publishedEpisodes().in('id', ids).order('published_at', { ascending: false })).data || [] : [];
  const soc = {}; ['website', 'instagram', 'tiktok', 'youtube', 'facebook', 'x', 'linkedin'].forEach((k) => { if (g[k]) soc[k] = g[k]; });
  act(['✏️ Edit this guest', `#/guest/${g.id}`], [`🎙️ New episode with ${g.name}`, `#/episode/new?guest=${g.id}`], ['📣 Share on Facebook', fbShareUrl(), caption(`Meet ${g.name}${g.tagline ? ' — ' + g.tagline : ''}`, g.bio)], ['➕ New guest', '#/guest/new']);
  render(g.name, `
  <section class="page-hero"><div class="wrap guest-head">
    <div class="guest-head-photo">${g.photo ? `<img src="${e(media(g.photo))}" alt="${e(g.name)}">` : `<span class="avatar avatar-xl">${e(g.name[0] || '?')}</span>`}</div>
    <div><p class="eyebrow"><a href="/guests">Guests</a></p><h1>${e(g.name)}</h1>${g.tagline ? `<p class="lead">${e(g.tagline)}</p>` : ''}${socialsHtml(soc, true)}
    ${shareBox('Share:', `Meet ${g.name}${g.tagline ? ' — ' + g.tagline : ''}`, g.bio)}</div>
  </div></section>
  ${g.bio || g.tags?.length ? `<section class="section"><div class="wrap narrow">${g.bio ? `<h2 class="h-sm">Bio</h2><div class="prose">${md(g.bio)}</div>` : ''}${tagsHtml(g.tags)}</div></section>` : ''}
  <section class="section section-alt"><div class="wrap"><h2>Episodes with ${e(g.name)}</h2>
    ${eps.length ? grid(eps, episodeCard) : '<p class="muted">The episode is coming soon.</p>'}</div></section>`, g.tagline || g.bio, {
    title: g.seo_title || `${g.name}${g.tagline ? ' — ' + g.tagline : ''} | ${S.site_title || 'Joe Point Podcast'}`, description: g.seo_description,
    ld: [ldPerson({ origin: location.origin, g, image: img(g.photo) }), ldCrumbs(location.origin, [['Guests', '/guests'], [g.name, '/guest/' + g.slug]])],
  });
}

async function viewNews(_, q) {
  const type = POST_TYPES[q.get('type')] ? q.get('type') : '';
  const page = pageNum(q);
  let query = publishedPosts();
  if (type) query = query.eq('type', type);
  const { data, count } = await query.order('published_at', { ascending: false }).range((page - 1) * PAGE, page * PAGE - 1).then(must);
  act(['➕ New news post', '#/post/new']);
  render('News & updates', `
  <section class="page-hero"><div class="wrap"><p class="eyebrow">Behind the scenes</p><h1>News & updates</h1>
    <nav class="chips" aria-label="Post type"><a href="/news"${!type ? ' aria-current="true"' : ''}>All</a>
      ${Object.entries(POST_TYPES).map(([k, l]) => `<a href="/news?type=${k}"${type === k ? ' aria-current="true"' : ''}>${e(l)}</a>`).join('')}</nav></div></section>
  <section class="section"><div class="wrap">${data.length ? grid(data, postCard) + pager(page, count, PAGE) : '<div class="empty"><p>No posts in this category yet.</p></div>'}</div></section>`);
}

async function viewPost(slug) {
  const { data: p } = await publishedPosts().eq('slug', slug).maybeSingle();
  if (!p) return notFound();
  const [{ data: imgs }, epRes] = await Promise.all([
    sb.from('post_images').select('*').eq('post_id', p.id).order('sort').order('id'),
    p.episode_id ? publishedEpisodes('id,title,slug,number,cover').eq('id', p.episode_id).maybeSingle() : Promise.resolve({ data: null }),
  ]);
  const ep = epRes.data;
  const linkBlock = postLinks(p, ep);
  act(['✏️ Edit this post', `#/post/${p.id}`], ['📣 Share on Facebook', fbShareUrl(), caption(p.title, p.excerpt || p.body)], ['➕ New news post', '#/post/new']);
  render(p.title, `
  <article><section class="page-hero"><div class="wrap narrow">
    <div class="meta"><a class="tag tag-${e(p.type)}" href="/news?type=${e(p.type)}">${e(POST_TYPES[p.type] || 'News')}</a><span>${fmtDate(p.published_at)}</span></div>
    <h1>${e(p.title)}</h1>${p.excerpt ? `<p class="lead">${e(p.excerpt)}</p>` : ''}
    ${shareBox('Share:', p.title, p.excerpt || p.body)}</div></section>
  <section class="section"><div class="wrap narrow">
    ${p.image ? `<img class="post-hero-img" src="${e(media(p.image))}" alt="">` : ''}
    <div class="prose">${md(p.body)}</div>
    ${linkBlock}
    ${tagsHtml(p.tags)}
    ${imgs?.length ? `<div class="gallery">${imgs.map((im) => `<figure><a href="${e(media(im.file))}" target="_blank" rel="noopener"><img src="${e(media(im.file))}" alt="${e(im.caption)}" loading="lazy"></a>${im.caption ? `<figcaption>${e(im.caption)}</figcaption>` : ''}</figure>`).join('')}</div>` : ''}
    <p class="mt"><a class="link-arrow" href="/news">← Back to news</a></p>
  </div></section></article>`, p.excerpt || p.body, {
    title: p.seo_title, description: p.seo_description,
    ld: [ldArticle({ origin: location.origin, S, p, image: img(p.image) || img(S.logo) }), ldCrumbs(location.origin, [['News', '/news'], [p.title, '/news/' + p.slug]])],
  });
}

/** Buttons under a news post: related episode and/or an external link (Facebook, Instagram, YouTube…) */
function postLinks(p, ep) {
  const parts = [];
  if (ep) {
    parts.push(`<a class="post-ep" href="/episode/${e(ep.slug)}">
      <span class="post-ep-cover">${ep.cover ? `<img src="${e(media(ep.cover))}" alt="">` : coverFallback(ep.number)}</span>
      <span><small>🎧 Listen to the episode</small><strong>${e(ep.title)}</strong></span><span class="post-ep-go">${icon('play')}</span></a>`);
  }
  if (p.link_url) {
    let host = '';
    try { host = new URL(p.link_url).hostname.replace(/^www\./, ''); } catch { /* ignore */ }
    const known = [['facebook', 'Facebook', 'facebook'], ['fb.', 'Facebook', 'facebook'], ['instagram', 'Instagram', 'instagram'], ['tiktok', 'TikTok', 'tiktok'],
      ['youtu', 'YouTube', 'youtube'], ['spotify', 'Spotify', 'spotify'], ['apple', 'Apple Podcasts', 'apple'], ['x.com', 'X', 'x'], ['twitter', 'X', 'x'], ['linkedin', 'LinkedIn', 'linkedin']]
      .find(([k]) => host.includes(k));
    const label = p.link_label || (known ? `View on ${known[1]}` : `Open link (${host || 'website'})`);
    const embed = /youtu|spotify|podcasts\.apple|soundcloud/.test(host) ? embedHtml(p.link_url) : '';
    parts.push(`${embed}<p><a class="btn" href="${e(p.link_url)}" target="_blank" rel="noopener">${icon(known ? known[2] : 'link')} ${e(label)} ↗</a></p>`);
  }
  return parts.length ? `<div class="post-links">${parts.join('')}</div>` : '';
}

async function viewCommunity(_, q) {
  const page = pageNum(q), per = 12;
  const { data, count } = await sb.from('stories').select('id,name,location,title,body,photo,approved_at', { count: 'exact' })
    .eq('status', 'approved').order('approved_at', { ascending: false }).range((page - 1) * per, page * per - 1).then(must);
  act(['📝 Review new stories', '#/stories/pending'], ['✏️ Edit intro text', '#/settings/getinvolved']);
  render('Community stories', `
  <section class="page-hero"><div class="wrap community-hero">
    <div><p class="eyebrow">From The Gambia to everywhere</p><h1>Community stories</h1><p class="lead">${e(S.stories_intro)}</p></div>
    <a class="btn" href="/community/share">Share your story</a></div></section>
  <section class="section"><div class="wrap">
    ${data.length ? grid(data, storyCard) + pager(page, count, per) : `<div class="empty">${icon('quote')}<p>No stories yet — be the first!</p><a class="btn" href="/community/share">Share your story</a></div>`}
  </div></section>`, S.stories_intro);
}

async function viewStory(id) {
  const { data: s } = await sb.from('stories').select('id,name,location,title,body,photo,approved_at,created_at').eq('id', id).eq('status', 'approved').maybeSingle();
  if (!s) return notFound();
  act(['✏️ Edit this story', `#/story/${s.id}`], ['📣 Share on Facebook', fbShareUrl(), caption(`${s.title} — a story by ${s.name}`, s.body)]);
  render(s.title, `
  <article><section class="page-hero"><div class="wrap narrow">
    <p class="eyebrow"><a href="/community">Community stories</a></p><h1>${e(s.title)}</h1>
    <div class="meta"><span><strong>${e(s.name)}</strong></span>${s.location ? `<span>${icon('pin')} ${e(s.location)}</span>` : ''}<span>${fmtDate(s.approved_at || s.created_at)}</span></div>
  </div></section>
  <section class="section"><div class="wrap narrow">
    ${s.photo ? `<img class="post-hero-img" src="${e(media(s.photo))}" alt="Photo with ${e(s.name)}'s story">` : ''}
    <div class="prose story-body">${md(s.body)}</div>
    ${shareBox('Share this story:', `${s.title} — a story by ${s.name}`, s.body)}
    <div class="aside-cta mt"><h2 class="h-sm">Do you have a story too?</h2><p class="muted">Share it with the Joe Point community.</p><a class="btn btn-sm" href="/community/share">Share your story</a></div>
  </div></section></article>`, s.body);
}

/* ---------- Forms ---------- */
const HP = `<div class="hp" aria-hidden="true"><label>Leave empty<input type="text" name="website_url" tabindex="-1" autocomplete="off"></label></div>`;
const nameEmail = (emailLabel = 'Email <small>(optional)</small>', req = false) => `<div class="row-2">
  <label>Name${req ? ' *' : ''}<input name="name" maxlength="80"${req ? ' required' : ''}></label>
  <label>${emailLabel}<input type="email" name="email"${req ? ' required' : ''}></label></div>`;
const recorder = (label) => `<div class="recorder" data-recorder>
  <span class="label">${e(label)}</span>
  <div class="rec-controls">
    <button type="button" class="btn btn-ghost btn-sm rec-start">${icon('mic')} Record</button>
    <button type="button" class="btn btn-sm rec-stop" hidden>${icon('stop')} Stop <span class="rec-time">0:00</span></button>
    <span class="rec-or">or</span>
    <label class="btn btn-ghost btn-sm rec-file">Choose file<input type="file" name="audio" accept="audio/*" hidden></label>
  </div>
  <audio class="player rec-preview" controls hidden></audio>
  <small class="rec-msg muted"></small></div>`;

function viewStoryForm() {
  const host = e(S.host_name || 'Lamin');
  render('Share your story', `
  <section class="page-hero"><div class="wrap narrow"><p class="eyebrow"><a href="/community">Community stories</a></p><h1>Share your story</h1>
    <p class="lead">Where are you from, what have you been through, what do you want the world to know? Send in your story and a photo. ${host} reads everything and publishes it after approval.</p></div></section>
  <section class="section"><div class="wrap narrow">
    <form class="form card" id="story" data-form="story">${HP}
      <div class="row-2"><label>Your name *<input name="name" required maxlength="80"></label><label>City / country<input name="location" maxlength="80" placeholder="e.g. Brikama, The Gambia"></label></div>
      <label>Email <small>(not shown, only used if ${host} has a question)</small><input type="email" name="email"></label>
      <label>Title of your story *<input name="title" required maxlength="140"></label>
      <label>Your story *<textarea name="body" rows="10" required minlength="30" maxlength="8000"></textarea></label>
      <label class="file">Photo with your story <small>(automatically resized; location data is removed)</small>
        <input type="file" name="photo" accept="image/*" data-preview><img class="preview" alt="" hidden></label>
      <label class="check"><input type="checkbox" name="consent" value="1" required> I give permission to publish my story, name, location and photo on this website. I have the right to share this photo.</label>
      <button class="btn">Send my story</button>
    </form></div></section>`);
}

async function viewParticipate() {
  const { data: answers } = await sb.from('submissions').select('id,type,name,message,question,public_audio,created_at').eq('is_public', true).order('created_at', { ascending: false }).limit(12);
  const qOn = S.question_active === '1' && S.question_of_week;
  const host = e(S.host_name || 'Lamin');
  act(['❓ Change question of the week', '#/settings/getinvolved'], ['📥 Open inbox', '#/inbox']);
  render('Get involved', `
  <section class="page-hero"><div class="wrap"><p class="eyebrow">Your voice in the podcast</p><h1>Get involved</h1>
    <p class="lead">We make Joe Point together. Answer the question of the week, record a voice message or tell us which topic you'd love to hear.</p>
    <nav class="chips">${qOn ? '<a href="#question">Question of the week</a>' : ''}<a href="#voice">Voice message</a><a href="#topic">Suggest a topic</a><a href="/community/share">Share a story</a></nav></div></section>

  ${qOn ? `<section class="section" id="question"><div class="wrap two-col">
    <div><p class="eyebrow">Question of the week</p><h2 class="qotw-q">“${e(S.question_of_week)}”</h2><p class="muted">The best answers might be featured in the next episode.</p></div>
    <form class="form card" data-form="question">${HP}${nameEmail()}
      <label>Your answer<textarea name="message" rows="4" maxlength="5000"></textarea></label>
      ${recorder('Or record your answer')}<button class="btn">Send answer</button></form>
  </div></section>` : ''}

  ${answers?.length ? `<section class="section section-alt"><div class="wrap"><h2>Listener responses</h2><div class="grid grid-3">
    ${answers.map((a) => `<figure class="card answer">${a.question ? `<p class="answer-q">${e(a.question)}</p>` : ''}
      ${a.message ? `<blockquote>“${e(excerpt(a.message, 400))}”</blockquote>` : ''}
      ${a.public_audio ? `<audio class="player" controls preload="none" src="${e(media(a.public_audio))}"></audio>` : ''}
      <figcaption>— ${e(a.name || 'Anonymous listener')}</figcaption></figure>`).join('')}</div></div></section>` : ''}

  <section class="section" id="voice"><div class="wrap two-col">
    <div><p class="eyebrow">Voice message</p><h2>Record something for ${host}</h2>
      <p class="muted">A question, a reaction to an episode, a shout-out from The Gambia — record it right in your browser or upload an audio file (max 12 MB). With your permission it may be played on the podcast.</p></div>
    <form class="form card" data-form="voice">${HP}${nameEmail()}
      ${recorder('Your message')}
      <label>Note <small>(optional)</small><input name="message" maxlength="500"></label>
      <button class="btn">${icon('mic')} Send voice message</button></form>
  </div></section>

  <section class="section section-alt" id="topic"><div class="wrap two-col">
    <div><p class="eyebrow">Suggest a topic</p><h2>Which topic do you want to hear?</h2><p class="muted">A theme, a question, or someone you'd love to see as a guest. Everything is welcome.</p></div>
    <form class="form card" data-form="topic">${HP}
      <label>Topic *<input name="subject" required maxlength="140"></label>
      <label>Tell us a bit more<textarea name="message" rows="4" maxlength="5000"></textarea></label>
      ${nameEmail()}<button class="btn">Send topic</button></form>
  </div></section>`);
}

function viewContact() {
  const mail = S.contact_email;
  const soc = siteSocials(S);
  act(['✏️ Edit contact page', '#/settings/contact'], ['🔗 Social media links', '#/settings/social'], ['📥 Open inbox', '#/inbox/contact']);
  render('Contact', `
  <section class="page-hero"><div class="wrap"><p class="eyebrow">Get in touch</p><h1>Contact</h1><p class="lead">${e(S.contact_intro)}</p></div></section>
  <section class="section"><div class="wrap two-col">
    <div class="contact-info">
      ${mail ? `<h2 class="h-sm">Email</h2><p><a class="contact-mail" href="mailto:${e(mail)}">${icon('mail')} ${e(mail)}</a></p>` : ''}
      ${Object.keys(soc).length ? `<h2 class="h-sm">Socials</h2>${socialsHtml(soc, true)}` : ''}
      <div class="aside-cta mt"><h2 class="h-sm">Want to be a guest?</h2><p class="muted">Tell us briefly who you are and what you'd like to talk about.</p></div>
    </div>
    <form class="form card" id="contact" data-form="contact">${HP}${nameEmail('Email *', true)}
      <label>Subject<input name="subject" maxlength="140"></label>
      <label>Message *<textarea name="message" rows="7" required maxlength="5000"></textarea></label>
      <button class="btn">Send message</button></form>
  </div></section>`);
}

/* =========================================================
   Submitting forms
   ========================================================= */
const OK_MSG = {
  story: 'Thank you for your story! It will be read and published after approval.',
  topic: 'Great, your topic is on the list!',
  question: 'Thanks for your answer! You might hear it on the podcast.',
  voice: 'Your voice message has arrived. Thank you!',
  contact: 'Your message has been sent. We will reply as soon as possible.',
};

function bindForms() {
  $main.querySelectorAll('form[data-search]').forEach((f) => f.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const p = new URLSearchParams(new FormData(f));
    if (!p.get('q')) p.delete('q');
    navigate('/episodes' + (p.toString() ? '?' + p : ''));
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
      btn.disabled = true; const label = btn.innerHTML; btn.textContent = 'Sending…';
      try {
        if (kind === 'story') {
          if (val('body').length < 30) throw new Error('Your story could be a bit longer — please write at least a few sentences.');
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
            if (audio.size > 12 * 1024 * 1024) throw new Error('The audio file is larger than 12 MB.');
            path = await upload('inbox', 'voice', audio);
          }
          if (kind === 'voice' && !path) throw new Error('Record a message or choose an audio file.');
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

  // Photo preview
  $main.querySelectorAll('input[type=file][data-preview]').forEach((inp) => inp.addEventListener('change', () => {
    const img = inp.parentElement.querySelector('.preview'); const f = inp.files[0];
    if (img && f && f.type.startsWith('image/')) { img.src = URL.createObjectURL(f); img.hidden = false; }
  }));

  // Share
  // "Share with friends": phone → the phone's own share menu (WhatsApp, Messenger, SMS, Instagram…); computer → copy the link
  $main.querySelectorAll('[data-share]').forEach((b) => b.addEventListener('click', async () => {
    const url = b.dataset.url ? location.origin + b.dataset.url : location.origin + location.pathname;
    if (isTouch() && navigator.share) { navigator.share({ title: b.dataset.title, text: b.dataset.title, url }).catch(() => {}); return; }
    try { await navigator.clipboard.writeText(url); toast('ok', '🔗 Link copied — paste it in a message to your friends.'); } catch { /* no clipboard */ }
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
    catch { msg.textContent = 'No access to the microphone. You can choose an audio file instead.'; return; }
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
      msg.textContent = `Recording ready (${time.textContent}). Listen back and send, or record again.`;
    };
    rec.start();
    secs = 0; time.textContent = '0:00';
    start.hidden = true; stop.hidden = false; preview.hidden = true; msg.textContent = 'Recording…';
    timer = setInterval(() => { secs++; time.textContent = Math.floor(secs / 60) + ':' + String(secs % 60).padStart(2, '0'); if (secs >= MAX) stop.click(); }, 1000);
  });
  stop.addEventListener('click', () => {
    clearInterval(timer);
    if (rec && rec.state !== 'inactive') rec.stop();
    stop.hidden = true; start.hidden = false; start.lastChild.textContent = ' Record again';
  });
}

boot();
