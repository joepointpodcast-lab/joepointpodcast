// Joe Point Podcast — beheerscherm
import { SUPABASE_URL } from './config.js';
import {
  sb, e, excerpt, nlDate, media, slugify, validUrl, icon, resizeImage, upload, errMsg,
  NETWORKS, POST_TYPES, FONTS, PRESETS, theme, mix, lum, inkOn,
} from './lib.js';

const $app = document.getElementById('app');
let S = {};
let pendingFlash = null;
let dirty = false;

/* =========================================================
   Opstarten & inloggen
   ========================================================= */
async function boot() {
  if (SUPABASE_URL.includes('JOUW-PROJECT')) {
    return authScreen(`<h1>Nog niet gekoppeld</h1><p class="muted">Vul eerst de Supabase-gegevens in <code>assets/js/config.js</code> in (zie LEESMIJ.md).</p>`);
  }
  sb.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') showNewPassword();
    if (event === 'SIGNED_OUT') showLogin();
  });
  if (/type=recovery/.test(location.hash)) return; // afgehandeld door PASSWORD_RECOVERY
  const { data } = await sb.auth.getSession();
  if (!data.session) return showLogin();
  await enter();
}

async function enter() {
  const { data: ok, error } = await sb.rpc('is_admin');
  if (error || !ok) {
    authScreen(`<h1>Geen toegang</h1><p class="muted">Dit account heeft (nog) geen beheerrechten. Zet het e-mailadres in de tabel <code>admins</code> (zie LEESMIJ.md).</p><button class="btn" id="out">Uitloggen</button>`);
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
  $app.innerHTML = `<div class="auth-box"><div class="side-brand"><span>${icon('mic')}</span> Joe Point <small>beheer</small></div><div id="auth-flash"></div>${inner}</div>`;
}
const authFlash = (type, msg) => { document.getElementById('auth-flash').innerHTML = `<div class="flash flash-${type}">${e(msg)}</div>`; };

function showLogin() {
  window.removeEventListener('hashchange', route); enter.bound = false;
  authScreen(`<h1>Inloggen</h1>
    <form class="stack" id="login">
      <label class="field"><span>E-mailadres</span><input type="email" name="email" required autocomplete="username"></label>
      <label class="field"><span>Wachtwoord</span><input type="password" name="password" required autocomplete="current-password"></label>
      <button class="btn">Inloggen</button>
    </form>
    <p class="small"><a href="#" id="forgot">Wachtwoord vergeten?</a> · <a href="/">Naar de website</a></p>`);
  const f = document.getElementById('login');
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const btn = f.querySelector('button'); btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: f.email.value.trim(), password: f.password.value });
    btn.disabled = false;
    if (error) return authFlash('error', /invalid/i.test(error.message) ? 'E-mailadres of wachtwoord klopt niet.' : error.message);
    enter();
  };
  document.getElementById('forgot').onclick = async (ev) => {
    ev.preventDefault();
    const email = f.email.value.trim();
    if (!email) return authFlash('error', 'Vul eerst je e-mailadres in.');
    const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin + '/admin/' });
    authFlash(error ? 'error' : 'ok', error ? error.message : 'Check je mail: je krijgt een link om een nieuw wachtwoord te kiezen.');
  };
}

function showNewPassword() {
  authScreen(`<h1>Nieuw wachtwoord</h1>
    <form class="stack" id="np">
      <label class="field"><span>Nieuw wachtwoord (min. 10 tekens)</span><input type="password" name="p1" minlength="10" required autocomplete="new-password"></label>
      <label class="field"><span>Herhaal</span><input type="password" name="p2" minlength="10" required autocomplete="new-password"></label>
      <button class="btn">Opslaan</button></form>`);
  const f = document.getElementById('np');
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    if (f.p1.value !== f.p2.value) return authFlash('error', 'De wachtwoorden zijn niet gelijk.');
    const { error } = await sb.auth.updateUser({ password: f.p1.value });
    if (error) return authFlash('error', error.message);
    history.replaceState(null, '', '/admin/');
    pendingFlash = ['ok', 'Wachtwoord opgeslagen. Welkom terug!'];
    enter();
  };
}

/* =========================================================
   Router & layout
   ========================================================= */
const MENU = [
  ['dashboard', 'Overzicht', 'headphones', ['dashboard']],
  ['episodes', 'Afleveringen', 'play', ['episodes', 'episode']],
  ['guests', 'Gasten', 'mic', ['guests', 'guest']],
  ['categories', 'Categorieën', 'link', ['categories']],
  ['posts', 'Nieuws & updates', 'quote', ['posts', 'post']],
  ['stories', 'Community stories', 'pin', ['stories', 'story']],
  ['inbox', 'Inbox', 'mail', ['inbox', 'message']],
  ['settings', 'Instellingen', 'website', ['settings']],
];

const VIEWS = {
  dashboard: viewDashboard, episodes: viewEpisodes, episode: viewEpisode, guests: viewGuests, guest: viewGuest,
  categories: viewCategories, posts: viewPosts, post: viewPost, stories: viewStories, story: viewStory,
  inbox: viewInbox, message: viewMessage, settings: viewSettings,
};

