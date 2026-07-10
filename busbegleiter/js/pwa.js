/* =============================================================================
   pwa.js – Progressive-Web-App: Service Worker + „Zum Home-Bildschirm"-Hinweis
   -----------------------------------------------------------------------------
   • Registriert den Service Worker (sw.js) für den Offline-Betrieb.
   • Zeigt einen dezenten Hinweis, die App zu installieren:
       – iOS/Safari: Anleitung (Teilen → „Zum Home-Bildschirm"), da iOS keinen
         automatischen Installieren-Knopf per Code erlaubt.
       – Android/Chrome: echter Installieren-Knopf über das beforeinstallprompt-Event.
     Einmal weggewischt, erscheint der Hinweis nicht wieder (localStorage).
   ============================================================================= */

import { APP } from './config.js';
import { elFromHTML } from './dom.js';

const DISMISS_KEY = 'bb_a2hs_dismissed';

/** Läuft die App bereits „installiert" (Standalone)? */
function isStandalone() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

/** Öffentlicher Einstiegspunkt (in app.js beim Boot aufgerufen). */
export function initPWA() {
  registerServiceWorker();
  setupInstallHint();
  // Sicherheitsnetz für verpasste Update-Banner (App wurde während der
  // Installation gekillt o. Ä.): Ist der SW-Cache neuer als das laufende JS,
  // liegt ein fertiges Update bereit → sofort „Neu laden" anbieten.
  if (window.caches) {
    caches.keys().then(keys => {
      const k = keys.filter(x => x.indexOf('busbegleiter-') === 0).sort().pop();
      if (k && k !== 'busbegleiter-v' + APP.version) showUpdateBanner();
    }).catch(() => {});
  }
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  // Nach dem Laden registrieren, damit der erste Start nicht ausgebremst wird.
  window.addEventListener('load', () => {
    // updateViaCache:'none' – die Update-Prüfung von sw.js darf nie am
    // HTTP-Cache (GitHub Pages: 10 min) hängen bleiben.
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
      .then(watchForUpdates)
      .catch(err => console.warn('SW-Registrierung fehlgeschlagen:', err));
  });
}

/**
 * Update-Hinweis: Die App lädt cache-first, ein Update wird also erst beim
 * ÜBERNÄCHSTEN Start sichtbar. Sobald der neue Service Worker aktiv ist,
 * bieten wir stattdessen sofort „Neu laden" an.
 */
function watchForUpdates(reg) {
  // Beim Zurückholen in den Vordergrund nach Updates suchen (sonst nur beim Start).
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') reg.update().catch(() => {});
  });
  const hadController = !!navigator.serviceWorker.controller;
  reg.addEventListener('updatefound', () => {
    const nw = reg.installing;
    if (!nw || !hadController) return; // Erstinstallation → kein Hinweis nötig
    nw.addEventListener('statechange', () => { if (nw.state === 'activated') showUpdateBanner(); });
  });
}

let _updBanner = null;

function showUpdateBanner() {
  if (_updBanner) return;
  _updBanner = elFromHTML(
    '<div class="a2hs upd"><div class="ic">🔄</div><div class="tx"><b>Update geladen.</b> Einmal neu laden, um die neue Version zu nutzen.' +
    '<div style="margin-top:8px"><button class="btn" id="updReload" style="width:auto;padding:8px 16px">Jetzt neu laden</button></div></div>' +
    '<button class="cl" title="Später">✕</button></div>');
  document.body.appendChild(_updBanner);
  _updBanner.querySelector('#updReload').onclick = () => location.reload();
  _updBanner.querySelector('.cl').onclick = () => { _updBanner.remove(); _updBanner = null; };
}

function setupInstallHint() {
  if (isStandalone()) return;                                   // schon installiert
  if (localStorage.getItem(DISMISS_KEY)) return;                // schon weggewischt

  const ua = navigator.userAgent || '';
  const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);

  // Android/Chrome: echtes Install-Event abfangen.
  let deferredPrompt = null;
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    showBanner({
      text: 'Installiere <b>Busbegleiter</b> als App – schneller Start & offline im Bus.',
      button: 'Installieren',
      onButton: async () => { hideBanner(); deferredPrompt.prompt(); try { await deferredPrompt.userChoice; } catch (e) {} deferredPrompt = null; },
    });
  });

  // iOS/Safari: es gibt kein Install-Event → Anleitung einblenden.
  if (isIOS && isSafari) {
    setTimeout(() => {
      if (!isStandalone() && !localStorage.getItem(DISMISS_KEY)) {
        showBanner({ text: 'Als App installieren: unten auf <b>Teilen</b> ⬆︎ tippen und dann <b>„Zum Home-Bildschirm"</b> wählen.' });
      }
    }, 2500);
  }
}

let _banner = null;

function showBanner({ text, button, onButton }) {
  if (_banner) return;
  _banner = elFromHTML(
    '<div class="a2hs"><div class="ic">📲</div><div class="tx">' + text +
    (button ? '<div style="margin-top:8px"><button class="btn" id="a2hsBtn" style="width:auto;padding:8px 16px">' + button + '</button></div>' : '') +
    '</div><button class="cl" title="Ausblenden">✕</button></div>');
  document.body.appendChild(_banner);
  _banner.querySelector('.cl').onclick = () => { localStorage.setItem(DISMISS_KEY, '1'); hideBanner(); };
  if (button) _banner.querySelector('#a2hsBtn').onclick = onButton;
}

function hideBanner() {
  if (_banner) { _banner.remove(); _banner = null; }
}
