// Joe Point Podcast — admin
import { SUPABASE_URL } from './config.js';
import {
  sb, e, excerpt, fmtDate, media, slugify, validUrl, icon, resizeImage, upload, errMsg,
  NETWORKS, POST_TYPES, FONTS, PRESETS, theme, mix, lum, inkOn,
} from './lib.js';

const $app = document.getElementById('app');
let S = {};
let pendingFlash = null;
let dirty = false;
let PARAMS = new URLSearchParams();   // e.g. #/episode/new?guest=3&return=/guest/joro

/** Where did Lamin come from on the website? (only safe, local paths) */
function returnPath() {
  const r = PARAMS.get('return') || '';
  return /^\/(?!\/)(?!admin)/.test(r) ? r : '';
}
const isLive = (row) => row && row.status !== 'draft' && row.status !== 'pending' && row.status !== 'rejected' && (!row.published_at || new Date(row.published_at) <= new Date());

/** If he came from the website: go back there (to `path` or where he came from) and show the message there */
function backToSite(msg, path) {
  const ret = returnPath();
  if (!ret) return false;
  try { sessionStorage.setItem('jp-flash', msg); } catch { /* no storage */ }
  dirty = false;
  location.href = path || ret;
  return true;
}
/** After deleting: don't return to the page of the thing that was just deleted */
const afterDelete = (ownPath, listPath) => (returnPath() === ownPath ? listPath : '');

/* =========================================================
   Start-up & login
   ========================================================= */
async function boot() {
  if (SUPABASE_URL.includes('JOUW-PROJECT')) {
    return authScreen(`<h1>Not connected yet</h1><p class="muted">First fill in the Supabase details in <code>assets/js/config.js</code> (see LEESMIJ.md).</p>`);
  }
  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') showNewPassword();
    if (event === 'SIGNED_OUT') showLogin();
  });
  if (/type=recovery/.test(location.hash)) return; // handled by PASSWORD_RECOVERY
  const { data } = await sb.auth.getSession();
  if (!data.session) return showLogin();
  await enter();
}

async function enter() {
  const { data: ok, error } = await sb.rpc('is_admin');
  if (error || !ok) {
    authScreen(`<h1>No access</h1><p class="muted">This account doesn't have admin rights (yet). Add the email address to the <code>admins</code> table (see LEESMIJ.md).</p><button class="btn" id="out">Log out</button>`);
    document.getElementById('out').onclick = () => sb.auth.signOut();
    return;
  }
  await loadSettings();
  if (!enter.bound) { window.addEventListener('hashchange', route); enter.bound = true; }
  route();
}

async function loadSettings() {
  const { data } = await sb.from('settings').select('key,value');
  S = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
}

function authScreen(inner) {
  document.body.className = 'auth';
  $app.className = '';
  $app.innerHTML = `<div class="auth-box"><a class="side-brand" href="/" title="Go to the website"><span>${icon('mic')}</span> Joe Point <small>admin</small></a><div id="auth-flash"></div>${inner}</div>`;
}
const authFlash = (type, msg) => { document.getElementById('auth-flash').innerHTML = `<div class="flash flash-${type}">${e(msg)}</div>`; };

function showLogin() {
  window.removeEventListener('hashchange', route); enter.bound = false;
  authScreen(`<h1>Log in</h1>
    <form class="stack" id="login">
      <label class="field"><span>Email address</span><input type="email" name="email" required autocomplete="username"></label>
      <label class="field"><span>Password</span><input type="password" name="password" required autocomplete="current-password"></label>
      <button class="btn">Log in</button>
    </form>
    <p class="small"><a href="#" id="forgot">Forgot your password?</a> · <a href="/">Go to the website</a></p>`);
  const f = document.getElementById('login');
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const btn = f.querySelector('button'); btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    btn.disabled = false;
    if (error) return authFlash('error', /invalid/i.test(error.message) ? 'Email address or password is incorrect.' : error.message);
    enter();
  };
  document.getElementById('forgot').onclick = async (ev) => {
    ev.preventDefault();
    const email = f.email.value.trim();
    if (!email) return authFlash('error', 'Please fill in your email address first.');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/admin/' });
    authFlash(error ? 'error' : 'ok', error ? error.message : 'Check your email: you will receive a link to choose a new password.');
  };
}

function showNewPassword() {
  authScreen(`<h1>New password</h1>
    <form class="stack" id="np">
      <label class="field"><span>New password (at least 10 characters)</span><input type="password" name="p1" minlength="10" required autocomplete="new-password"></label>
      <label class="field"><span>Repeat password</span><input type="password" name="p2" minlength="10" required autocomplete="new-password"></label>
      <button class="btn">Save</button></form>`);
  const f = document.getElementById('np');
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    if (f.p1.value !== f.p2.value) return authFlash('error', "The passwords don't match.");
    const { error } = await sb.auth.updateUser({ password: f.p1.value });
    if (error) return authFlash('error', error.message);
    history.replaceState(null, '', '/admin/');
    pendingFlash = ['ok', 'Password saved. Welcome back!'];
    enter();
  };
}

/* =========================================================
   Router & layout
   ========================================================= */
const MENU = [
  ['dashboard', 'Overview', 'headphones', ['dashboard']],
  ['episodes', 'Episodes', 'play', ['episodes', 'episode']],
  ['guests', 'Guests', 'mic', ['guests', 'guest']],
  ['categories', 'Categories', 'link', ['categories']],
  ['posts', 'News & updates', 'quote', ['posts', 'post']],
  ['stories', 'Community stories', 'pin', ['stories', 'story']],
  ['inbox', 'Inbox', 'mail', ['inbox', 'message']],
  ['settings', 'Settings', 'website', ['settings']],
];

const VIEWS = {
  dashboard: viewDashboard, episodes: viewEpisodes, episode: viewEpisode, guests: viewGuests, guest: viewGuest,
  categories: viewCategories, posts: viewPosts, post: viewPost, stories: viewStories, story: viewStory,
  inbox: viewInbox, message: viewMessage, settings: viewSettings,
};