async function route() {
  if (dirty && !confirm('Je hebt wijzigingen die nog niet zijn opgeslagen. Toch weggaan?')) {
    history.replaceState(null, '', route.last || '#/');
    return;
  }
  dirty = false;
  const [page = 'dashboard', arg = ''] = location.hash.replace(/^#\/?/, '').split('/');
  route.last = location.hash;
  const view = VIEWS[page] || viewDashboard;
  await shell(page);
  const main = document.getElementById('main');
  main.innerHTML = '<p class="muted">Laden…</p>';
  try { await view(arg, main); }
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
    <a class="side-brand" href="#/"><span>${icon('mic')}</span> Joe Point <small>beheer</small></a>
    <button class="side-toggle" aria-expanded="false" id="tog">${icon('menu')} Menu</button>
    <nav class="side-nav">${MENU.map(([k, l, ic, m]) => `<a href="#/${k}"${m.includes(page) ? ' aria-current="page"' : ''}>${icon(ic)} ${e(l)}${badge[k] ? `<b class="count">${badge[k]}</b>` : ''}</a>`).join('')}</nav>
    <div class="side-foot"><a href="/" target="_blank">Bekijk website ↗</a><a href="#" id="logout">Uitloggen</a></div>
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
   Hulpjes
   ========================================================= */
const must = (r) => { if (r.error) throw r.error; return r.data; };
const MD_HELP = 'Opmaak: <code>## Kop</code> · <code>- lijstje</code> · <code>**vet**</code> · <code>*schuin*</code> · <code>[tekst](https://link)</code>';

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
    <div class="img-row"><div class="img-preview">${url ? `<img src="${e(url)}" alt="">` : '<em>Geen afbeelding</em>'}</div>
    <div class="img-actions"><input type="file" name="${e(name)}" accept="image/*" data-preview>
    ${current ? `<label class="check"><input type="checkbox" name="remove_${e(name)}" value="1"> Verwijderen</label>` : ''}</div></div></div>`;
}
function fSelect(name, label, value, options, help = '', attrs = '') {
  return `<label class="field"><span>${e(label)}</span>${help ? `<small>${help}</small>` : ''}<select name="${e(name)}"${attrs}>
    ${Object.entries(options).map(([v, l]) => `<option value="${e(v)}"${String(value) === String(v) ? ' selected' : ''}>${e(l)}</option>`).join('')}</select></label>`;
}

/** Verwerk een bestand-veld: upload nieuw, of markeer voor verwijderen. Geeft {value, trash[]} */
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
  if (s === 'published' && at && new Date(at) > new Date()) return '<span class="badge badge-warn">Ingepland</span>';
  const m = { published: ['Online', 'ok'], draft: ['Concept', 'muted'], pending: ['Te beoordelen', 'warn'], approved: ['Goedgekeurd', 'ok'], rejected: ['Afgewezen', 'bad'] }[s] || [s, 'muted'];
  return `<span class="badge badge-${m[1]}">${e(m[0])}</span>`;
};
const INBOX = { question: 'Vraag van de week', voice: 'Voice message', topic: 'Onderwerp-suggestie', contact: 'Contactbericht' };

/** Formulier versturen met knop-status en foutafhandeling */
function onSubmit(form, handler) {
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const btn = ev.submitter || form.querySelector('button');
    const action = btn?.value || 'save';
    form.querySelectorAll('button').forEach((b) => { b.disabled = true; });
    const label = btn?.innerHTML; if (btn) btn.textContent = 'Bezig…';
    try { await handler(action, new FormData(form)); }
    catch (err) { console.error(err); flash('error', errMsg(err)); }
    finally { form.querySelectorAll('button').forEach((b) => { b.disabled = false; }); if (btn && btn.isConnected) btn.innerHTML = label; }
  });
}
const v = (fd, k) => String(fd.get(k) ?? '').trim();

/* =========================================================
   Overzicht
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
  <header class="page-head"><div><h1>Hoi ${e(S.host_name || 'Lamin')} 👋</h1><p class="muted">Wat wil je vandaag doen?</p></div></header>
  <div class="quick">
    <a class="quick-btn primary" href="#/episode/new">${icon('play')}<span>Nieuwe aflevering</span></a>
    <a class="quick-btn" href="#/guest/new">${icon('mic')}<span>Nieuwe gast</span></a>
    <a class="quick-btn" href="#/post/new">${icon('quote')}<span>Nieuwsbericht / foto's</span></a>
    <a class="quick-btn" href="#/settings/meedoen">${icon('headphones')}<span>Vraag van de week</span></a>
    <a class="quick-btn" href="#/settings/stijl">${icon('website')}<span>Kleuren & logo</span></a>
  </div>
  <div class="stats">
    <a href="#/episodes"><b>${eps}</b><span>afleveringen online${drafts ? ` · ${drafts} concept` : ''}</span></a>
    <a href="#/guests"><b>${guests}</b><span>gasten</span></a>
    <a href="#/posts"><b>${posts}</b><span>nieuwsberichten</span></a>
    <a href="#/stories" class="${pending ? 'attn' : ''}"><b>${pending}</b><span>verhalen te beoordelen</span></a>
    <a href="#/inbox" class="${unread ? 'attn' : ''}"><b>${unread}</b><span>ongelezen berichten</span></a>
  </div>
  <div class="cols">
    <section class="panel"><h2>Te beoordelen verhalen</h2>
      ${pStories.length ? `<ul class="list">${pStories.map((s) => `<li><a href="#/story/${s.id}"><strong>${e(s.title)}</strong><small>${e(s.name)} · ${nlDate(s.created_at, true)}</small></a></li>`).join('')}</ul>` : '<p class="muted">Alles beoordeeld. 🎉</p>'}</section>
    <section class="panel"><h2>Laatste inzendingen</h2>
      ${inbox.length ? `<ul class="list">${inbox.map((m) => `<li class="${m.is_read ? '' : 'unread'}"><a href="#/message/${m.id}"><strong>${e(INBOX[m.type])}${m.upload_path ? ' 🎙️' : ''}</strong><small>${e(m.name || 'Anoniem')} · ${e(excerpt(m.subject || m.message, 60))}</small></a></li>`).join('')}</ul>` : '<p class="muted">Nog geen inzendingen.</p>'}</section>
  </div>`;
}

/* =========================================================
   Afleveringen
   ========================================================= */
async function viewEpisodes(_, main) {
  const rows = await sb.from('episodes').select('id,title,number,status,published_at,categories(name)').order('published_at', { ascending: false }).then(must);
  main.innerHTML = `
  <header class="page-head"><h1>Afleveringen</h1><a class="btn" href="#/episode/new">+ Nieuwe aflevering</a></header>
  <div class="filter"><input type="search" id="flt" placeholder="Zoek op titel…"></div>
  ${rows.length ? `<table class="table"><thead><tr><th>#</th><th>Titel</th><th>Categorie</th><th>Datum</th><th>Status</th></tr></thead><tbody>
    ${rows.map((r) => `<tr data-t="${e(r.title.toLowerCase())}"><td class="num">${r.number ?? '–'}</td><td><a class="row-link" href="#/episode/${r.id}">${e(r.title)}</a></td><td>${e(r.categories?.name || '–')}</td><td>${nlDate(r.published_at)}</td><td>${statusBadge(r.status, r.published_at)}</td></tr>`).join('')}
  </tbody></table>` : '<div class="panel empty">Nog geen afleveringen. <a href="#/episode/new">Voeg je eerste toe.</a></div>'}`;
  main.querySelector('#flt').oninput = (ev) => { const q = ev.target.value.toLowerCase(); main.querySelectorAll('tr[data-t]').forEach((tr) => { tr.hidden = !tr.dataset.t.includes(q); }); };
}

async function viewEpisode(id, main) {
  const isNew = id === 'new' || !id;
  const [row, guests, cats, sel, maxNr] = await Promise.all([
    isNew ? null : sb.from('episodes').select('*').eq('id', id).single().then(must),
    sb.from('guests').select('id,name').order('name').then(must),
    sb.from('categories').select('*').order('sort').then(must),
    isNew ? [] : sb.from('episode_guests').select('guest_id').eq('episode_id', id).then(must).then((r) => r.map((x) => x.guest_id)),
    sb.from('episodes').select('number').order('number', { ascending: false, nullsFirst: false }).limit(1).then(must),
  ]);
  const r = row || { status: 'draft', number: (maxNr[0]?.number || 0) + 1, season: 1 };
  main.innerHTML = `
  <header class="page-head"><div><a class="back" href="#/episodes">← Afleveringen</a><h1>${isNew ? 'Nieuwe aflevering' : 'Aflevering bewerken'}</h1></div>
    ${row?.status === 'published' ? `<a class="btn btn-ghost" target="_blank" href="/aflevering/${e(row.slug)}">Bekijk op site ↗</a>` : ''}</header>
  <form class="edit-grid" id="f">
    <div class="stack">
      <section class="panel stack">
        ${fText('title', 'Titel', r.title, { required: true, placeholder: 'bv. Aflevering 12 — Ondernemen tussen twee culturen' })}
        ${fArea('excerpt', 'Korte samenvatting', r.excerpt, { rows: 3, help: '1–3 zinnen. Komt op de overzichtspagina, in Google en in de WhatsApp-preview.' })}
        ${fArea('shownotes', 'Show notes', r.shownotes, { rows: 14, md: true, help: 'Onderwerpen, tijdstempels (bv. <code>- 12:30 Over familie</code>), links en tips. ' + MD_HELP })}
      </section>
      <section class="panel stack"><h2>Audio of video</h2>
        ${fText('media_url', 'Link naar de aflevering', r.media_url, { attrs: ' inputmode="url"', placeholder: 'https://open.spotify.com/episode/…', help: 'Plak een link van <b>Spotify, YouTube, Apple Podcasts of SoundCloud</b> — de speler verschijnt automatisch. Dit is de aanrader: kost geen opslagruimte.' })}
        <div class="field"><span>…of upload een audiobestand (MP3, max 50 MB)</span>
          ${r.audio ? `<audio controls src="${e(media(r.audio))}"></audio><label class="check"><input type="checkbox" name="remove_audio" value="1"> Audiobestand verwijderen</label>` : ''}
          <input type="file" name="audio" accept="audio/*"><small>Let op: telt mee voor je opslag (1 GB gratis). Een geüpload bestand gaat vóór de link.</small></div>
      </section>
    </div>
    <aside class="stack">
      <section class="panel stack">
        ${fSelect('status', 'Status', r.status, { published: 'Online', draft: 'Concept (niet zichtbaar)' })}
        ${fText('published_at', 'Publicatiedatum', toLocalInput(r.published_at), { type: 'datetime-local', help: 'Datum in de toekomst = automatisch ingepland.' })}
        <div class="row-2">${fText('number', 'Aflevering nr.', r.number, { type: 'number' })}${fText('season', 'Seizoen', r.season, { type: 'number' })}</div>
        ${fText('duration', 'Duur', r.duration, { placeholder: 'bv. 52 min' })}
        ${fSelect('category_id', 'Categorie', r.category_id ?? '', { '': '— geen —', ...Object.fromEntries(cats.map((c) => [c.id, c.name])) })}
        <small><a href="#/categories">Categorieën beheren</a></small>
      </section>
      <section class="panel stack">${fImage('cover', 'Coverafbeelding', r.cover, 'Vierkant werkt het best (bv. 1400×1400).')}</section>
      <section class="panel stack"><div class="field"><span>Gasten in deze aflevering</span>
        ${guests.length ? `<div class="checks">${guests.map((g) => `<label class="check"><input type="checkbox" name="guests" value="${g.id}"${sel.includes(g.id) ? ' checked' : ''}> ${e(g.name)}</label>`).join('')}</div>` : '<small>Nog geen gasten.</small>'}
        <small><a href="#/guest/new">+ Nieuwe gast toevoegen</a> (sla eerst deze aflevering op)</small></div></section>
      ${row ? `<section class="panel stack">${fText('slug', 'Webadres', row.slug, { help: '/aflevering/<b>…</b>' })}</section>` : ''}
      <div class="actions"><button class="btn" value="save">Opslaan</button>${row ? '<button class="btn btn-danger" value="delete" data-confirm="Deze aflevering definitief verwijderen?">Verwijderen</button>' : ''}</div>
    </aside>
  </form>`;

  onSubmit(main.querySelector('#f'), async (action, fd) => {
    const form = main.querySelector('#f');
    if (action === 'delete') {
      must(await sb.from('episodes').delete().eq('id', row.id));
      await trash([row.cover, row.audio]);
      return go('#/episodes', ['ok', 'Aflevering verwijderd.']);
    }
    const audioFile = form.querySelector('input[name=audio]').files[0];
    if (audioFile && audioFile.size > 50 * 1024 * 1024) throw new Error('Audiobestand is groter dan 50 MB. Gebruik liever een Spotify- of YouTube-link.');
    const cover = await fileField(form, 'cover', row?.cover, 'covers');
    const audio = await fileField(form, 'audio', row?.audio, 'audio', 'audio');
    const data = {
      title: v(fd, 'title'),
      slug: await uniqueSlug('episodes', v(fd, 'slug') || v(fd, 'title'), row?.id),
      excerpt: v(fd, 'excerpt'), shownotes: v(fd, 'shownotes'),
      media_url: validUrl(v(fd, 'media_url')), duration: v(fd, 'duration'),
      number: v(fd, 'number') ? +v(fd, 'number') : null, season: v(fd, 'season') ? +v(fd, 'season') : null,
      category_id: v(fd, 'category_id') ? +v(fd, 'category_id') : null,
      status: v(fd, 'status') === 'published' ? 'published' : 'draft',
      published_at: fromLocalInput(v(fd, 'published_at')),
      cover: cover.value, audio: audio.value, updated_at: new Date().toISOString(),
    };
    const saved = row
      ? must(await sb.from('episodes').update(data).eq('id', row.id).select('id').single())
      : must(await sb.from('episodes').insert(data).select('id').single());
    must(await sb.from('episode_guests').delete().eq('episode_id', saved.id));
    const gs = fd.getAll('guests').map((g) => ({ episode_id: saved.id, guest_id: +g }));
    if (gs.length) must(await sb.from('episode_guests').insert(gs));
    await trash([...cover.trash, ...audio.trash]);
    go(`#/episode/${saved.id}`, ['ok', 'Aflevering opgeslagen.']);
  });
}

/* =========================================================
   Gasten
   ========================================================= */
async function viewGuests(_, main) {
  const [rows, links] = await Promise.all([sb.from('guests').select('*').order('name').then(must), sb.from('episode_guests').select('guest_id').then(must)]);
  const n = {}; links.forEach((l) => { n[l.guest_id] = (n[l.guest_id] || 0) + 1; });
  main.innerHTML = `<header class="page-head"><h1>Gasten</h1><a class="btn" href="#/guest/new">+ Nieuwe gast</a></header>
  ${rows.length ? `<div class="tiles">${rows.map((g) => `<a class="tile" href="#/guest/${g.id}">
    ${g.photo ? `<img src="${e(media(g.photo))}" alt="">` : `<span class="avatar">${e(g.name[0] || '?')}</span>`}
    <strong>${e(g.name)}</strong><small>${e(g.tagline || '—')}</small><small>${n[g.id] || 0} aflevering(en)</small></a>`).join('')}</div>` : '<div class="panel empty">Nog geen gasten.</div>'}`;
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
  <header class="page-head"><div><a class="back" href="#/guests">← Gasten</a><h1>${isNew ? 'Nieuwe gast' : 'Gast bewerken'}</h1></div>
    ${row ? `<a class="btn btn-ghost" target="_blank" href="/gast/${e(row.slug)}">Bekijk gastpagina ↗</a>` : ''}</header>
  <form class="edit-grid" id="f">
    <div class="stack">
      <section class="panel stack">
        ${fText('name', 'Naam', r.name, { required: true })}
        ${fText('tagline', 'Wie is de gast? (één regel)', r.tagline, { placeholder: 'bv. Ondernemer uit Banjul, oprichter van …' })}
        ${fArea('bio', 'Bio', r.bio, { rows: 10, md: true, help: MD_HELP })}
      </section>
      <section class="panel stack"><h2>Social media van de gast</h2><p class="muted small">Plak de volledige link naar het profiel. Lege velden worden niet getoond.</p>
        <div class="row-2">${Object.entries(GUEST_SOC).map(([k, l]) => fText(k, l, r[k], { placeholder: 'https://…', attrs: ' inputmode="url"' })).join('')}</div></section>
    </div>
    <aside class="stack">
      <section class="panel stack">${fImage('photo', 'Foto', r.photo, 'Vierkant, gezicht in het midden.')}</section>
      <section class="panel stack"><div class="field"><span>Komt voor in</span>
        ${eps.length ? `<div class="checks">${eps.map((ep) => `<label class="check"><input type="checkbox" name="episodes" value="${ep.id}"${sel.includes(ep.id) ? ' checked' : ''}> ${ep.number ? '#' + ep.number + ' ' : ''}${e(ep.title)}</label>`).join('')}</div>` : '<small>Nog geen afleveringen.</small>'}</div></section>
      ${row ? `<section class="panel stack">${fText('slug', 'Webadres', row.slug, { help: '/gast/<b>…</b>' })}</section>` : ''}
      <div class="actions"><button class="btn" value="save">Opslaan</button>${row ? '<button class="btn btn-danger" value="delete" data-confirm="Deze gast verwijderen?">Verwijderen</button>' : ''}</div>
    </aside>
  </form>`;
  onSubmit(main.querySelector('#f'), async (action, fd) => {
    const form = main.querySelector('#f');
    if (action === 'delete') {
      must(await sb.from('guests').delete().eq('id', row.id));
      await trash([row.photo]);
      return go('#/guests', ['ok', 'Gast verwijderd.']);
    }
    const photo = await fileField(form, 'photo', row?.photo, 'guests');
    const data = { name: v(fd, 'name'), slug: await uniqueSlug('guests', v(fd, 'slug') || v(fd, 'name'), row?.id), tagline: v(fd, 'tagline'), bio: v(fd, 'bio'), photo: photo.value };
    for (const k of Object.keys(GUEST_SOC)) data[k] = validUrl(v(fd, k));
    const saved = row
      ? must(await sb.from('guests').update(data).eq('id', row.id).select('id').single())
      : must(await sb.from('guests').insert(data).select('id').single());
    must(await sb.from('episode_guests').delete().eq('guest_id', saved.id));
    const links = fd.getAll('episodes').map((x) => ({ episode_id: +x, guest_id: saved.id }));
    if (links.length) must(await sb.from('episode_guests').insert(links));
    await trash(photo.trash);
    go(`#/guest/${saved.id}`, ['ok', 'Gast opgeslagen.']);
  });
}

