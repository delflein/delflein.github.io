/* =============================================================================
   app.js – Einstiegspunkt: Rendering-Dispatcher, Tab-Leiste, Verdrahtung, Boot
   -----------------------------------------------------------------------------
   render() ist die zentrale Funktion: Sie liest den Zustand und baut die gerade
   sichtbare Ansicht in #main neu auf. Alle Aktionen rufen am Ende save()+render().
   ============================================================================= */

import { $ } from './dom.js';
import { fmtDate } from './util.js';
import { state, T, ui, loadState, flush } from './state.js';
import { viewTripList, viewImport, openSettings } from './views-trips.js';
import { viewTeilnehmer, viewSitz } from './views-teilnehmer.js';
import { viewFormulare, viewBericht, viewAbschluss } from './views-formulare.js';
import { doImport } from './pdf.js';
import { initPWA } from './pwa.js';

/** Baut die aktuelle Ansicht komplett neu in #main. */
export function render() {
  const t = T();
  document.body.classList.toggle('notrip', !t);
  $('#tabbar').style.display = t ? 'flex' : 'none';
  $('#chev').style.display = 'inline';
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === ui().tab));
  $('#hdrTitle').textContent = t ? t.name : 'Feierreisen Busbegleiter';
  if (t) {
    const present = t.participants.filter(p => p.anwesend).length;
    $('#hdrSub').textContent = (t.busNr ? ('Bus ' + t.busNr + ' · ') : '') + t.participants.length + ' Gäste · ' + present + ' an Bord' + (t.datum ? (' · ' + fmtDate(t.datum)) : '');
  } else {
    $('#hdrSub').textContent = state.trips.length ? 'Fahrt auswählen' : 'Noch keine Fahrt angelegt';
  }
  updateTabBadges();

  const m = $('#main');
  m.innerHTML = '';
  if (!t) { m.appendChild(viewTripList()); return; }
  // Leere Fahrt → Import-Startseite (außer auf reinen Formular-Tabs).
  if (!t.participants.length && ui().tab !== 'formulare' && ui().tab !== 'abschluss' && ui().tab !== 'bericht') { m.appendChild(viewImport()); return; }
  if (ui().tab === 'teilnehmer') m.appendChild(viewTeilnehmer());
  else if (ui().tab === 'sitz') m.appendChild(viewSitz());
  else if (ui().tab === 'formulare') m.appendChild(viewFormulare());
  else if (ui().tab === 'bericht') m.appendChild(viewBericht());
  else if (ui().tab === 'abschluss') m.appendChild(viewAbschluss());
}

/** Kleine rote Zähler-Badges an den Tabs (fehlende Check-ins / Sitzplätze). */
export function updateTabBadges() {
  const tb = $('#tabbar');
  tb.querySelectorAll('.badge').forEach(b => b.remove());
  const t = T();
  if (!t || !t.participants.length) return;
  const fehlt = t.participants.filter(p => !p.anwesend).length;
  const seats = t.participants.filter(p => !p.sitzplatz).length;
  const add = (tab, n) => { if (!n) return; const btn = tb.querySelector('button[data-tab="' + tab + '"]'); const s = document.createElement('span'); s.className = 'badge'; s.textContent = n > 99 ? '99+' : n; btn.appendChild(s); };
  add('teilnehmer', fehlt);
  add('sitz', seats);
}

/** Tab wechseln – Scroll-Position pro Tab merken/wiederherstellen. */
let tabScroll = {};
export function setTab(tab) {
  if (state && state.ui) tabScroll[ui().tab] = window.scrollY;
  ui().tab = tab;
  render();
  requestAnimationFrame(() => window.scrollTo(0, tabScroll[tab] || 0));
}

/** Einmalige Verdrahtung der festen UI-Elemente (Kopf, Tabs, Datei-Import). */
function bindUI() {
  $('#tripBtn').onclick = () => { state.activeId = null; render(); flush(); };
  $('#btnSettings').onclick = openSettings;
  document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => setTab(b.dataset.tab));
  $('#pdfInput').addEventListener('change', async e => { const f = e.target.files[0]; if (!f) return; await doImport(f); e.target.value = ''; });
  // Drag & Drop einer PDF (Desktop-Komfort).
  window.addEventListener('dragover', e => e.preventDefault());
  window.addEventListener('drop', e => { e.preventDefault(); const f = [...e.dataTransfer.files].find(x => x.type === 'application/pdf'); if (f) doImport(f); });
  // Beim Verlassen/In-den-Hintergrund sofort speichern.
  window.addEventListener('pagehide', flush);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
}

/* ---------- Boot ---------- */
(async function boot() {
  await loadState();
  bindUI();
  render();
  initPWA(); // Service Worker registrieren + „Zum Home-Bildschirm"-Hinweis
})();