async function route() {
  if (dirty && !confirm("You have changes that haven't been saved yet. Leave anyway?")) {
    history.replaceState(null, '', route.last || '#/');
    return;
  }
  dirty = false;
  const [pathPart, qs = ''] = location.hash.replace(/^#\/?/, '').split('?');
  const [page = 'dashboard', arg = ''] = pathPart.split('/');
  PARAMS = new URLSearchParams(qs);
  route.last = location.hash;
  const view = VIEWS[page] || viewDashboard;
  await shell(page);
  const main = document.getElementById('main');
  main.innerHTML = '<p class="muted">Loading…</p>';
  try {
    await view(arg, main);
    if (returnPath()) main.insertAdjacentHTML('afterbegin', `<p class="back-site"><a href="${e(returnPath())}">← Back to the website</a></p>`);
  }
  catch (err) { console.error(err); main.innerHTML = `<div class="flash flash-error">${e(errMsg(err))}</div>`; }
  if (pendingFlash) { flash(...pendingFlash); pendingFlash = null; }
  main.querySelectorAll('form').forEach((f) => f.addEventListener('input', () => { dirty = true; }));
  main.querySelectorAll('[data-confirm]').forEach((b) => b.addEventListener('click', (ev) => { if (!confirm(b.dataset.confirm)) { ev.preventDefault(); ev.stopImmediatePropagation(); } }, true));
  main.querySelectorAll('input[type=file][data-preview]').forEach((inp) => inp.addEventListener('change', () => {
    const box = inp.closest('.img-row')?.querySelector('.img-preview'); const f = inp.files[0];
    if (box && f && f.type.startsWith('image/')) box.innerHTML = `<img src="${URL.createObjectURL(f)}" alt="">`;
  }));
  window.scrollTo(0, 0);
}
window.addEventListener('beforeunload', (ev) => { if (dirty) { ev.preventDefault(); ev.returnValue = ''; } });

function go(hash, msg) {
  dirty = false;
  if (msg) pendingFlash = msg;
  if (location.hash === hash) route(); else location.hash = hash;
}

async function shell(page) {
  const [{ count: pending }, { count: unread }] = await Promise.all([
    sb.from('stories').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    sb.from('submissions').select('id', { count: 'exact', head: true }).eq('is_read', false),
  ]);
  const badge = { stories: pending, inbox: unread };
  document.body.className = '';
  $app.className = 'admin';
  $app.innerHTML = `
  <aside class="side">
    <a class="side-brand" href="/" title="Go to the website"><span>${icon('mic')}</span> Joe Point <small>admin</small></a>
    <button class="side-toggle" aria-expanded="false" id="tog">${icon('menu')} Menu</button>
    <nav class="side-nav"><a href="/" class="to-site">${icon('website')} Go to website</a>${MENU.map(([k, l, ic, m]) => `<a href="#/${k}"${m.includes(page) ? ' aria-current="page"' : ''}>${icon(ic)} ${e(l)}${badge[k] ? `<b class="count">${badge[k]}</b>` : ''}</a>`).join('')}</nav>
    <div class="side-foot"><a href="/">View website →</a><a href="#" id="logout">Log out</a></div>
  </aside>
  <main class="main"><div id="flash"></div><div id="main"></div></main>`;
  document.getElementById('logout').onclick = (ev) => { ev.preventDefault(); sb.auth.signOut(); };
  document.getElementById('tog').onclick = function () { document.body.classList.toggle('nav-open'); this.setAttribute('aria-expanded', document.body.classList.contains('nav-open')); };
}

function flash(type, msg) {
  const el = document.getElementById('flash');
  if (el) { el.innerHTML = `<div class="flash flash-${type}" role="status">${e(msg)}</div>`; el.scrollIntoView({ block: 'nearest' }); }
}

/* =========================================================
   Helpers
   ========================================================= */
const must = (r) => { if (r.error) throw r.error; return r.data; };
const MD_HELP = 'Formatting: <code>## Heading</code> · <code>- list item</code> · <code>**bold**</code> · <code>*italic*</code> · <code>[text](https://link)</code>';

function fText(name, label, value, o = {}) {
  return `<label class="field"><span>${e(label)}${o.required ? ' *' : ''}</span>${o.help ? `<small>${o.help}</small>` : ''}
    <input type="${o.type || 'text'}" name="${e(name)}" value="${e(value ?? '')}"${o.required ? ' required' : ''}${o.placeholder ? ` placeholder="${e(o.placeholder)}"` : ''}${o.attrs || ''}></label>`;
}
function fArea(name, label, value, o = {}) {
  return `<label class="field"><span>${e(label)}</span>${o.help ? `<small>${o.help}</small>` : ''}
    <textarea name="${e(name)}" rows="${o.rows || 5}"${o.md ? ' data-md' : ''}${o.required ? ' required' : ''}>${e(value ?? '')}</textarea></label>`;
}
function fImage(name, label, current, help = '', src = null) {
  const url = src || (current ? media(current) : '');
  return `<div class="field field-image"><span>${e(label)}</span>${help ? `<small>${help}</small>` : ''}
    <div class="img-row"><div class="img-preview">${url ? `<img src="${e(url)}" alt="">` : '<em>No image</em>'}</div>
    <div class="img-actions"><input type="file" name="${e(name)}" accept="image/*" data-preview>
    ${current ? `<label class="check"><input type="checkbox" name="remove_${e(name)}" value="1"> Remove</label>` : ''}</div></div></div>`;
}
function fSelect(name, label, value, options, help = '', attrs = '') {
  return `<label class="field"><span>${e(label)}</span>${help ? `<small>${help}</small>` : ''}<select name="${e(name)}"${attrs}>
    ${(Array.isArray(options) ? options : Object.entries(options)).map(([v, l]) => `<option value="${e(v)}"${String(value) === String(v) ? ' selected' : ''}>${e(l)}</option>`).join('')}</select></label>`;
}

/** Handle a file field: upload a new file, or mark for removal. Returns {value, trash[]} */
async function fileField(form, name, current, folder, kind = 'image') {
  const file = form.querySelector(`input[type=file][name="${name}"]`)?.files[0];
  if (file) {
    const prepared = kind === 'image' ? await resizeImage(file, folder === 'site' ? 2000 : 1800) : file;
    const path = await upload('media', folder, prepared);
    return { value: path, trash: current ? [current] : [] };
  }
  if (form.querySelector(`[name="remove_${name}"]`)?.checked) return { value: null, trash: current ? [current] : [] };
  return { value: current || null, trash: [] };
}
async function trash(paths, bucket = 'media') {
  const list = paths.filter(Boolean);
  if (list.length) await sb.storage.from(bucket).remove(list);
}

async function uniqueSlug(table, text, id) {
  const base = slugify(text);
  for (let i = 1; i < 200; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    let q = sb.from(table).select('id').eq('slug', slug);
    if (id) q = q.neq('id', id);
    const { data } = await q.limit(1);
    if (!data?.length) return slug;
  }
  return `${base}-${Date.now()}`;
}

const toLocalInput = (iso) => { const d = iso ? new Date(iso) : new Date(); const p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; };
const fromLocalInput = (v) => (v ? new Date(v) : new Date()).toISOString();
const statusBadge = (s, at) => {
  if (s === 'published' && at && new Date(at) > new Date()) return '<span class="badge badge-warn">Scheduled</span>';
  const m = { published: ['Live', 'ok'], draft: ['Draft', 'muted'], pending: ['To review', 'warn'], approved: ['Approved', 'ok'], rejected: ['Rejected', 'bad'] }[s] || [s, 'muted'];
  return `<span class="badge badge-${m[1]}">${e(m[0])}</span>`;
};
const INBOX = { question: 'Question of the week', voice: 'Voice message', topic: 'Topic suggestion', contact: 'Contact message' };

/** Submit a form with button state and error handling */
function onSubmit(form, handler) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = ev.submitter || form.querySelector('button');
    const action = btn?.value || 'save';
    form.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const label = btn?.innerHTML; if (btn) btn.textContent = 'Working…';
    try { await handler(action, new FormData(form)); }
    catch (err) { console.error(err); flash('error', errMsg(err)); }
    finally { form.querySelectorAll('button').forEach((b) => { b.disabled = false; }); if (btn && btn.isConnected) btn.innerHTML = label; }
  });
}
const v = (fd, k) => String(fd.get(k) ?? '').trim();

/* =========================================================
   Overview
   ========================================================= */
async function viewDashboard(_, main) {
  const cnt = (q) => q.then((r) => r.count || 0);
  const head = { count: 'exact', head: true };
  const [eps, drafts, guests, posts, pending, unread, pStories, inbox] = await Promise.all([
    cnt(sb.from('episodes').select('id', head).eq('status', 'published')),
    cnt(sb.from('episodes').select('id', head).eq('status', 'draft')),
    cnt(sb.from('guests').select('id', head)),
    cnt(sb.from('posts').select('id', head).eq('status', 'published')),
    cnt(sb.from('stories').select('id', head).eq('status', 'pending')),
    cnt(sb.from('submissions').select('id', head).eq('is_read', false)),
    sb.from('stories').select('id,title,name,created_at').eq('status', 'pending').order('created_at', { ascending: false }).limit(5).then(must),
    sb.from('submissions').select('id,type,name,subject,message,upload_path,is_read').order('created_at', { ascending: false }).limit(6).then(must),
  ]);
  main.innerHTML = `
  <header class="page-head"><div><h1>Hi ${e(S.host_name || 'Lamin')} 👋</h1><p class="muted">What would you like to do today?</p></div></header>
  <div class="quick">
    <a class="quick-btn primary" href="#/episode/new">${icon('play')}<span>New episode</span></a>
    <a class="quick-btn" href="#/guest/new">${icon('mic')}<span>New guest</span></a>
    <a class="quick-btn" href="#/post/new">${icon('quote')}<span>News post / photos</span></a>
    <a class="quick-btn" href="#/settings/getinvolved">${icon('headphones')}<span>Question of the week</span></a>
    <a class="quick-btn" href="#/settings/style">${icon('website')}<span>Colours & logo</span></a>
  </div>
  <div class="stats">
    <a href="#/episodes"><b>${eps}</b><span>${eps === 1 ? 'episode' : 'episodes'} live${drafts ? ` · ${drafts} draft` : ''}</span></a>
    <a href="#/guests"><b>${guests}</b><span>${guests === 1 ? 'guest' : 'guests'}</span></a>
    <a href="#/posts"><b>${posts}</b><span>${posts === 1 ? 'news post' : 'news posts'}</span></a>
    <a href="#/stories" class="${pending ? 'attn' : ''}"><b>${pending}</b><span>${pending === 1 ? 'story' : 'stories'} to review</span></a>
    <a href="#/inbox" class="${unread ? 'attn' : ''}"><b>${unread}</b><span>unread ${unread === 1 ? 'message' : 'messages'}</span></a>
  </div>
  <div class="cols">
    <section class="panel"><h2>Stories to review</h2>
      ${pStories.length ? `<ul class="list">${pStories.map((s) => `<li><a href="#/story/${s.id}"><strong>${e(s.title)}</strong><small>${e(s.name)} · ${fmtDate(s.created_at, true)}</small></a></li>`).join('')}</ul>` : '<p class="muted">All reviewed. 🎉</p>'}</section>
    <section class="panel"><h2>Latest submissions</h2>
      ${inbox.length ? `<ul class="list">${inbox.map((m) => `<li class="${m.is_read ? '' : 'unread'}"><a href="#/message/${m.id}"><strong>${e(INBOX[m.type])}${m.upload_path ? ' 🎙️' : ''}</strong><small>${e(m.name || 'Anonymous')} · ${e(excerpt(m.subject || m.message, 60))}</small></a></li>`).join('')}</ul>` : '<p class="muted">No submissions yet.</p>'}</section>
  </div>`;
}

