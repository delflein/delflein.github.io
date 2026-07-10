/* =============================================================================
   sw.js – Service Worker (Offline-Betrieb)
   -----------------------------------------------------------------------------
   Strategie: "cache-first" für alle App-Dateien. Beim ersten Besuch wird die
   komplette App-Shell (HTML, CSS, JS-Module, Bibliotheken, Formular-Vorlage,
   Icons) in den Cache gelegt. Danach lädt alles aus dem Cache → funktioniert
   ohne Netz (Flugmodus / kein Empfang im Bus).

   Update: CACHE_VERSION erhöhen → beim nächsten Online-Start wird der alte
   Cache verworfen und die neuen Dateien werden geholt.
   ============================================================================= */

// Bei jedem Release zusammen mit APP.version in js/config.js hochzählen!
const CACHE_VERSION = 'busbegleiter-v2.6.4';

/** Dateien, die beim Installieren vorab gecacht werden (App-Shell). */
const APP_SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  // JS-Module
  './js/app.js', './js/config.js', './js/dom.js', './js/overlay.js', './js/parser.js',
  './js/pdf.js', './js/pwa.js', './js/signature.js', './js/state.js', './js/util.js',
  './js/views-formulare.js', './js/views-teilnehmer.js', './js/views-trips.js',
  // Bibliotheken (lokal gebündelt)
  './assets/vendor/pdf.min.js', './assets/vendor/pdf.worker.min.js',
  './assets/vendor/jspdf.umd.min.js', './assets/vendor/jspdf.plugin.autotable.min.js',
  './assets/vendor/pdf-lib.min.js',
  // Formular-Vorlage + Icons
  './assets/vorlage-formulare.pdf',
  './assets/icons/icon-192.png', './assets/icons/icon-512.png',
  './assets/icons/maskable-512.png', './assets/icons/apple-touch-icon.png',
];

// Installieren: App-Shell cachen und sofort aktiv werden.
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(cache => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

// Aktivieren: alte Cache-Versionen aufräumen.
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE_VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Abrufen: cache-first für eigene Dateien; unbekanntes nachladen & cachen.
self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;                         // nur Lesezugriffe
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;          // Fremd-Origin normal durchlassen

  event.respondWith(
    caches.match(req).then(cached => {
      if (cached) return cached;
      return fetch(req).then(res => {
        // Erfolgreiche Antworten für später mitschneiden.
        if (res && res.status === 200 && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then(cache => cache.put(req, copy));
        }
        return res;
      }).catch(() => {
        // Offline & nicht im Cache: bei Seiten-Navigationen die App-Shell liefern.
        if (req.mode === 'navigate') return caches.match('./index.html');
      });
    })
  );
});
