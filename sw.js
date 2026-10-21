// Joe Point Podcast — service worker
// Makes the site installable as an app. It deliberately does NOT cache pages,
// so visitors always see the newest episodes and Lamin's latest changes.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return; // everything else goes straight to the network
  event.respondWith(
    fetch(event.request).catch(() => new Response(
      '<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>' +
      '<body style="font-family:system-ui;background:#0d0b0a;color:#f5efe6;display:grid;place-items:center;min-height:100vh;margin:0;text-align:center;padding:24px">' +
      '<div><h1 style="color:#f5a524">You are offline</h1><p>Check your internet connection and try again.</p></div>',
      { headers: { 'content-type': 'text/html; charset=utf-8' } }))
  );
});