/* =========================================================
   Episodes
   ========================================================= */
async function viewEpisodes(_, main) {
  const rows = await sb.from('episodes').select('id,title,number,status,published_at,categories(name)').order('published_at', { ascending: false }).then(must);
  main.innerHTML = `
  <header class="page-head"><h1>Episodes</h1><a class="btn" href="#/episode/new">+ New episode</a></header>
  <div class="filter"><input type="search" id="flt" placeholder="Search by title…"></div>
  ${rows.length ? `<table class="table"><thead><tr><th>#</th><th>Title</th><th>Category</th><th>Date</th><th>Status</th></tr></thead><tbody>
    ${rows.map((r) => `<tr data-t="${e(r.title.toLowerCase())}"><td class="num">${r.number ?? '–'}</td><td><a class="row-link" href="#/episode/${r.id}">${e(r.title)}</a></td><td>${e(r.categories?.name || '–')}</td><td>${fmtDate(r.published_at)}</td><td>${statusBadge(r.status, r.published_at)}</td></tr>`).join('')}
  </tbody></table>` : '<div class="panel empty">No episodes yet. <a href="#/episode/new">Add your first one.</a></div>'}`;
  main.querySelector('#flt').oninput = (ev) => { const q = ev.target.value.toLowerCase(); main.querySelectorAll('tr[data-t]').forEach((tr) => { tr.hidden = !tr.dataset.t.includes(q); }); };
}

async function viewEpisode(id, main) {
  const isNew = id === 'new' || !id;
  const [row, guests, cats, sel, maxNr] = await Promise.all([
    isNew ? null : sb.from('episodes').select('*').eq('id', id).single().then(must),
    sb.from('guests').select('id,name').order('name').then(must),
    sb.from('categories').select('*').order('sort').then(must),
    isNew ? (+PARAMS.get('guest') ? [+PARAMS.get('guest')] : []) : sb.from('episode_guests').select('guest_id').eq('episode_id', id).then(must).then((r) => r.map((x) => x.guest_id)),
    sb.from('episodes').select('number').order('number', { ascending: false, nullsFirst: false }).limit(1).then(must),
  ]);
  const r = row || { status: 'published', number: (maxNr[0]?.number || 0) + 1, season: 1 };   // episodes go live straight away
  const withGuest = isNew && sel.length ? guests.find((g) => g.id === sel[0]) : null;
  main.innerHTML = `
  <header class="page-head"><div><a class="back" href="#/episodes">← Episodes</a><h1>${isNew ? (withGuest ? `New episode with ${e(withGuest.name)}` : 'New episode') : 'Edit episode'}</h1></div>
    ${row?.status === 'published' ? `<a class="btn btn-ghost"  href="/episode/${e(row.slug)}">View on site →</a>` : ''}</header>
  <form class="edit-grid" id="f">
    <div class="stack">
      <section class="panel stack">
        ${fText('title', 'Title', r.title, { required: true, placeholder: 'e.g. Episode 12 — Doing business between two cultures' })}
        ${fArea('excerpt', 'Short summary', r.excerpt, { rows: 3, help: '1–3 sentences. Shown on the overview page, in Google and in the WhatsApp preview.' })}
        ${fArea('shownotes', 'Show notes', r.shownotes, { rows: 14, md: true, help: 'Topics, timestamps (e.g. <code>- 12:30 About family</code>), links and tips. ' + MD_HELP })}
      </section>
      <section class="panel stack"><h2>From Riverside (optional)</h2>
        ${fArea('transcript', 'Transcript', r.transcript, { rows: 8, help: 'In Riverside: open the recording → <b>Transcript</b> → copy everything and paste it here. Visitors can read along, Google finds the episode better, and the search on the site also searches what was said. Times like 12:30 become clickable.' })}
        ${fArea('clips', 'Highlights / clips', r.clips, { rows: 4, help: 'One link per line — for example your Riverside <b>Magic Clips</b> after posting them on YouTube Shorts, TikTok or Instagram. YouTube clips get a player on the page.' })}
      </section>
      <section class="panel stack"><h2>Audio or video</h2>
        ${fText('media_url', 'Link to the episode', r.media_url, { attrs: ' inputmode="url"', placeholder: 'https://open.spotify.com/episode/…', help: 'Paste a link from <b>Spotify, YouTube, Apple Podcasts or SoundCloud</b> — the player appears automatically. Recommended: it uses no storage.' })}
        <div class="field"><span>…or upload an audio file (MP3, max 50 MB)</span>
          ${r.audio ? `<audio controls src="${e(media(r.audio))}"></audio><label class="check"><input type="checkbox" name="remove_audio" value="1"> Remove audio file</label>` : ''}
          <input type="file" name="audio" accept="audio/*"><small>Note: this counts towards your storage (1 GB free). An uploaded file takes priority over the link.</small></div>
      </section>
    </div>
    <aside class="stack">
      <section class="panel stack">
        ${fSelect('status', 'Status', r.status, { published: 'Live (visible right away)', draft: 'Draft (only you can see it)' })}
        ${fText('published_at', 'Publish date', toLocalInput(r.published_at), { type: 'datetime-local', help: 'A date in the future = scheduled automatically.' })}
        <div class="row-2">${fText('number', 'Episode no.', r.number, { type: 'number' })}${fText('season', 'Season', r.season, { type: 'number' })}</div>
        ${fText('duration', 'Duration', r.duration, { placeholder: 'e.g. 52 min' })}
        ${fSelect('category_id', 'Category', r.category_id ?? '', [['', '— none —'], ...cats.map((c) => [c.id, c.name])])}
        <small><a href="#/categories">Manage categories</a></small>
      </section>
      <section class="panel stack">${fImage('cover', 'Cover image', r.cover, 'Square works best (e.g. 1400×1400).')}</section>
      <section class="panel stack"><div class="field"><span>Guests in this episode</span>
        ${guests.length ? `<div class="checks">${guests.map((g) => `<label class="check"><input type="checkbox" name="guests" value="${g.id}"${sel.includes(g.id) ? ' checked' : ''}> ${e(g.name)}</label>`).join('')}</div>` : '<small>No guests yet.</small>'}
        <small><a href="#/guest/new">+ Add a new guest</a> (save this episode first)</small></div></section>
      ${row ? `<section class="panel stack">${fText('slug', 'Web address', row.slug, { help: '/episode/<b>…</b>' })}</section>` : ''}
      <div class="actions"><button class="btn" value="save">Save</button>${row ? '<button class="btn btn-danger" value="delete" data-confirm="Delete this episode permanently?">Delete</button>' : ''}</div>
    </aside>
  </form>`;

  onSubmit(main.querySelector('#f'), async (action, fd) => {
    const form = main.querySelector('#f');
    if (action === 'delete') {
      must(await sb.from('episodes').delete().eq('id', row.id));
      await trash([row.cover, row.audio]);
      if (backToSite('Episode deleted.', afterDelete(`/episode/${row.slug}`, '/episodes'))) return;
      return go('#/episodes', ['ok', 'Episode deleted.']);
    }
    const audioFile = form.querySelector('input[name=audio]').files[0];
    if (audioFile && audioFile.size > 50 * 1024 * 1024) throw new Error('The audio file is larger than 50 MB. Please use a Spotify or YouTube link instead.');
    const cover = await fileField(form, 'cover', row?.cover, 'covers');
    const audio = await fileField(form, 'audio', row?.audio, 'audio', 'audio');
    const data = {
      title: v(fd, 'title'),
      slug: await uniqueSlug('episodes', v(fd, 'slug') || v(fd, 'title'), row?.id),
      excerpt: v(fd, 'excerpt'), shownotes: v(fd, 'shownotes'),
      transcript: String(fd.get('transcript') ?? '').trim(), clips: v(fd, 'clips'),
      media_url: validUrl(v(fd, 'media_url')), duration: v(fd, 'duration'),
      number: v(fd, 'number') ? +v(fd, 'number') : null, season: v(fd, 'season') ? +v(fd, 'season') : null,
      category_id: v(fd, 'category_id') ? +v(fd, 'category_id') : null,
      status: v(fd, 'status') === 'published' ? 'published' : 'draft',
      published_at: fromLocalInput(v(fd, 'published_at')),
      cover: cover.value, audio: audio.value, updated_at: new Date().toISOString(),
    };
    const saved = row
      ? must(await sb.from('episodes').update(data).eq('id', row.id).select('id,slug').single())
      : must(await sb.from('episodes').insert(data).select('id,slug').single());
    must(await sb.from('episode_guests').delete().eq('episode_id', saved.id));
    const gs = fd.getAll('guests').map((g) => ({ episode_id: saved.id, guest_id: +g }));
    if (gs.length) must(await sb.from('episode_guests').insert(gs));
    await trash([...cover.trash, ...audio.trash]);
    const epMsg = data.status === 'draft' ? 'Saved as draft — not visible on the site yet.' : (new Date(data.published_at) > new Date() ? 'Saved — it will go live on the publish date.' : 'Saved — the episode is live on the site.');
    if (backToSite(epMsg, isLive(data) ? `/episode/${saved.slug}` : '')) return;
    go(`#/episode/${saved.id}`, ['ok', epMsg]);
  });
}