/* =========================================================
   Categorieën
   ========================================================= */
async function viewCategories(_, main) {
  const [rows, eps] = await Promise.all([sb.from('categories').select('*').order('sort').order('name').then(must), sb.from('episodes').select('category_id').then(must)]);
  const n = {}; eps.forEach((x) => { if (x.category_id) n[x.category_id] = (n[x.category_id] || 0) + 1; });
  main.innerHTML = `
  <header class="page-head"><div><h1>Categorieën</h1><p class="muted">Hiermee kunnen luisteraars afleveringen filteren. Pas ze aan zodra je weet welke kant de podcast op gaat.</p></div></header>
  <div class="cols">
    <section class="panel"><form class="stack" id="f">
      <table class="table"><thead><tr><th>Naam</th><th style="width:90px">Volgorde</th><th style="width:110px">Afleveringen</th><th></th></tr></thead><tbody>
      ${rows.map((c) => `<tr><td><input name="name_${c.id}" value="${e(c.name)}"></td><td><input type="number" name="sort_${c.id}" value="${c.sort}"></td><td class="num">${n[c.id] || 0}</td>
        <td><button class="link-danger" value="del_${c.id}" data-confirm="Categorie '${e(c.name)}' verwijderen?">Verwijder</button></td></tr>`).join('')}
      </tbody></table><div><button class="btn" value="save">Wijzigingen opslaan</button></div></form></section>
    <section class="panel"><h2>Nieuwe categorie</h2><form class="stack" id="add">
      <label class="field"><span>Naam</span><input name="name" required placeholder="bv. Muziek & Kunst"></label><div><button class="btn">Toevoegen</button></div></form></section>
  </div>`;
  onSubmit(main.querySelector('#f'), async (action, fd) => {
    if (action.startsWith('del_')) {
      must(await sb.from('categories').delete().eq('id', +action.slice(4)));
      return go('#/categories', ['ok', 'Categorie verwijderd. Afleveringen daarin hebben nu geen categorie.']);
    }
    for (const c of rows) {
      const name = v(fd, 'name_' + c.id);
      if (!name) continue;
      must(await sb.from('categories').update({ name, slug: await uniqueSlug('categories', name, c.id), sort: +v(fd, 'sort_' + c.id) || 0 }).eq('id', c.id));
    }
    go('#/categories', ['ok', 'Categorieën opgeslagen.']);
  });
  onSubmit(main.querySelector('#add'), async (_, fd) => {
    const name = v(fd, 'name');
    must(await sb.from('categories').insert({ name, slug: await uniqueSlug('categories', name), sort: rows.length ? Math.max(...rows.map((r) => r.sort)) + 1 : 0 }));
    go('#/categories', ['ok', 'Categorie toegevoegd.']);
  });
}

