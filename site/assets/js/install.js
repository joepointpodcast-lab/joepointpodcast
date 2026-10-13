// "Add to home screen" — makes Joe Point feel like an app on phones.
// Android (Chrome, Edge…): uses the browser's own install prompt.
// iPhone/iPad: Apple has no install button for websites, so we show the steps (Share → Add to Home Screen).

const KEY = 'jp-install-dismissed';
const WAIT_MS = 6000;               // show the hint after a few seconds on the site
const SNOOZE_DAYS = 30;             // "Not now" hides it for a month

const ua = navigator.userAgent;
const isIOS = /iPhone|iPad|iPod/i.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
const isAndroid = /Android/i.test(ua);
const isMobile = isIOS || isAndroid;
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

let deferredPrompt = null;

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

window.addEventListener('beforeinstallprompt', (ev) => {
  ev.preventDefault();          // we show our own, friendlier banner
  deferredPrompt = ev;
});
window.addEventListener('appinstalled', () => { deferredPrompt = null; close(); snooze(3650); });

function snoozed() {
  try { const t = +localStorage.getItem(KEY); return t && Date.now() < t; } catch { return false; }
}
function snooze(days) {
  try { localStorage.setItem(KEY, String(Date.now() + days * 864e5)); } catch { /* no storage */ }
}

const ICON_SHARE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
const ICON_PLUS = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>';
const ICON_DOTS = '<svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';

const STEPS = {
  ios: `<ol class="ins-steps">
      <li>Tap the <b>Share</b> button <span class="ins-ic">${ICON_SHARE}</span> in your browser bar.</li>
      <li>Scroll down and tap <b>Add to Home Screen</b> <span class="ins-ic">${ICON_PLUS}</span>.</li>
      <li>Tap <b>Add</b>. Done — Joe Point is now on your home screen!</li></ol>`,
  android: `<ol class="ins-steps">
      <li>Tap the <b>menu</b> <span class="ins-ic">${ICON_DOTS}</span> in your browser.</li>
      <li>Tap <b>Add to Home screen</b> or <b>Install app</b>.</li>
      <li>Tap <b>Add</b> / <b>Install</b>. Done!</li></ol>`,
};

function banner(manual = false) {
  if (isStandalone()) return;
  close();
  const el = document.createElement('div');
  el.className = 'install';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Add Joe Point to your home screen');

  let body;
  if (isAndroid && deferredPrompt) {
    body = `<div class="ins-actions"><button class="btn" data-ins="go">${ICON_PLUS} Add to home screen</button><button class="btn btn-ghost" data-ins="later">Not now</button></div>`;
  } else if (isIOS) {
    body = STEPS.ios + `<div class="ins-actions"><button class="btn btn-ghost" data-ins="later">Got it</button></div>`;
  } else if (isAndroid) {
    body = STEPS.android + `<div class="ins-actions"><button class="btn btn-ghost" data-ins="later">Got it</button></div>`;
  } else {
    // Computer: explain how to do it on a phone (and offer install on desktop Chrome/Edge)
    body = `<p class="ins-sub">Open this website on your phone, then:</p>
      <div class="ins-two"><div><b>iPhone</b>${STEPS.ios}</div><div><b>Android</b>${STEPS.android}</div></div>
      <div class="ins-actions">${deferredPrompt ? `<button class="btn" data-ins="go">${ICON_PLUS} Install on this computer</button>` : ''}<button class="btn btn-ghost" data-ins="later">Close</button></div>`;
  }

  el.innerHTML = `<div class="ins-card">
    <button class="ins-x" data-ins="later" aria-label="Close">×</button>
    <div class="ins-head"><img src="/assets/icons/icon-192.png" alt="" width="52" height="52">
      <div><strong>Get Joe Point on your home screen</strong><span>Open new episodes in one tap — just like an app.</span></div></div>
    ${body}</div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));

  el.addEventListener('click', async (ev) => {
    const b = ev.target.closest('[data-ins]');
    if (!b) return;
    if (b.dataset.ins === 'go' && deferredPrompt) {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice.catch(() => null);
      deferredPrompt = null;
      if (choice?.outcome === 'accepted') snooze(3650);
      close();
      return;
    }
    if (!manual) snooze(SNOOZE_DAYS);
    close();
  });
}

function close() {
  document.querySelectorAll('.install').forEach((x) => x.remove());
}

// Link "Add to home screen" in the footer (and anywhere with data-install) always opens it
document.addEventListener('click', (ev) => {
  const a = ev.target.closest('[data-install]');
  if (!a) return;
  ev.preventDefault();
  banner(true);
}, true);

// Automatic hint on phones, once in a while
if (isMobile && !isStandalone() && !snoozed()) {
  setTimeout(() => { if (!document.querySelector('.install')) banner(false); }, WAIT_MS);
}

// Keep the phone's status bar colour in line with the chosen theme
setTimeout(() => {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  const m = document.querySelector('meta[name=theme-color]');
  if (bg && m) m.content = bg;
}, 1500);