/* =========================================================
   Guests
   ========================================================= */
async function viewGuests(_, main) {
  const [rows, links] = await Promise.all([sb.from('guests').select('*').order('name').then(must), sb.from('episode_guests').select('guest_id').then(must)]);
  const n = {}; links.forEach((l) => { n[l.guest_id] = (n[l.guest_id] || 0) + 1; });
  main.innerHTML = `<header class="page-head"><h1>Guests</h1><a class="btn" href="#/guest/new">+ New guest</a></header>
  ${rows.length ? `<div class="tiles">${rows.map((g) => `<a class="tile" href="#/guest/${g.id}">
    ${g.photo ? `<img src="${e(media(g.photo))}" alt="">` : `<span class="avatar">${e(g.name[0] || '?')}</span>`}
    <strong>${e(g.name)}</strong><small>${e(g.tagline || '—')}</small><small>${n[g.id] || 0} episode(s)</small></a>`).join('')}</div>` : '<div class="panel empty">No guests yet.</div>'}`;
}

const GUEST_SOC = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', facebook: 'Facebook', x: 'X', linkedin: 'LinkedIn', website: 'Website' };

async function viewGuest(id, main) {
  const isNew = id === 'new' || !id;
  const [row, eps, sel] = await Promise.all([
    isNew ? null : sb.from('guests').select('*').eq('id', id).single().then(must),
    sb.from('episodes').select('id,title,number').order('published_at', { ascending: false }).then(must),
    isNew ? [] : sb.from('episode_guests').select('episode_id').eq('guest_id', id).then(must).then((r) => r.map((x) => x.episode_id)),
  ]);
  const r = row || {};
  main.innerHTML = `
  <header class="page-head"><div><a class="back" href="#/guests">← Guests</a><h1>${isNew ? 'New guest' : 'Edit guest'}</h1></div>
    ${row ? `<div class="btn-row-admin"><a class="btn" href="#/episode/new?guest=${row.id}">➕ Create an episode with ${e(row.name)}</a><a class="btn btn-ghost" href="/guest/${e(row.slug)}">View guest page →</a></div>` : ''}</header>
  <form class="edit-grid" id="f">
    <div class="stack">
      <section class="panel stack">
        ${fText('name', 'Name', r.name, { required: true })}
        ${fText('tagline', 'Who is the guest? (one line)', r.tagline, { placeholder: 'e.g. Entrepreneur from Banjul, founder of …' })}
        ${fArea('bio', 'Bio', r.bio, { rows: 10, md: true, help: MD_HELP })}
      </section>
      <section class="panel stack"><h2>Guest's social media</h2><p class="muted small">Paste the full link to the profile. Empty fields are not shown.</p>
        <div class="row-2">${Object.entries(GUEST_SOC).map(([k, l]) => fText(k, l, r[k], { placeholder: 'https://…', attrs: ' inputmode="url"' })).join('')}</div></section>
    </div>
    <aside class="stack">
      <section class="panel stack">${fImage('photo', 'Photo', r.photo, 'Square, face in the middle.')}</section>
      <section class="panel stack"><div class="field"><span>Appears in</span>
        ${eps.length ? `<div class="checks">${eps.map((ep) => `<label class="check"><input type="checkbox" name="episodes" value="${ep.id}"${sel.includes(ep.id) ? ' checked' : ''}> ${ep.number ? '#' + ep.number + ' ' : ''}${e(ep.title)}</label>`).join('')}</div>` : '<small>No episodes yet.</small>'}</div></section>
      ${row ? `<section class="panel stack">${fText('slug', 'Web address', row.slug, { help: '/guest/<b>…</b>' })}</section>` : ''}
      <div class="actions"><button class="btn" value="save">Save</button>${row ? '<button class="btn btn-danger" value="delete" data-confirm="Delete this guest?">Delete</button>' : ''}</div>
    </aside>
  </form>`;
  onSubmit(main.querySelector('#f'), async (action, fd) => {
    const form = main.querySelector('#f');
    if (action === 'delete') {
      must(await sb.from('guests').delete().eq('id', row.id));
      await trash([row.photo]);
      if (backToSite('Guest deleted.', afterDelete(`/guest/${row.slug}`, '/guests'))) return;
      return go('#/guests', ['ok', 'Guest deleted.']);
    }
    const photo = await fileField(form, 'photo', row?.photo, 'guests');
    const data = { name: v(fd, 'name'), slug: await uniqueSlug('guests', v(fd, 'slug') || v(fd, 'name'), row?.id), tagline: v(fd, 'tagline'), bio: v(fd, 'bio'), photo: photo.value };
    for (const k of Object.keys(GUEST_SOC)) data[k] = validUrl(v(fd, k));
    const saved = row
      ? must(await sb.from('guests').update(data).eq('id', row.id).select('id,slug').single())
      : must(await sb.from('guests').insert(data).select('id,slug').single());
    must(await sb.from('episode_guests').delete().eq('guest_id', saved.id));
    const links = fd.getAll('episodes').map((x) => ({ episode_id: +x, guest_id: saved.id }));
    if (links.length) must(await sb.from('episode_guests').insert(links));
    await trash(photo.trash);
    if (backToSite('Guest saved.', `/guest/${saved.slug}`)) return;
    go(`#/guest/${saved.id}`, ['ok', row ? 'Guest saved.' : 'Guest saved. Now you can create an episode with this guest (button at the top).']);
  });
}

/* =========================================================
   Categories
   ========================================================= */