/* =========================================================
   Nieuws
   ========================================================= */
async function viewPosts(_, main) {
  const rows = await sb.from('posts').select('id,title,type,status,published_at').order('published_at', { ascending: false }).then(must);
  main.innerHTML = `<header class="page-head"><div><h1>Nieuws & updates</h1><p class="muted">Nieuws, updates, gastaankondigingen en fotoreeksen.</p></div><a class="btn" href="#/post/new">+ Nieuw bericht</a></header>
  ${rows.length ? `<table class="table"><thead><tr><th>Titel</th><th>Soort</th><th>Datum</th><th>Status</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><a class="row-link" href="#/post/${r.id}">${e(r.title)}</a></td><td>${e(POST_TYPES[r.type])}</td><td>${nlDate(r.published_at)}</td><td>${statusBadge(r.status, r.published_at)}</td></tr>`).join('')}</tbody></table>` : '<div class="panel empty">Nog geen berichten.</div>'}`;
}

async function viewPost(id, main) {
  const isNew = id === 'new' || !id;
  const [row, imgs] = await Promise.all([
    isNew ? null : sb.from('posts').select('*').eq('id', id).single().then(must),
    isNew ? [] : sb.from('post_images').select('*').eq('post_id', id).order('sort').order('id').then(must),
  ]);
  const r = row || { type: 'nieuws', status: 'draft' };
  main.innerHTML = `
  <header class="page-head"><div><a class="back" href="#/posts">← Nieuws</a><h1>${isNew ? 'Nieuw bericht' : 'Bericht bewerken'}</h1></div>
    ${row?.status === 'published' ? `<a class="btn btn-ghost" target="_blank" href="/nieuws/${e(row.slug)}">Bekijk op site ↗</a>` : ''}</header>
  <form class="edit-grid" id="f">
    <div class="stack">
      <section class="panel stack">${fText('title', 'Titel', r.title, { required: true })}${fArea('excerpt', 'Korte intro', r.excerpt, { rows: 2 })}${fArea('body', 'Tekst', r.body, { rows: 14, md: true, help: MD_HELP })}</section>
      <section class="panel stack"><h2>Fotogalerij</h2>
        ${imgs.length ? `<div class="gallery-admin">${imgs.map((im) => `<div class="g-item"><img src="${e(media(im.file))}" alt=""><input name="cap_${im.id}" value="${e(im.caption)}" placeholder="Onderschrift"><label class="check"><input type="checkbox" name="rm_img" value="${im.id}"> Verwijder</label></div>`).join('')}</div>` : ''}
        <label class="field"><span>Foto's toevoegen</span><small>Je kunt meerdere foto's tegelijk selecteren. Ze worden automatisch verkleind.</small><input type="file" name="gallery" accept="image/*" multiple></label>
      </section>
    </div>
    <aside class="stack">
      <section class="panel stack">
        ${fSelect('type', 'Soort bericht', r.type, POST_TYPES)}
        ${fSelect('status', 'Status', r.status, { published: 'Online', draft: 'Concept' })}
        ${fText('published_at', 'Publicatiedatum', toLocalInput(r.published_at), { type: 'datetime-local' })}
      </section>
      <section class="panel stack">${fImage('image', 'Hoofdafbeelding', r.image)}</section>
      ${row ? `<section class="panel stack">${fText('slug', 'Webadres', row.slug, { help: '/nieuws/<b>…</b>' })}</section>` : ''}
      <div class="actions"><button class="btn" value="save">Opslaan</button>${row ? '<button class="btn btn-danger" value="delete" data-confirm="Dit bericht verwijderen?">Verwijderen</button>' : ''}</div>
    </aside>
  </form>`;
  onSubmit(main.querySelector('#f'), async (action, fd) => {
    const form = main.querySelector('#f');
    if (action === 'delete') {
      must(await sb.from('posts').delete().eq('id', row.id));
      await trash([row.image, ...imgs.map((i) => i.file)]);
      return go('#/posts', ['ok', 'Bericht verwijderd.']);
    }
    const image = await fileField(form, 'image', row?.image, 'news');
    const data = {
      title: v(fd, 'title'), slug: await uniqueSlug('posts', v(fd, 'slug') || v(fd, 'title'), row?.id),
      type: POST_TYPES[v(fd, 'type')] ? v(fd, 'type') : 'nieuws', excerpt: v(fd, 'excerpt'), body: v(fd, 'body'),
      status: v(fd, 'status') === 'published' ? 'published' : 'draft', published_at: fromLocalInput(v(fd, 'published_at')), image: image.value,
    };
    const saved = row
      ? must(await sb.from('posts').update(data).eq('id', row.id).select('id').single())
      : must(await sb.from('posts').insert(data).select('id').single());
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
    go(`#/post/${saved.id}`, failed.length ? ['error', "Opgeslagen, maar niet alle foto's lukten: " + failed.join(' · ')] : ['ok', 'Bericht opgeslagen.']);
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
  const labels = { pending: 'Te beoordelen', approved: 'Goedgekeurd', rejected: 'Afgewezen' };
  main.innerHTML = `
  <header class="page-head"><div><h1>Community stories</h1><p class="muted">Ingezonden verhalen verschijnen pas op de site als jij ze goedkeurt.</p></div></header>
  <nav class="tabs">${Object.entries(labels).map(([k, l], i) => `<a href="#/stories/${k}"${status === k ? ' aria-current="page"' : ''}>${l} <b>${counts[i]}</b></a>`).join('')}</nav>
  ${rows.length ? `<div class="story-list">${rows.map((s) => {
    const src = s.photo ? media(s.photo) : signed[s.upload_path];
    return `<a class="story-row panel" href="#/story/${s.id}">${src ? `<img src="${e(src)}" alt="">` : '<span class="noimg">geen foto</span>'}
      <div><strong>${e(s.title)}</strong><small>${e(s.name)}${s.location ? ' · ' + e(s.location) : ''} · ${nlDate(s.created_at, true)}</small><p>${e(excerpt(s.body, 180))}</p></div>
      <span class="btn btn-ghost btn-sm">${status === 'pending' ? 'Beoordelen' : 'Bekijken'}</span></a>`;
  }).join('')}</div>` : `<div class="panel empty">${status === 'pending' ? 'Geen nieuwe verhalen om te beoordelen.' : 'Hier staat nog niets.'}</div>`}`;
}

