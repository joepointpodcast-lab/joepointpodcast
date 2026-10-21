// Shared helpers for the website and the admin
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

export const sb = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, storageKey: 'jp-auth' },
});

/* ---------- Text ---------- */
export const e = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function slugify(s) {
  const out = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/&/g, ' en ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  return out || 'item';
}

export function excerpt(text, len = 160) {
  const t = String(text || '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').replace(/[#*_>]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > len ? t.slice(0, len).trimEnd() + '…' : t;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
export function fmtDate(d, withTime = false) {
  if (!d) return '';
  const x = new Date(d);
  if (isNaN(x)) return '';
  const s = `${x.getDate()} ${MONTHS[x.getMonth()]} ${x.getFullYear()}`;
  return withTime ? `${s}, ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}` : s;
}

/** Safe mini-Markdown: ## heading, - list, 1. list, **bold**, *italic*, [text](url), > quote */
export function md(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').trim().split('\n');
  if (!lines[0] && lines.length === 1) return '';
  let html = '', para = [], list = null;
  const flush = () => { if (para.length) { html += '<p>' + para.map(inline).join('<br>') + '</p>'; para = []; } };
  const close = () => { if (list) { html += `</${list}>`; list = null; } };
  for (const raw of lines) {
    const t = raw.trimEnd();
    let m;
    if (!t.trim()) { flush(); close(); continue; }
    if ((m = t.match(/^(#{1,3})\s+(.+)$/))) { flush(); close(); const l = m[1].length + 1; html += `<h${l}>${inline(m[2])}</h${l}>`; }
    else if ((m = t.match(/^\s*[-*•]\s+(.+)$/))) { flush(); if (list !== 'ul') { close(); html += '<ul>'; list = 'ul'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = t.match(/^\s*\d+[.)]\s+(.+)$/))) { flush(); if (list !== 'ol') { close(); html += '<ol>'; list = 'ol'; } html += `<li>${inline(m[1])}</li>`; }
    else if ((m = t.match(/^>\s?(.*)$/))) { flush(); close(); html += `<blockquote>${inline(m[1])}</blockquote>`; }
    else { close(); para.push(t); }
  }
  flush(); close();
  return html;
}
function inline(s) {
  s = e(s);
  const links = [];
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/g, (_, t, u) => { links.push(`<a href="${u}" target="_blank" rel="noopener">${t}</a>`); return `\u0000${links.length - 1}\u0000`; });
  s = s.replace(/\bhttps?:\/\/[^\s<]+[^\s<.,;:!?)]/g, (u) => { links.push(`<a href="${u}" target="_blank" rel="noopener">${u}</a>`); return `\u0000${links.length - 1}\u0000`; });
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*(?!\s)(.+?)(?<!\s)\*(?![*\w])/g, '$1<em>$2</em>');
  s = s.replace(/^(\d{1,2}:\d{2}(?::\d{2})?)\b/, '<span class="ts">$1</span>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => links[i]);
}

/* ---------- Media ---------- */
export const media = (path) => path ? `${SUPABASE_URL}/storage/v1/object/public/media/${path.split('/').map(encodeURIComponent).join('/')}` : '';

export function validUrl(u) {
  u = String(u || '').trim();
  if (!u) return '';
  if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
  try { const x = new URL(u); return /^https?:$/.test(x.protocol) ? x.href : ''; } catch { return ''; }
}

export function embedHtml(url) {
  url = String(url || '').trim();
  if (!url) return '';
  let u; try { u = new URL(url); } catch { return ''; }
  const host = u.hostname.toLowerCase();
  let m;
  if ((m = url.match(/(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/))) {
    return `<div class="embed embed-video"><iframe src="https://www.youtube-nocookie.com/embed/${m[1]}" title="YouTube" loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; picture-in-picture" allowfullscreen></iframe></div>`;
  }
  if (host.endsWith('spotify.com') && (m = u.pathname.match(/\/(episode|show|playlist)\/([A-Za-z0-9]+)/))) {
    return `<div class="embed embed-audio"><iframe src="https://open.spotify.com/embed/${m[1]}/${m[2]}?theme=0" height="${m[1] === 'episode' ? 152 : 232}" title="Spotify" loading="lazy" allow="autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture"></iframe></div>`;
  }
  if (host === 'podcasts.apple.com') {
    return `<div class="embed embed-audio"><iframe src="https://embed.podcasts.apple.com${e(u.pathname + u.search)}" height="175" title="Apple Podcasts" loading="lazy" sandbox="allow-forms allow-popups allow-same-origin allow-scripts allow-top-navigation-by-user-activation" allow="autoplay *; encrypted-media *;"></iframe></div>`;
  }
  if (host.endsWith('soundcloud.com')) {
    return `<div class="embed embed-audio"><iframe height="166" title="SoundCloud" loading="lazy" src="https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}"></iframe></div>`;
  }
  if (/\.(mp3|m4a|ogg|wav)(\?.*)?$/i.test(u.pathname)) return `<audio class="player" controls preload="none" src="${e(url)}"></audio>`;
  return `<p><a class="btn btn-ghost" href="${e(url)}" target="_blank" rel="noopener">Listen to the episode ↗</a></p>`;
}

export function episodePlayer(ep) {
  if (ep.audio) return `<audio class="player" controls preload="metadata" src="${e(media(ep.audio))}"></audio>`;
  return embedHtml(ep.media_url);
}

/** Resize a photo in the browser (saves storage and strips location data) */
export async function resizeImage(file, max = 1800, quality = 0.85) {
  if (!file || !file.type.startsWith('image/') || file.type === 'image/gif') return file;
  const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => null);
  if (!bmp) return file;
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement('canvas');
  c.width = Math.round(bmp.width * scale); c.height = Math.round(bmp.height * scale);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const keepAlpha = file.type === 'image/png' || file.type === 'image/webp';
  const type = keepAlpha ? 'image/webp' : 'image/jpeg';
  const blob = await new Promise((r) => c.toBlob(r, type, quality));
  if (!blob) return file;
  return new File([blob], 'foto.' + (keepAlpha ? 'webp' : 'jpg'), { type });
}

export function extOf(file) {
  const fromName = (file.name || '').split('.').pop().toLowerCase();
  const map = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'audio/mpeg': 'mp3', 'audio/mp4': 'm4a', 'audio/x-m4a': 'm4a', 'audio/aac': 'aac', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/webm': 'webm' };
  const base = (file.type || '').split(';')[0];
  return map[base] || (/^[a-z0-9]{2,5}$/.test(fromName) ? fromName : 'bin');
}

/** Upload to a bucket; returns the path */
export async function upload(bucket, folder, file) {
  const path = `${folder}/${crypto.randomUUID()}.${extOf(file)}`;
  const contentType = (file.type || 'application/octet-stream').split(';')[0];
  const { error } = await sb.storage.from(bucket).upload(path, file, { contentType, upsert: false, cacheControl: '31536000' });
  if (error) throw new Error(uploadError(error));
  return path;
}
function uploadError(err) {
  const m = String(err.message || err);
  if (/size|too large|exceeded/i.test(m)) return 'The file is too large.';
  if (/mime|type/i.test(m)) return 'This file type is not supported.';
  return 'Upload failed: ' + m;
}

/** Friendly error message from Supabase errors */
export function errMsg(err) {
  if (!err) return 'Something went wrong.';
  return err.message || String(err);
}

/* ---------- Socials ---------- */
export const NETWORKS = { facebook: 'Facebook', instagram: 'Instagram', youtube: 'YouTube', tiktok: 'TikTok', spotify: 'Spotify', apple: 'Apple Podcasts', x: 'X', linkedin: 'LinkedIn', whatsapp: 'WhatsApp', website: 'Website' };

export function siteSocials(S) {
  const out = {};
  for (const k of Object.keys(NETWORKS)) if (S['social_' + k]) out[k] = S['social_' + k];
  return out;
}

export function socialsHtml(links, big = false) {
  const keys = Object.keys(links || {});
  if (!keys.length) return '';
  return `<ul class="socials${big ? ' socials-big' : ''}">` + keys.map((k) => {
    let href = links[k];
    if (k === 'whatsapp' && /^\+?[\d\s-]+$/.test(href)) href = 'https://wa.me/' + href.replace(/\D/g, '');
    const label = NETWORKS[k] || k;
    return `<li><a href="${e(href)}" target="_blank" rel="noopener" aria-label="${e(label)}" title="${e(label)}">${icon(k)}${big ? `<span>${e(label)}</span>` : ''}</a></li>`;
  }).join('') + '</ul>';
}

export const POST_TYPES = { nieuws: 'News', update: 'Update', gast: 'Guest announcement', fotos: 'Photos' };

/* ---------- Icons (generic, no brand logos) ---------- */
const P = {
  spotify: '<circle cx="12" cy="12" r="9"/><path d="M7.5 9.5c3-1 6.5-.7 9 .8M8 12.5c2.5-.7 5.2-.4 7.3.7M8.6 15.3c1.9-.5 3.9-.3 5.5.5"/>',
  apple: '<path d="M12 3a6 6 0 0 0-6 6c0 2.2 1.2 4.1 3 5.2M12 3a6 6 0 0 1 6 6c0 2.2-1.2 4.1-3 5.2"/><circle cx="12" cy="9.5" r="2"/><path d="M12 13v8"/>',
  youtube: '<rect x="3" y="5.5" width="18" height="13" rx="3.5"/><path d="m10 9.5 4.5 2.5-4.5 2.5z"/>',
  instagram: '<rect x="3.5" y="3.5" width="17" height="17" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.2" cy="6.8" r=".6" fill="currentColor"/>',
  tiktok: '<path d="M14 3v11.5a3.5 3.5 0 1 1-3.5-3.5"/><path d="M14 3c.5 2.7 2.3 4.4 5 4.6"/>',
  facebook: '<rect x="3.5" y="3.5" width="17" height="17" rx="4.5"/><path d="M15.5 7.5h-1.7a2.3 2.3 0 0 0-2.3 2.3v10.7M9 12.5h6"/>',
  x: '<path d="M4 4l16 16M20 4 4 20"/>',
  linkedin: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12.5h18"/>',
  whatsapp: '<path d="M20 11.5a8 8 0 0 1-11.8 7L4 20l1.5-4A8 8 0 1 1 20 11.5z"/>',
  website: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/>',
  link: '<path d="M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="m4 7 8 6 8-6"/>',
  mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"/>',
  play: '<path d="M7 4.5v15l12-7.5z" fill="currentColor"/>',
  headphones: '<path d="M4 15v-3a8 8 0 0 1 16 0v3"/><rect x="3" y="14" width="4.5" height="6.5" rx="1.5"/><rect x="16.5" y="14" width="4.5" height="6.5" rx="1.5"/>',
  search: '<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  quote: '<path d="M9 8H6a2 2 0 0 0-2 2v3h5v-5zM9 8c0 4-1 7-5 9M20 8h-3a2 2 0 0 0-2 2v3h5v-5zM20 8c0 4-1 7-5 9"/>',
  share: '<circle cx="18" cy="5.5" r="2.5"/><circle cx="6" cy="12" r="2.5"/><circle cx="18" cy="18.5" r="2.5"/><path d="m8.2 10.8 7.6-4.1M8.2 13.2l7.6 4.1"/>',
  book: '<path d="M4 4.5A1.5 1.5 0 0 1 5.5 3H19v15H5.5A1.5 1.5 0 0 0 4 19.5z"/><path d="M4 19.5A1.5 1.5 0 0 0 5.5 21H19v-3"/>',
  chart: '<path d="M4 20V11M10 20V5M16 20v-6M3 20.5h18"/>',
  stop: '<rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor"/>',
};
export const icon = (n) => `<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || P.link}</svg>`;

/* ---------- Theme ---------- */
export const FONTS = {
  bricolage: ['Bricolage Grotesque — modern & friendly', 'Bricolage+Grotesque:opsz,wght@12..96,600;12..96,800', '"Bricolage Grotesque"'],
  anton: ['Anton — big & bold (poster style)', 'Anton', '"Anton"'],
  oswald: ['Oswald — clean & narrow', 'Oswald:wght@500;700', '"Oswald"'],
  playfair: ['Playfair Display — classic & elegant', 'Playfair+Display:wght@600;800', '"Playfair Display"'],
  righteous: ['Righteous — retro neon', 'Righteous', '"Righteous"'],
};
export const PRESETS = {
  vuur: ['Fire & gold', { theme_mode: 'dark', color_bg: '#0d0b0a', color_primary: '#f5a524', color_accent: '#ff6a1a', color_accent2: '#ffd27a', font_display: 'anton' }],
  studio: ['Studio neon', { theme_mode: 'dark', color_bg: '#0a1020', color_primary: '#f2b544', color_accent: '#3d8bff', color_accent2: '#f2b544', font_display: 'righteous' }],
  gambia: ['Gambia', { theme_mode: 'dark', color_bg: '#0e1512', color_primary: '#3aa35b', color_accent: '#e23d3d', color_accent2: '#5b8def', font_display: 'bricolage' }],
  licht: ['Light & warm', { theme_mode: 'light', color_bg: '#fbf7f0', color_primary: '#0f5c4a', color_accent: '#e0a526', color_accent2: '#c2412d', font_display: 'bricolage' }],
  zwart: ['Black & white', { theme_mode: 'light', color_bg: '#ffffff', color_primary: '#111111', color_accent: '#f5a524', color_accent2: '#111111', font_display: 'oswald' }],
};

const rgb = (h) => { h = /^#[0-9a-f]{6}$/i.test(h) ? h : '#000000'; return [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16)); };
const hex = (c) => '#' + c.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
export const mix = (a, b, t) => { const x = rgb(a), y = rgb(b); return hex(x.map((v, i) => v + (y[i] - v) * t)); };
export const lum = (h) => { const c = rgb(h).map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a, b) => { const l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
export const inkOn = (bg) => contrast(bg, '#141210') >= contrast(bg, '#ffffff') ? '#141210' : '#ffffff';
const readable = (c, bg, min = 4.5) => { const to = lum(bg) > 0.4 ? '#000000' : '#ffffff'; for (let i = 0; i < 20 && contrast(c, bg) < min; i++) c = mix(c, to, 0.08); return c; };

export function theme(S) {
  const d = PRESETS.vuur[1], t = {};
  for (const k of Object.keys(d)) t[k] = S[k] || d[k];
  if (!FONTS[t.font_display]) t.font_display = 'bricolage';
  return t;
}

export function themeVars(S) {
  const t = theme(S);
  const dark = t.theme_mode === 'dark';
  let bg = t.color_bg;
  if (dark && lum(bg) > 0.2) bg = mix(bg, '#000000', 0.85);
  if (!dark && lum(bg) < 0.6) bg = mix(bg, '#ffffff', 0.9);
  const ink = dark ? '#f5efe6' : '#1d1a16';
  return {
    'color-scheme': dark ? 'dark' : 'light',
    '--bg': bg,
    '--bg-alt': dark ? mix(bg, '#ffffff', 0.035) : mix(bg, '#000000', 0.035),
    '--surface': dark ? mix(bg, '#ffffff', 0.06) : mix(bg, '#ffffff', 0.85),
    '--ink': ink,
    '--muted': mix(ink, bg, 0.38),
    '--line': dark ? mix(bg, '#ffffff', 0.13) : mix(bg, '#000000', 0.11),
    '--primary': t.color_primary,
    '--primary-ink': inkOn(t.color_primary),
    '--link': readable(t.color_primary, bg),
    '--accent': t.color_accent,
    '--accent-ink': inkOn(t.color_accent),
    '--accent-2': readable(t.color_accent2, bg),
    '--band': dark ? mix(bg, '#000000', 0.45) : mix(t.color_primary, '#000000', 0.72),
    '--band-ink': '#f5efe6',
    '--display': `${FONTS[t.font_display][2]}, "Inter", system-ui, sans-serif`,
    '--display-case': ['anton', 'oswald'].includes(t.font_display) ? 'uppercase' : 'none',
  };
}

export function fontUrl(S) {
  return `https://fonts.googleapis.com/css2?family=${FONTS[theme(S).font_display][1]}&family=Inter:wght@400;500;600&display=swap`;
}

/** Apply the theme to the page (and remember it for a faster next visit) */
export function applyTheme(S, el = document.documentElement) {
  const v = themeVars(S);
  for (const [k, val] of Object.entries(v)) el.style.setProperty(k, val);
  let link = document.getElementById('theme-font');
  if (!link) { link = document.createElement('link'); link.id = 'theme-font'; link.rel = 'stylesheet'; document.head.appendChild(link); }
  const href = fontUrl(S);
  if (link.href !== href) link.href = href;
  try { localStorage.setItem('jp-theme', JSON.stringify(v)); } catch { /* no storage available */ }
}