async function viewCategories(_, main) {
  const [rows, eps] = await Promise.all([sb.from('categories').select('*').order('sort').order('name').then(must), sb.from('episodes').select('category_id').then(must)]);
  const n = {}; eps.forEach((x) => { if (x.category_id) n[x.category_id] = (n[x.category_id] || 0) + 1; });
  main.innerHTML = `
  <header class="page-head"><div><h1>Categories</h1><p class="muted">Listeners can use these to filter episodes. Change them whenever you know which direction the podcast is going.</p></div></header>
  <div class="cols">
    <section class="panel"><form class="stack" id="f">
      <table class="table"><thead><tr><th>Name</th><th style="width:90px">Order</th><th style="width:110px">Episodes</th><th></th></tr></thead><tbody>
      ${rows.map((c) => `<tr><td><input name="name_${c.id}" value="${e(c.name)}"></td><td><input type="number" name="sort_${c.id}" value="${c.sort}"></td><td class="num">${n[c.id] || 0}</td>
        <td><button class="link-danger" value="del_${c.id}" data-confirm="Delete category '${e(c.name)}'?">Delete</button></td></tr>`).join('')}
      </tbody></table><div><button class="btn" value="save">Save changes</button></div></form></section>
    <section class="panel"><h2>New category</h2><form class="stack" id="add">
      <label class="field"><span>Name</span><input name="name" required placeholder="e.g. Music & Art"></label><div><button class="btn">Add</button></div></form></section>
  </div>`;
  onSubmit(main.querySelector('#f'), async (action, fd) => {
    if (action.startsWith('del_')) {
      must(await sb.from('categories').delete().eq('id', +action.slice(4)));
      return go('#/categories', ['ok', 'Category deleted. Episodes in it now have no category.']);
    }
    for (const c of rows) {
      const name = v(fd, 'name_' + c.id);
      if (!name) continue;
      must(await sb.from('categories').update({ name, slug: await uniqueSlug('categories', name, c.id), sort: +v(fd, 'sort_' + c.id) || 0 }).eq('id', c.id));
    }
    go('#/categories', ['ok', 'Categories saved.']);
  });
  onSubmit(main.querySelector('#add'), async (_, fd) => {
    const name = v(fd, 'name');
    must(await sb.from('categories').insert({ name, slug: await uniqueSlug('categories', name), sort: rows.length ? Math.max(...rows.map((r) => r.sort)) + 1 : 0 }));
    go('#/categories', ['ok', 'Category added.']);
  });
}

/* =========================================================
   News
   ========================================================= */
async function viewPosts(_, main) {
  const rows = await sb.from('posts').select('id,title,type,status,published_at').order('published_at', { ascending: false }).then(must);
  main.innerHTML = `<header class="page-head"><div><h1>News & updates</h1><p class="muted">News, updates, guest announcements and photo series.</p></div><a class="btn" href="#/post/new">+ New post</a></header>
  ${rows.length ? `<table class="table"><thead><tr><th>Title</th><th>Type</th><th>Date</th><th>Status</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><a class="row-link" href="#/post/${r.id}">${e(r.title)}</a></td><td>${e(POST_TYPES[r.type])}</td><td>${fmtDate(r.published_at)}</td><td>${statusBadge(r.status, r.published_at)}</td></tr>`).join('')}</tbody></table>` : '<div class="panel empty">No posts yet.</div>'}`;
}

async function viewPost(id, main) {
  const isNew = id === 'new' || !id;
  const [row, imgs, eps] = await Promise.all([
    isNew ? null : sb.from('posts').select('*').eq('id', id).single().then(must),
    isNew ? [] : sb.from('post_images').select('*').eq('post_id', id).order('sort').order('id').then(must),
    sb.from('episodes').select('id,title,number').order('published_at', { ascending: false }).then(must),
  ]);
  const r = row || { type: 'nieuws', status: 'published' };   // news goes live straight away
  main.innerHTML = `
  <header class="page-head"><div><a class="back" href="#/posts">← News</a><h1>${isNew ? 'New post' : 'Edit post'}</h1></div>
    ${row?.status === 'published' ? `<a class="btn btn-ghost"  href="/news/${e(row.slug)}">View on site →</a>` : ''}</header>
  <form class="edit-grid" id="f">
    <div class="stack">
      <section class="panel stack">${fText('title', 'Title', r.title, { required: true })}${fArea('excerpt', 'Short intro', r.excerpt, { rows: 2 })}${fArea('body', 'Text', r.body, { rows: 14, md: true, help: MD_HELP })}</section>
      <section class="panel stack"><h2>Link (optional)</h2>
        ${fSelect('episode_id', 'Link to an episode', r.episode_id ?? '', [['', '— no episode —'], ...eps.map((ep) => [ep.id, (ep.number ? '#' + ep.number + ' ' : '') + ep.title])], 'Shows a "Listen to the episode" button under the post.')}
        ${fText('link_url', 'Link to another page', r.link_url, { attrs: ' inputmode="url"', placeholder: 'https://www.facebook.com/…', help: 'For example a Facebook or Instagram post, a YouTube video or a Spotify episode. YouTube and Spotify links get a player.' })}
        ${fText('link_label', 'Button text (optional)', r.link_label, { placeholder: 'e.g. See the photos on Facebook' })}
      </section>
      <section class="panel stack"><h2>Photo gallery</h2>
        ${imgs.length ? `<div class="gallery-admin">${imgs.map((im) => `<div class="g-item"><img src="${e(media(im.file))}" alt=""><input name="cap_${im.id}" value="${e(im.caption)}" placeholder="Caption"><label class="check"><input type="checkbox" name="rm_img" value="${im.id}"> Remove</label></div>`).join('')}</div>` : ''}
        <label class="field"><span>Add photos</span><small>You can select several photos at once. They are resized automatically.</small><input type="file" name="gallery" accept="image/*" multiple></label>
      </section>
    </div>
    <aside class="stack">
      <section class="panel stack">
        ${fSelect('type', 'Post type', r.type, POST_TYPES)}
        ${fSelect('status', 'Status', r.status, { published: 'Live (visible right away)', draft: 'Draft (only you can see it)' })}
        ${fText('published_at', 'Publish date', toLocalInput(r.published_at), { type: 'datetime-local', help: 'Leave as is to publish now. A date in the future = scheduled.' })}
      </section>
      <section class="panel stack">${fImage('image', 'Main image', r.image)}</section>
      ${row ? `<section class="panel stack">${fText('slug', 'Web address', row.slug, { help: '/news/<b>…</b>' })}</section>` : ''}
      <div class="actions"><button class="btn" value="save">Save</button>${row ? '<button class="btn btn-danger" value="delete" data-confirm="Delete this post?">Delete</button>' : ''}</div>
    </aside>
  </form>`;
  onSubmit(main.querySelector('#f'), async (action, fd) => {
    const form = main.querySelector('#f');
    if (action === 'delete') {
      must(await sb.from('posts').delete().eq('id', row.id));
      await trash([row.image, ...imgs.map((i) => i.file)]);
      if (backToSite('Post deleted.', afterDelete(`/news/${row.slug}`, '/news'))) return;
      return go('#/posts', ['ok', 'Post deleted.']);
    }
    const image = await fileField(form, 'image', row?.image, 'news');
    const data = {
      title: v(fd, 'title'), slug: await uniqueSlug('posts', v(fd, 'slug') || v(fd, 'title'), row?.id),
      type: POST_TYPES[v(fd, 'type')] ? v(fd, 'type') : 'nieuws', excerpt: v(fd, 'excerpt'), body: v(fd, 'body'),
      status: v(fd, 'status') === 'draft' ? 'draft' : 'published', published_at: fromLocalInput(v(fd, 'published_at')), image: image.value,
      episode_id: v(fd, 'episode_id') ? +v(fd, 'episode_id') : null, link_url: validUrl(v(fd, 'link_url')), link_label: v(fd, 'link_label'),
    };
    const saved = row
      ? must(await sb.from('posts').update(data).eq('id', row.id).select('id,slug').single())
      : must(await sb.from('posts').insert(data).select('id,slug').single());
    const rm = fd.getAll('rm_img').map(Number);
    for (const im of imgs) {
      if (rm.includes(im.id)) { must(await sb.from('post_images').delete().eq('id', im.id)); await trash([im.file]); }
      else if (v(fd, 'cap_' + im.id) !== im.caption) must(await sb.from('post_images').update({ caption: v(fd, 'cap_' + im.id) }).eq('id', im.id));
    }
    const files = [...form.querySelector('input[name=gallery]').files];
    let sort = imgs.length ? Math.max(...imgs.map((i) => i.sort)) + 1 : 0;
    const failed = [];
    for (const f of files) {
      try { const path = await upload('media', 'news', await resizeImage(f)); must(await sb.from('post_images').insert({ post_id: saved.id, file: path, sort: sort++ })); }
      catch (err) { failed.push(`${f.name}: ${errMsg(err)}`); }
    }
    await trash(image.trash);
    if (!failed.length && backToSite(data.status === 'draft' ? 'Saved as draft — not visible on the site yet.' : 'Saved — the post is live on the site.', isLive(data) ? `/news/${saved.slug}` : '')) return;
    go(`#/post/${saved.id}`, failed.length ? ['error', 'Saved, but not all photos could be uploaded: ' + failed.join(' · ')] : ['ok', data.status === 'draft' ? 'Saved as draft — not visible on the site yet.' : (new Date(data.published_at) > new Date() ? 'Saved — it will go live on the publish date.' : 'Saved — the post is live on the site.')]);
  });
}