async function signedMap(paths) {
  if (!paths.length) return {};
  const { data } = await sb.storage.from('inbox').createSignedUrls(paths, 3600);
  return Object.fromEntries((data || []).filter((x) => x.signedUrl).map((x) => [x.path, x.signedUrl]));
}

/** Kopieer een privé-inzending naar de openbare map (pas bij goedkeuren) */
async function publishFromInbox(path, folder) {
  const { data: blob, error } = await sb.storage.from('inbox').download(path);
  if (error) throw error;
  const ext = path.split('.').pop();
  const type = blob.type && blob.type !== 'application/octet-stream' ? blob.type : (folder === 'stories' ? 'image/jpeg' : 'audio/webm');
  return upload('media', folder, new File([blob], 'bestand.' + ext, { type }));
}

async function viewStory(id, main) {
  const row = await sb.from('stories').select('*').eq('id', id).single().then(must);
  const contact = (await sb.from('private_contacts').select('email').eq('kind', 'story').eq('ref_id', id).maybeSingle()).data;
  const orig = !row.photo && row.upload_path ? (await signedMap([row.upload_path]))[row.upload_path] : null;
  main.innerHTML = `
  <header class="page-head"><div><a class="back" href="#/stories/${row.status}">← Community stories</a><h1>Verhaal beoordelen</h1></div>
    <div>${statusBadge(row.status)} ${row.status === 'approved' ? `<a class="btn btn-ghost btn-sm" target="_blank" href="/community/${row.id}">Bekijk op site ↗</a>` : ''}</div></header>
  <form class="edit-grid" id="f">
    <div class="stack"><section class="panel stack">
      <p class="muted small">Ingestuurd op ${nlDate(row.created_at, true)}${contact ? ` · <a href="mailto:${e(contact.email)}">${e(contact.email)}</a> (niet zichtbaar op de site)` : ''}. Je kunt de tekst aanpassen (bv. typfouten) voordat je goedkeurt.</p>
      <div class="row-2">${fText('name', 'Naam', row.name, { required: true })}${fText('location', 'Woonplaats / land', row.location)}</div>
      ${fText('title', 'Titel', row.title, { required: true })}
      ${fArea('body', 'Verhaal', row.body, { rows: 16, required: true })}
      ${fArea('admin_note', 'Interne notitie (alleen voor jou)', row.admin_note, { rows: 2 })}
    </section></div>
    <aside class="stack">
      <section class="panel stack">${fImage('photo', 'Foto', row.photo || row.upload_path, row.photo ? '' : (row.upload_path ? 'Ingezonden foto — wordt pas openbaar als je goedkeurt.' : ''), orig)}</section>
      <section class="panel stack decision"><h2>Beslissing</h2>
        ${row.status !== 'approved' ? '<button class="btn btn-ok" value="approve">✓ Goedkeuren & plaatsen</button>' : ''}
        ${row.status !== 'rejected' ? '<button class="btn btn-ghost" value="reject">✕ Afwijzen</button>' : ''}
        ${row.status !== 'pending' ? `<button class="btn btn-ghost" value="pending">Terug naar 'te beoordelen'</button>` : ''}
        <button class="btn btn-ghost" value="save">Alleen opslaan</button>
        <button class="btn btn-danger" value="delete" data-confirm="Verhaal en foto definitief verwijderen?">Verwijderen</button>
      </section>
    </aside>
  </form>`;
  onSubmit(main.querySelector('#f'), async (action, fd) => {
    const form = main.querySelector('#f');
    if (action === 'delete') {
      must(await sb.from('stories').delete().eq('id', row.id));
      await sb.from('private_contacts').delete().eq('kind', 'story').eq('ref_id', row.id);
      await trash([row.photo]); await trash([row.upload_path], 'inbox');
      return go('#/stories/' + row.status, ['ok', 'Verhaal verwijderd.']);
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
      // Openbare kopie weghalen; het origineel blijft privé bewaard voor als je later toch goedkeurt
      if (!newFile && row.photo && row.upload_path) { trashMedia.push(row.photo); data.photo = null; }
    }
    must(await sb.from('stories').update(data).eq('id', row.id));
    await trash(trashMedia); await trash(trashInbox, 'inbox');
    const msg = { approve: 'Goedgekeurd — het verhaal staat nu online.', reject: 'Afgewezen — het verhaal is niet zichtbaar.', pending: "Teruggezet naar 'te beoordelen'.", save: 'Opgeslagen.' }[action];
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
  <header class="page-head"><div><h1>Inbox</h1><p class="muted">Antwoorden, voice messages, onderwerp-suggesties en contactberichten.</p></div></header>
  <nav class="tabs"><a href="#/inbox"${!type ? ' aria-current="page"' : ''}>Alles</a>${Object.entries(INBOX).map(([k, l]) => `<a href="#/inbox/${k}"${type === k ? ' aria-current="page"' : ''}>${l}${n[k] ? ` <b>${n[k]}</b>` : ''}</a>`).join('')}</nav>
  ${rows.length ? `<table class="table inbox"><thead><tr><th>Soort</th><th>Van</th><th>Bericht</th><th>Datum</th><th></th></tr></thead><tbody>
    ${rows.map((m) => `<tr class="${m.is_read ? '' : 'unread'}"><td>${e(INBOX[m.type])}</td><td>${e(m.name || 'Anoniem')}</td>
      <td><a class="row-link" href="#/message/${m.id}">${m.upload_path ? '🎙️ ' : ''}${e(excerpt(((m.subject ? m.subject + ' — ' : '') + m.message).trim() || 'Audiobericht', 80))}</a></td>
      <td class="nowrap">${nlDate(m.created_at)}</td><td>${m.is_public ? '<span class="badge badge-ok">Op site</span>' : ''}</td></tr>`).join('')}
  </tbody></table>` : '<div class="panel empty">Geen berichten.</div>'}`;
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
      <dl class="dl"><dt>Van</dt><dd>${e(row.name || 'Anoniem')}</dd>
        ${contact ? `<dt>E-mail</dt><dd><a href="${e(mailto)}">${e(contact.email)}</a></dd>` : ''}
        <dt>Ontvangen</dt><dd>${nlDate(row.created_at, true)}</dd>
        ${row.question ? `<dt>Vraag</dt><dd>${e(row.question)}</dd>` : ''}
        ${row.subject ? `<dt>Onderwerp</dt><dd><strong>${e(row.subject)}</strong></dd>` : ''}</dl>
      ${row.message ? `<div class="message-body">${e(row.message).replace(/\n/g, '<br>')}</div>` : ''}
      ${audioUrl ? `<audio controls src="${e(audioUrl)}"></audio><a class="small" href="${e(audioUrl)}" download>Audiobestand downloaden (voor in je montage)</a>` : ''}
    </section>
    <aside class="stack"><form class="panel stack" id="f">
      ${contact ? `<a class="btn" href="${e(mailto)}">Beantwoorden per mail</a>` : ''}
      ${['question', 'voice'].includes(row.type) ? `<button class="btn btn-ghost" value="public">${row.is_public ? 'Verbergen van de site' : 'Tonen bij "Reacties van luisteraars"'}</button>
        <small class="muted">Staat <b>${row.is_public ? 'wel' : 'niet'}</b> op de Doe mee-pagina.</small>` : ''}
      <button class="btn btn-ghost" value="unread">Markeer als ongelezen</button>
      <button class="btn btn-danger" value="delete" data-confirm="Bericht verwijderen?">Verwijderen</button>
    </form></aside>
  </div>`;
  onSubmit(main.querySelector('#f'), async (action) => {
    if (action === 'delete') {
      must(await sb.from('submissions').delete().eq('id', row.id));
      await sb.from('private_contacts').delete().eq('kind', 'submission').eq('ref_id', row.id);
      await trash([row.public_audio]); await trash([row.upload_path], 'inbox');
      return go('#/inbox', ['ok', 'Bericht verwijderd.']);
    }
    if (action === 'unread') { must(await sb.from('submissions').update({ is_read: false }).eq('id', row.id)); return go('#/inbox'); }
    if (action === 'public') {
      if (!row.is_public) {
        const pub = row.upload_path && !row.public_audio ? await publishFromInbox(row.upload_path, 'voice') : row.public_audio;
        must(await sb.from('submissions').update({ is_public: true, public_audio: pub }).eq('id', row.id));
        return go(`#/message/${row.id}`, ['ok', 'Staat nu op de Doe mee-pagina.']);
      }
      must(await sb.from('submissions').update({ is_public: false, public_audio: null }).eq('id', row.id));
      await trash([row.public_audio]);
      go(`#/message/${row.id}`, ['ok', 'Verborgen van de site.']);
    }
  });
}

/* =========================================================
   Instellingen
   ========================================================= */
const TABS = { algemeen: 'Homepage & algemeen', stijl: 'Huisstijl', host: 'Over Lamin', contact: 'Contact & socials', meedoen: 'Doe mee', account: 'Wachtwoord' };

function settingsFields() {
  const soc = {};
  for (const [k, l] of Object.entries(NETWORKS)) soc['social_' + k] = [l, k === 'whatsapp' ? 'text' : 'url', k === 'whatsapp' ? 'Telefoonnummer (bv. +31612345678) of link' : ''];
  return {
    algemeen: {
      site_title: ['Naam van de podcast', 'text'],
      tagline: ['Slogan', 'text', 'Korte zin bovenaan de homepage en in Google.'],
      intro_title: ['Titel introductie (homepage)', 'text'],
      intro_text: ['Introductie van de podcast', 'md'],
      hero_image: ['Grote foto op de homepage', 'image', 'Staande foto werkt het mooist (bv. 1200×1500).'],
      footer_text: ['Tekst onderaan de site', 'text'],
    },
    stijl: {
      logo: ['Logo', 'image', 'PNG met transparante achtergrond werkt het best. Wordt ook het icoontje in het browsertabblad.'],
      theme_mode: ['Thema', 'select', '', { dark: 'Donker', light: 'Licht' }],
      color_bg: ['Achtergrondkleur', 'color', 'Basis van de hele site. Kaarten en randen worden hier automatisch van afgeleid.'],
      color_primary: ['Hoofdkleur', 'color', 'Knoppen, links en actief menu.'],
      color_accent: ['Accentkleur', 'color', 'Labels, play-knoppen en highlights.'],
      color_accent2: ['Tweede accent', 'color', 'Kleine kopjes en details.'],
      font_display: ['Lettertype koppen', 'select', '', Object.fromEntries(Object.entries(FONTS).map(([k, f]) => [k, f[0]]))],
    },
    host: {
      host_name: ['Naam host', 'text'],
      host_photo: ['Foto host (Over-pagina)', 'image'],
      host_intro: ['Korte introductie (1 zin)', 'text'],
      host_bio: ['Wie is Lamin?', 'md'], host_why: ['Waarom deze podcast?', 'md'],
      host_background: ['Achtergrond', 'md'], host_mission: ['Missie', 'md'],
    },
    contact: { contact_email: ['E-mailadres (zichtbaar op de contactpagina)', 'email'], contact_intro: ['Tekst contactpagina', 'text'], ...soc },
    meedoen: {
      question_active: ['Vraag van de week tonen', 'check'],
      question_of_week: ['Vraag van de week', 'text', 'Nieuwe vraag? Pas hem hier aan. Antwoorden in de inbox onthouden bij welke vraag ze hoorden.'],
      stories_intro: ['Introductie community stories', 'area'],
    },
  };
}

async function viewSettings(tab, main) {
  tab = TABS[tab] ? tab : 'algemeen';
  await loadSettings();
  const head = `<header class="page-head"><h1>Instellingen</h1><a class="btn btn-ghost" target="_blank" href="/">Bekijk website ↗</a></header>
    <nav class="tabs">${Object.entries(TABS).map(([k, l]) => `<a href="#/settings/${k}"${tab === k ? ' aria-current="page"' : ''}>${l}</a>`).join('')}</nav>`;

  if (tab === 'account') {
    const { data } = await sb.auth.getUser();
    main.innerHTML = head + `<form class="panel stack narrow-form" id="f">
      <p class="muted small">Ingelogd als <b>${e(data.user?.email)}</b>.</p>
      <label class="field"><span>Nieuw wachtwoord (min. 10 tekens)</span><input type="password" name="p1" required minlength="10" autocomplete="new-password"></label>
      <label class="field"><span>Herhaal nieuw wachtwoord</span><input type="password" name="p2" required minlength="10" autocomplete="new-password"></label>
      <div><button class="btn">Wachtwoord wijzigen</button></div></form>`;
    onSubmit(main.querySelector('#f'), async (_, fd) => {
      if (v(fd, 'p1') !== v(fd, 'p2')) throw new Error('De wachtwoorden zijn niet gelijk.');
      const { error } = await sb.auth.updateUser({ password: v(fd, 'p1') });
      if (error) throw error;
      go('#/settings/account', ['ok', 'Wachtwoord gewijzigd.']);
    });
    return;
  }

  const fields = settingsFields()[tab];
  const t = theme(S);
  const cur = (k) => (tab === 'stijl' && t[k] !== undefined ? t[k] : S[k] ?? '');
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

  const presets = tab === 'stijl' ? `<div class="field"><span>Snel kiezen</span>
    <small>Klik op een stijl om de kleuren en letter in te vullen. Daarna kun je nog alles fijn afstellen. Pas na <b>Opslaan</b> wordt het live.</small>
    <div class="presets">${Object.entries(PRESETS).map(([k, [label, vals]]) => `<button type="button" class="preset" data-preset='${e(JSON.stringify(vals))}'>
      <span class="sw" style="background:${e(vals.color_bg)}"><i style="background:${e(vals.color_primary)}"></i><i style="background:${e(vals.color_accent)}"></i><i style="background:${e(vals.color_accent2)}"></i></span>${e(label)}</button>`).join('')}</div></div>` : '';

  const preview = tab === 'stijl' ? `<aside class="panel preview-panel"><h2>Voorbeeld</h2>
    <div class="mini" id="mini"><div class="mini-head"><b>Joe Point</b><span>Afleveringen</span><span class="mini-active">Over</span></div>
      <div class="mini-body"><small class="mini-eyebrow">Nieuwe aflevering</small><div class="mini-h">Welkom bij Joe Point</div><p>Echte verhalen. Open gesprekken.</p>
      <span class="mini-btn">▶ Luister nu</span> <span class="mini-ghost">Over Lamin</span>
      <div class="mini-card"><span class="mini-tag">Gambia & Diaspora</span><b>Aflevering 1</b><small>45 min</small></div></div></div>
    <p class="muted small">Een ruwe schets. Na opslaan zie je het echte resultaat op de site; tekstkleuren worden automatisch aangepast zodat alles leesbaar blijft.</p></aside>` : '';

  main.innerHTML = head + `<form id="f" class="${tab === 'stijl' ? 'style-grid' : ''}"><div class="panel stack">${presets}${html}<div><button class="btn">Opslaan</button></div></div>${preview}</form>`;

  if (tab === 'stijl') setupStylePreview(main);

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
      else if (type === 'email') { val = v(fd, k); if (val && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(val)) throw new Error('Ongeldig e-mailadres.'); }
      else val = v(fd, k);
      rows.push({ key: k, value: val });
    }
    must(await sb.from('settings').upsert(rows));
    await trash(trashList);
    go(`#/settings/${tab}`, ['ok', 'Instellingen opgeslagen.']);
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