/* =========================================================
   Community stories
   ========================================================= */
async function viewStories(status, main) {
  status = ['pending', 'approved', 'rejected'].includes(status) ? status : 'pending';
  const head = { count: 'exact', head: true };
  const [rows, ...counts] = await Promise.all([
    sb.from('stories').select('*').eq('status', status).order('created_at', { ascending: false }).then(must),
    ...['pending', 'approved', 'rejected'].map((s) => sb.from('stories').select('id', head).eq('status', s).then((r) => r.count || 0)),
  ]);
  const signed = await signedMap(rows.filter((s) => !s.photo && s.upload_path).map((s) => s.upload_path));
  const labels = { pending: 'To review', approved: 'Approved', rejected: 'Rejected' };
  main.innerHTML = `
  <header class="page-head"><div><h1>Community stories</h1><p class="muted">Submitted stories only appear on the site after you approve them.</p></div></header>
  <nav class="tabs">${Object.entries(labels).map(([k, l], i) => `<a href="#/stories/${k}"${status === k ? ' aria-current="page"' : ''}>${l} <b>${counts[i]}</b></a>`).join('')}</nav>
  ${rows.length ? `<div class="story-list">${rows.map((s) => {
    const src = s.photo ? media(s.photo) : signed[s.upload_path];
    return `<a class="story-row panel" href="#/story/${s.id}">${src ? `<img src="${e(src)}" alt="">` : '<span class="noimg">no photo</span>'}
      <div><strong>${e(s.title)}</strong><small>${e(s.name)}${s.location ? ' · ' + e(s.location) : ''} · ${fmtDate(s.created_at, true)}</small><p>${e(excerpt(s.body, 180))}</p></div>
      <span class="btn btn-ghost btn-sm">${status === 'pending' ? 'Review' : 'View'}</span></a>`;
  }).join('')}</div>` : `<div class="panel empty">${status === 'pending' ? 'No new stories to review.' : 'Nothing here yet.'}</div>`}`;
}

async function signedMap(paths) {
  if (!paths.length) return {};
  const { data } = await sb.storage.from('inbox').createSignedUrls(paths, 3600);
  return Object.fromEntries((data || []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
}

/** Copy a private submission to the public folder (only on approval) */
async function publishFromInbox(path, folder) {
  const { data: blob, error } = await sb.storage.from('inbox').download(path);
  if (error) throw error;
  const ext = path.split('.').pop();
  const type = blob.type && blob.type !== 'application/octet-stream' ? blob.type : (folder === 'stories' ? 'image/jpeg' : 'audio/webm');
  return upload('media', folder, new File([blob], 'file.' + ext, { type }));
}

async function viewStory(id, main) {
  const row = await sb.from('stories').select('*').eq('id', id).single().then(must);
  const contact = (await sb.from('private_contacts').select('email').eq('kind', 'story').eq('ref_id', id).maybeSingle()).data;
  const orig = !row.photo && row.upload_path ? (await signedMap([row.upload_path]))[row.upload_path] : null;
  main.innerHTML = `
  <header class="page-head"><div><a class="back" href="#/stories/${row.status}">← Community stories</a><h1>Review story</h1></div>
    <div>${statusBadge(row.status)} ${row.status === 'approved' ? `<a class="btn btn-ghost btn-sm"  href="/community/${row.id}">View on site →</a>` : ''}</div></header>
  <form class="edit-grid" id="f">
    <div class="stack"><section class="panel stack">
      <p class="muted small">Submitted on ${fmtDate(row.created_at, true)}${contact ? ` · <a href="mailto:${e(contact.email)}">${e(contact.email)}</a> (not shown on the site)` : ''}. You can edit the text (e.g. typos) before approving.</p>
      <div class="row-2">${fText('name', 'Name', row.name, { required: true })}${fText('location', 'City / country', row.location)}</div>
      ${fText('title', 'Title', row.title, { required: true })}
      ${fArea('body', 'Story', row.body, { rows: 16, required: true })}
      ${fArea('admin_note', 'Private note (only for you)', row.admin_note, { rows: 2 })}
    </section></div>
    <aside class="stack">
      <section class="panel stack">${fImage('photo', 'Photo', row.photo || row.upload_path, row.photo ? '' : (row.upload_path ? 'Submitted photo — only becomes public when you approve.' : ''), orig)}</section>
      <section class="panel stack decision"><h2>Decision</h2>
        ${row.status !== 'approved' ? '<button class="btn btn-ok" value="approve">✓ Approve & publish</button>' : ''}
        ${row.status !== 'rejected' ? '<button class="btn btn-ghost" value="reject">✕ Reject</button>' : ''}
        ${row.status !== 'pending' ? `<button class="btn btn-ghost" value="pending">Back to 'to review'</button>` : ''}
        <button class="btn btn-ghost" value="save">Save only</button>
        <button class="btn btn-danger" value="delete" data-confirm="Delete this story and photo permanently?">Delete</button>
      </section>
    </aside>
  </form>`;
  onSubmit(main.querySelector('#f'), async (action, fd) => {
    const form = main.querySelector('#f');
    if (action === 'delete') {
      must(await sb.from('stories').delete().eq('id', row.id));
      await sb.from('private_contacts').delete().eq('kind', 'story').eq('ref_id', row.id);
      await trash([row.photo]); await trash([row.upload_path], 'inbox');
      if (backToSite('Story deleted.', afterDelete(`/community/${row.id}`, '/community'))) return;
      return go('#/stories/' + row.status, ['ok', 'Story deleted.']);
    }
    const data = { name: v(fd, 'name'), location: v(fd, 'location'), title: v(fd, 'title'), body: v(fd, 'body'), admin_note: v(fd, 'admin_note') };
    const newFile = form.querySelector('input[name=photo]').files[0];
    const removing = form.querySelector('[name=remove_photo]')?.checked;
    const trashMedia = [], trashInbox = [];
    if (newFile) {
      data.photo = await upload('media', 'stories', await resizeImage(newFile));
      if (row.photo) trashMedia.push(row.photo);
    } else if (removing) {
      data.photo = null; if (row.photo) trashMedia.push(row.photo);
      if (row.upload_path) { trashInbox.push(row.upload_path); data.upload_path = null; }
    }
    if (action === 'approve') {
      data.status = 'approved'; data.approved_at = row.approved_at || new Date().toISOString();
      if (!newFile && !removing && !row.photo && row.upload_path) data.photo = await publishFromInbox(row.upload_path, 'stories');
    }
    if (action === 'reject' || action === 'pending') {
      data.status = action === 'reject' ? 'rejected' : 'pending';
      // Remove the public copy; the original stays private in case you approve it later
      if (!newFile && row.photo && row.upload_path) { trashMedia.push(row.photo); data.photo = null; }
    }
    must(await sb.from('stories').update(data).eq('id', row.id));
    await trash(trashMedia); await trash(trashInbox, 'inbox');
    const msg = { approve: 'Approved — the story is now live.', reject: 'Rejected — the story is not visible.', pending: "Moved back to 'to review'.", save: 'Saved.' }[action];
    const nowStatus = data.status || row.status;
    if (backToSite(msg, nowStatus === 'approved' ? `/community/${row.id}` : afterDelete(`/community/${row.id}`, '/community'))) return;
    go(action === 'save' ? `#/story/${row.id}` : `#/stories/${row.status === 'pending' ? 'pending' : row.status}`, ['ok', msg]);
  });
}

/* =========================================================
   Inbox
   ========================================================= */
async function viewInbox(type, main) {
  type = INBOX[type] ? type : '';
  let q = sb.from('submissions').select('*').order('is_read').order('created_at', { ascending: false });
  if (type) q = q.eq('type', type);
  const [rows, unread] = await Promise.all([q.then(must), sb.from('submissions').select('type').eq('is_read', false).then(must)]);
  const n = {}; unread.forEach((r) => { n[r.type] = (n[r.type] || 0) + 1; });
  main.innerHTML = `
  <header class="page-head"><div><h1>Inbox</h1><p class="muted">Answers, voice messages, topic suggestions and contact messages.</p></div></header>
  <nav class="tabs"><a href="#/inbox"${!type ? ' aria-current="page"' : ''}>All</a>${Object.entries(INBOX).map(([k, l]) => `<a href="#/inbox/${k}"${type === k ? ' aria-current="page"' : ''}>${l}${n[k] ? ` <b>${n[k]}</b>` : ''}</a>`).join('')}</nav>
  ${rows.length ? `<table class="table inbox"><thead><tr><th>Type</th><th>From</th><th>Message</th><th>Date</th><th></th></tr></thead><tbody>
    ${rows.map((m) => `<tr class="${m.is_read ? '' : 'unread'}"><td>${e(INBOX[m.type])}</td><td>${e(m.name || 'Anonymous')}</td>
      <td><a class="row-link" href="#/message/${m.id}">${m.upload_path ? '🎙️ ' : ''}${e(excerpt(((m.subject ? m.subject + ' — ' : '') + m.message).trim() || 'Audio message', 80))}</a></td>
      <td class="nowrap">${fmtDate(m.created_at)}</td><td>${m.is_public ? '<span class="badge badge-ok">On site</span>' : ''}</td></tr>`).join('')}
  </tbody></table>` : '<div class="panel empty">No messages.</div>'}`;
}

async function viewMessage(id, main) {
  const row = await sb.from('submissions').select('*').eq('id', id).single().then(must);
  const contact = (await sb.from('private_contacts').select('email').eq('kind', 'submission').eq('ref_id', id).maybeSingle()).data;
  if (!row.is_read) await sb.from('submissions').update({ is_read: true }).eq('id', id);
  const audioUrl = row.upload_path ? (await signedMap([row.upload_path]))[row.upload_path] : null;
  const mailto = contact ? `mailto:${contact.email}?subject=${encodeURIComponent('Re: ' + (row.subject || 'Joe Point Podcast'))}` : '';
  main.innerHTML = `
  <header class="page-head"><div><a class="back" href="#/inbox">← Inbox</a><h1>${e(INBOX[row.type])}</h1></div></header>
  <div class="edit-grid">
    <section class="panel stack">
      <dl class="dl"><dt>From</dt><dd>${e(row.name || 'Anonymous')}</dd>
        ${contact ? `<dt>Email</dt><dd><a href="${e(mailto)}">${e(contact.email)}</a></dd>` : ''}
        <dt>Received</dt><dd>${fmtDate(row.created_at, true)}</dd>
        ${row.question ? `<dt>Question</dt><dd>${e(row.question)}</dd>` : ''}
        ${row.subject ? `<dt>Subject</dt><dd><strong>${e(row.subject)}</strong></dd>` : ''}</dl>
      ${row.message ? `<div class="message-body">${e(row.message).replace(/\n/g, '<br>')}</div>` : ''}
      ${audioUrl ? `<audio controls src="${e(audioUrl)}"></audio><a class="small" href="${e(audioUrl)}" download>Download audio file (for your edit)</a>` : ''}
    </section>
    <aside class="stack"><form class="panel stack" id="f">
      ${contact ? `<a class="btn" href="${e(mailto)}">Reply by email</a>` : ''}
      ${['question', 'voice'].includes(row.type) ? `<button class="btn btn-ghost" value="public">${row.is_public ? 'Hide from the site' : 'Show under "Listener responses"'}</button>
        <small class="muted">Currently <b>${row.is_public ? 'shown' : 'not shown'}</b> on the Get involved page.</small>` : ''}
      <button class="btn btn-ghost" value="unread">Mark as unread</button>
      <button class="btn btn-danger" value="delete" data-confirm="Delete this message?">Delete</button>
    </form></aside>
  </div>`;
  onSubmit(main.querySelector('#f'), async (action) => {
    if (action === 'delete') {
      must(await sb.from('submissions').delete().eq('id', row.id));
      await sb.from('private_contacts').delete().eq('kind', 'submission').eq('ref_id', row.id);
      await trash([row.public_audio]); await trash([row.upload_path], 'inbox');
      return go('#/inbox', ['ok', 'Message deleted.']);
    }
    if (action === 'unread') { must(await sb.from('submissions').update({ is_read: false }).eq('id', row.id)); return go('#/inbox'); }
    if (action === 'public') {
      if (!row.is_public) {
        const pub = row.upload_path && !row.public_audio ? await publishFromInbox(row.upload_path, 'voice') : row.public_audio;
        must(await sb.from('submissions').update({ is_public: true, public_audio: pub }).eq('id', row.id));
        return go(`#/message/${row.id}`, ['ok', 'Now shown on the Get involved page.']);
      }
      must(await sb.from('submissions').update({ is_public: false, public_audio: null }).eq('id', row.id));
      await trash([row.public_audio]);
      go(`#/message/${row.id}`, ['ok', 'Hidden from the site.']);
    }
  });
}

/* =========================================================
   Settings
   ========================================================= */
const TABS = { general: 'Homepage & general', style: 'Look & feel', host: 'About Lamin', social: 'Social media', contact: 'Contact', getinvolved: 'Get involved', credit: 'Website credit', account: 'Password' };

function settingsFields() {
  const soc = {};
  for (const [k, l] of Object.entries(NETWORKS)) {
    const main = ['facebook', 'instagram', 'youtube', 'tiktok'].includes(k);
    soc['social_' + k] = [l, k === 'whatsapp' ? 'text' : 'url', k === 'whatsapp' ? 'Phone number (e.g. +31612345678) or link'
      : `Paste the link to your ${l} page${k === 'facebook' ? ', e.g. https://www.facebook.com/joepointpodcast' : ''}. Empty = not shown on the site.${main ? ' Also shown as an icon at the top of the site.' : ''}`];
  }
  return {
    general: {
      site_title: ['Podcast name', 'text'],
      tagline: ['Tagline', 'text', 'Short line at the top of the homepage and in Google.'],
      intro_title: ['Intro title (homepage)', 'text'],
      intro_text: ['Introduction to the podcast', 'md'],
      hero_image: ['Big photo on the homepage', 'image', 'A portrait photo looks best (e.g. 1200×1500).'],
      footer_text: ['Text at the bottom of the site', 'text'],
    },
    style: {
      logo: ['Logo', 'image', 'A PNG with a transparent background works best. Also used as the icon in the browser tab.'],
      theme_mode: ['Theme', 'select', '', { dark: 'Dark', light: 'Light' }],
      color_bg: ['Background colour', 'color', 'Base of the whole site. Cards and borders are derived from it automatically.'],
      color_primary: ['Main colour', 'color', 'Buttons, links and the active menu item.'],
      color_accent: ['Accent colour', 'color', 'Labels, play buttons and highlights.'],
      color_accent2: ['Second accent', 'color', 'Small headings and details.'],
      font_display: ['Heading font', 'select', '', Object.fromEntries(Object.entries(FONTS).map(([k, f]) => [k, f[0]]))],
    },
    host: {
      host_name: ['Host name', 'text'],
      host_photo: ['Host photo (About page)', 'image'],
      host_intro: ['Short introduction (1 sentence)', 'text'],
      host_bio: ['Who is Lamin?', 'md'], host_why: ['Why this podcast?', 'md'],
      host_background: ['Background', 'md'], host_mission: ['Mission', 'md'],
    },
    social: soc,
    contact: { contact_email: ['Email address (shown on the contact page)', 'email'], contact_intro: ['Contact page text', 'text'] },
    credit: {
      credit_name: ['Website made by', 'text', 'Shown at the bottom of every page, e.g. "Website by Monique". Leave empty to hide.'],
      credit_whatsapp: ['WhatsApp number of the website builder', 'text', 'Full number with country code, e.g. +31612345678. Visitors who want a website can send a WhatsApp message. Leave empty to hide the button.'],
    },
    getinvolved: {
      question_active: ['Show the question of the week', 'check'],
      question_of_week: ['Question of the week', 'text', 'New question? Change it here. Answers in the inbox remember which question they belong to.'],
      stories_intro: ['Community stories introduction', 'area'],
    },
  };
}

async function viewSettings(tab, main) {
  tab = TABS[tab] ? tab : 'general';
  await loadSettings();
  const head = `<header class="page-head"><h1>Settings</h1><a class="btn btn-ghost" href="/">View website →</a></header>
    <nav class="tabs">${Object.entries(TABS).map(([k, l]) => `<a href="#/settings/${k}"${tab === k ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;

  if (tab === 'account') {
    const { data } = await sb.auth.getUser();
    main.innerHTML = head + `<form class="panel stack narrow-form" id="f">
      <p class="muted small">Logged in as <b>${e(data.user?.email)}</b>.</p>
      <label class="field"><span>New password (at least 10 characters)</span><input type="password" name="p1" required minlength="10" autocomplete="new-password"></label>
      <label class="field"><span>Repeat new password</span><input type="password" name="p2" required minlength="10" autocomplete="new-password"></label>
      <div><button class="btn">Change password</button></div></form>`;
    onSubmit(main.querySelector('#f'), async (_, fd) => {
      if (v(fd, 'p1') !== v(fd, 'p2')) throw new Error("The passwords don't match.");
      const { error } = await sb.auth.updateUser({ password: v(fd, 'p1') });
      if (error) throw error;
      go('#/settings/account', ['ok', 'Password changed.']);
    });
    return;
  }

  const fields = settingsFields()[tab];
  const t = theme(S);
  const cur = (k) => (tab === 'style' && t[k] !== undefined ? t[k] : S[k] ?? '');
  const html = Object.entries(fields).map(([k, [label, type, help = '', opts]]) => {
    const val = cur(k);
    switch (type) {
      case 'image': return fImage(k, label, val, e(help));
      case 'md': return fArea(k, label, val, { rows: 7, md: true, help: (help ? e(help) + '<br>' : '') + MD_HELP });
      case 'area': return fArea(k, label, val, { rows: 4, help: e(help) });
      case 'check': return `<label class="check big"><input type="checkbox" name="${k}" value="1"${val === '1' ? ' checked' : ''}> ${e(label)}</label>`;
      case 'color': return `<label class="field color-field"><span>${e(label)}</span>${help ? `<small>${e(help)}</small>` : ''}<span class="color-row"><input type="color" name="${k}" value="${e(val)}" data-theme="${k}"><code>${e(val)}</code></span></label>`;
      case 'select': return fSelect(k, label, val, opts, e(help), ` data-theme="${k}"`);
      default: return fText(k, label, val, { type: type === 'email' ? 'email' : 'text', help: e(help), placeholder: type === 'url' ? 'https://…' : '', attrs: type === 'url' ? ' inputmode="url"' : '' });
    }
  }).join('');

  const presets = tab === 'style' ? `<div class="field"><span>Quick styles</span>
    <small>Click a style to fill in the colours and font. You can still fine-tune everything afterwards. It only goes live after <b>Save</b>.</small>
    <div class="presets">${Object.entries(PRESETS).map(([k, [label, vals]]) => `<button type="button" class="preset" data-preset='${e(JSON.stringify(vals))}'>
      <span class="sw" style="background:${e(vals.color_bg)}"><i style="background:${e(vals.color_primary)}"></i><i style="background:${e(vals.color_accent)}"></i><i style="background:${e(vals.color_accent2)}"></i></span>${e(label)}</button>`).join('')}</div></div>` : '';

  const preview = tab === 'style' ? `<aside class="panel preview-panel"><h2>Preview</h2>
    <div class="mini" id="mini"><div class="mini-head"><b>Joe Point</b><span>Episodes</span><span class="mini-active">About</span></div>
      <div class="mini-body"><small class="mini-eyebrow">New episode</small><div class="mini-h">Welcome to Joe Point</div><p>Real stories. Open conversations.</p>
      <span class="mini-btn">▶ Listen now</span> <span class="mini-ghost">About Lamin</span>
      <div class="mini-card"><span class="mini-tag">Gambia & Diaspora</span><b>Episode 1</b><small>45 min</small></div></div></div>
    <p class="muted small">A rough sketch. After saving you'll see the real result on the site; text colours are adjusted automatically so everything stays readable.</p></aside>` : '';

  main.innerHTML = head + `<form id="f" class="${tab === 'style' ? 'style-grid' : ''}"><div class="panel stack">${presets}${html}<div><button class="btn">Save</button></div></div>${preview}</form>`;

  if (tab === 'style') setupStylePreview(main);

  onSubmit(main.querySelector('#f'), async (_, fd) => {
    const form = main.querySelector('#f');
    const rows = [], trashList = [];
    for (const [k, [, type, , opts]] of Object.entries(fields)) {
      let val;
      if (type === 'image') { const r = await fileField(form, k, S[k], 'site'); val = r.value || ''; trashList.push(...r.trash); }
      else if (type === 'check') val = fd.get(k) ? '1' : '0';
      else if (type === 'color') { val = v(fd, k).toLowerCase(); if (!/^#[0-9a-f]{6}$/.test(val)) continue; }
      else if (type === 'select') { val = v(fd, k); if (!(val in opts)) continue; }
      else if (type === 'url') val = validUrl(v(fd, k));
      else if (type === 'email') { val = v(fd, k); if (val && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) throw new Error('Invalid email address.'); }
      else val = v(fd, k);
      rows.push({ key: k, value: val });
    }
    must(await sb.from('settings').upsert(rows));
    await trash(trashList);
    if (backToSite('Saved.')) return;
    go(`#/settings/${tab}`, ['ok', 'Settings saved.']);
  });
}

function setupStylePreview(main) {
  const mini = main.querySelector('#mini');
  const get = (k) => main.querySelector(`[data-theme="${k}"]`);
  const update = () => {
    const dark = get('theme_mode').value === 'dark';
    let bg = get('color_bg').value;
    if (dark && lum(bg) > 0.2) bg = mix(bg, '#000000', 0.85);
    if (!dark && lum(bg) < 0.6) bg = mix(bg, '#ffffff', 0.9);
    const pr = get('color_primary').value;
    const st = mini.style;
    st.setProperty('--bg', bg);
    st.setProperty('--ink', dark ? '#f5efe6' : '#1d1a16');
    st.setProperty('--surface', dark ? mix(bg, '#ffffff', 0.07) : '#ffffff');
    st.setProperty('--line', dark ? mix(bg, '#ffffff', 0.14) : mix(bg, '#000000', 0.12));
    st.setProperty('--primary', pr);
    st.setProperty('--primary-ink', inkOn(pr));
    st.setProperty('--accent', get('color_accent').value);
    st.setProperty('--accent2', get('color_accent2').value);
    const f = get('font_display').value;
    st.setProperty('--display', FONTS[f]?.[2] || 'sans-serif');
    st.setProperty('--case', ['anton', 'oswald'].includes(f) ? 'uppercase' : 'none');
    main.querySelectorAll('.color-row').forEach((r) => { r.querySelector('code').textContent = r.querySelector('input').value; });
  };
  main.querySelectorAll('[data-theme]').forEach((i) => i.addEventListener('input', update));
  main.querySelectorAll('[data-preset]').forEach((b) => b.addEventListener('click', () => {
    const vals = JSON.parse(b.dataset.preset);
    for (const [k, val] of Object.entries(vals)) { const el = get(k); if (el) el.value = val; }
    main.querySelectorAll('.preset').forEach((p) => p.classList.toggle('on', p === b));
    dirty = true;
    update();
  }));
  update();
}

boot();
