/* =============================================================================
   views-trips.js – Fahrten-Übersicht, „Neue Fahrt", Import-Start, Einstellungen
   ============================================================================= */

import { APP } from './config.js';
import { $, elFromHTML, toast } from './dom.js';
import { esc, fmtDate } from './util.js';
import { state, T, ui, save, newTrip } from './state.js';
import { openSheet, confirmSheet, openPage } from './overlay.js';
import { render } from './app.js';
import { openAddParticipant } from './views-teilnehmer.js';

/** Startbildschirm ohne aktive Fahrt: Liste aller Fahrten + „Neue Fahrt". */
export function viewTripList() {
  const d = elFromHTML('<div></div>');
  if (!state.trips.length) {
    d.innerHTML = '<div class="welcome"><div class="tlogo">F</div><h2 style="margin:0 0 6px">Willkommen, Busbegleiter 👋</h2><p class="muted" style="margin:0 0 18px">Lege deine erste Fahrt an. Du kannst beliebig viele Fahrten verwalten.</p></div>';
  } else {
    d.innerHTML = '<div class="sectitle" style="margin-top:6px">Deine Fahrten</div>';
    state.trips.slice().sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || '')).forEach(t => d.appendChild(tripItem(t)));
  }
  const add = elFromHTML('<button class="btn" style="margin-top:10px">＋ Neue Fahrt anlegen</button>');
  add.onclick = openNewTrip;
  d.appendChild(add);
  return d;
}

/** Eine Zeile in der Fahrten-Liste (öffnen / löschen). */
function tripItem(t) {
  const present = t.participants.filter(p => p.anwesend).length;
  const it = elFromHTML('<div class="tripitem' + (t.id === state.activeId ? ' active' : '') + '"></div>');
  it.innerHTML = '<div class="nrbadge">🚌</div><div class="meta"><div class="nm">' + esc(t.name) + '</div><div class="tiny muted">' + (t.busNr ? ('Bus ' + esc(t.busNr) + ' · ') : '') + (t.participants.length ? (t.participants.length + ' Gäste · ' + present + ' an Bord') : 'leer') + (t.datum ? (' · ' + esc(fmtDate(t.datum))) : '') + '</div></div><button class="tdel">🗑</button>';
  const open = () => { state.activeId = t.id; ui().tab = 'teilnehmer'; ui().search = ''; ui().filter = 'alle'; save(); render(); };
  it.querySelector('.meta').onclick = open;
  it.querySelector('.nrbadge').onclick = open;
  it.querySelector('.tdel').onclick = e => {
    e.stopPropagation();
    confirmSheet({
      title: 'Fahrt löschen?',
      text: '„' + t.name + '" wird endgültig gelöscht – alle Teilnehmer, Unterschriften und Formulare gehen verloren.',
      okLabel: '🗑 Fahrt löschen', danger: true,
      onOk: () => {
        state.trips = state.trips.filter(x => x.id !== t.id);
        if (state.activeId === t.id) state.activeId = null;
        save(); render(); toast('Fahrt gelöscht');
      },
    });
  };
  return it;
}

/** Sheet „Neue Fahrt anlegen" (optional direkt Liste importieren). */
export function openNewTrip() {
  const n = elFromHTML('<div></div>');
  n.innerHTML = '<h2>Neue Fahrt anlegen</h2><div class="field"><label>Name der Fahrt *</label><input id="ntName" placeholder="z. B. Maifeld Weekend 2026"></div><div class="row" style="gap:8px"><div class="field" style="flex:1;margin:0"><label>Bus-Nr.</label><input id="ntBus" placeholder="02"></div><div class="field" style="flex:1;margin:0"><label>Datum</label><input id="ntDate" type="date"></div></div><button class="btn" id="ntCreate" style="margin-top:8px">Anlegen & Liste importieren</button><button class="btn sec" id="ntCreateEmpty" style="margin-top:8px">Nur anlegen</button>';
  const bg = openSheet(n);
  const create = thenImport => {
    const name = n.querySelector('#ntName').value.trim();
    if (!name) { toast('Bitte einen Namen eingeben'); return; }
    const t = newTrip(name, n.querySelector('#ntBus').value.trim(), n.querySelector('#ntDate').value);
    state.trips.push(t); state.activeId = t.id; ui().tab = 'teilnehmer'; save(); bg._close(); render();
    if (thenImport) setTimeout(() => $('#pdfInput').click(), 250); else toast('Fahrt angelegt');
  };
  n.querySelector('#ntCreate').onclick = () => create(true);
  n.querySelector('#ntCreateEmpty').onclick = () => create(false);
}

/** Import-Startseite einer leeren Fahrt (PDF importieren oder manuell hinzufügen). */
export function viewImport() {
  const d = elFromHTML('<div></div>');
  d.innerHTML = '<div class="welcome"><div class="tlogo">📄</div><h2 style="margin:0 0 6px">' + esc(T().name) + '</h2><p class="muted" style="margin:0 0 4px">Importiere die Teilnehmerliste (PDF) von Feierreisen — oder füge Teilnehmer manuell hinzu.</p><div class="dropzone"><div class="bold" style="margin-bottom:4px">Teilnehmerliste importieren</div><div class="small muted">PDF auswählen – Gäste & Buchungen werden automatisch erkannt.</div></div><button class="btn" id="wImport">📄 PDF importieren</button><button class="btn out" id="wAdd" style="margin-top:10px">＋ Teilnehmer manuell hinzufügen</button></div>';
  d.querySelector('#wImport').onclick = () => $('#pdfInput').click();
  d.querySelector('#wAdd').onclick = openAddParticipant;
  return d;
}

/** Einstellungen (eigene Seite): Name, Kontodaten (Auslagen). */
export function openSettings() {
  const k = state.settings.konto;
  const n = elFromHTML('<div></div>');
  n.innerHTML = '<div class="field"><label>Dein Name (Busbegleiter)</label><input id="sBetreuer" value="' + esc(state.settings.betreuer) + '"></div>' +
    '<div class="sectitle">Kontodaten für Auslagenerstattung</div><p class="tiny muted" style="margin:-4px 0 8px">Einmal hinterlegen – gilt für alle Fahrten.</p>' +
    '<div class="field"><label>Kontoinhaber</label><input id="kInh" value="' + esc(k.inhaber) + '"></div><div class="field"><label>IBAN</label><input id="kIban" value="' + esc(k.iban) + '"></div><div class="field"><label>Bank</label><input id="kBank" value="' + esc(k.bank) + '"></div>' +
    '<hr class="sep">' + (T() ? '<button class="btn sec" id="reimport">📄 Liste in „' + esc(T().name) + '" importieren</button>' : '') +
    '<button class="btn sec" id="updCheck" style="margin-top:8px">🔄 Auf Update prüfen</button>' +
    '<p class="tiny muted" style="text-align:center;margin-top:14px">Alle Daten liegen nur lokal auf diesem Gerät (IndexedDB).</p>' +
    '<p class="tiny muted" id="verLine" style="text-align:center;margin-top:4px">App v' + APP.version + '</p>' +
    '<p class="tiny muted" id="vpLine" style="text-align:center;margin-top:2px"></p>';
  const pg = openPage('⚙️ Einstellungen', n);
  n.querySelector('#sBetreuer').oninput = e => { state.settings.betreuer = e.target.value; save(); };
  n.querySelector('#kInh').oninput = e => { k.inhaber = e.target.value; save(); };
  n.querySelector('#kIban').oninput = e => { k.iban = e.target.value; save(); };
  n.querySelector('#kBank').oninput = e => { k.bank = e.target.value; save(); };
  const ri = n.querySelector('#reimport');
  if (ri) ri.onclick = () => { pg._close(); $('#pdfInput').click(); };

  // Diagnosezeile: laufende JS-Version · Service-Worker-Status · Cache-Version.
  // Fehlt „Cache" oder steht „SW: fehlt", läuft die App ohne Offline-Modul und
  // bekommt nie einen Update-Banner (lädt dann übers Netz + HTTP-Cache).
  const vl = n.querySelector('#verLine');
  const bits = ['App v' + APP.version];
  const paint = () => { vl.textContent = bits.join(' · '); };
  paint();
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.getRegistration().then(reg => {
      bits.push(!reg ? 'SW: fehlt' : 'SW: ' + (reg.active ? reg.active.state : (reg.installing ? 'installiert …' : 'wartet')) + (navigator.serviceWorker.controller ? '' : ' (steuert nicht)'));
      paint();
    }).catch(e => { bits.push('SW-Fehler: ' + (e && e.name)); paint(); });
  } else { bits.push('SW: nicht verfügbar'); paint(); }
  if (window.caches) {
    caches.keys().then(keys => {
      const k = keys.filter(x => x.indexOf('busbegleiter-') === 0).sort().pop();
      bits.push(k ? 'Cache ' + k.replace('busbegleiter-', '') : 'Cache: leer');
      paint();
    }).catch(e => { bits.push('Cache-Fehler: ' + (e && e.name)); paint(); });
  } else { bits.push('Cache: nicht verfügbar'); paint(); }

  // Viewport-Diagnose: deckt Layout-Probleme wie die zu hohe Tab-Leiste auf
  // (Body-Höhe vs. echte Bildschirmhöhe, unterer Safe-Area-Bereich).
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;height:env(safe-area-inset-bottom,0px);width:0;visibility:hidden';
  document.body.appendChild(probe);
  const safeB = Math.round(probe.getBoundingClientRect().height);
  probe.remove();
  n.querySelector('#vpLine').textContent = 'Body ' + Math.round(document.body.getBoundingClientRect().height) + ' · Viewport ' + window.innerHeight + ' · Screen ' + screen.height + ' · safe-b ' + safeB + 'px';

  // Manuell nach Updates suchen; registriert den SW neu, falls er fehlt.
  n.querySelector('#updCheck').onclick = async () => {
    if (!('serviceWorker' in navigator)) { toast('Service Worker nicht verfügbar'); return; }
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      if (!reg) {
        await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
        toast('Offline-Modul war nicht installiert – neu eingerichtet. Bitte App einmal neu starten.');
        return;
      }
      toast('Prüfe auf Update …');
      await reg.update();
      if (reg.installing || reg.waiting) { toast('Update wird geladen – gleich erscheint „Neu laden"'); return; }
      // SW aktuell, aber die laufende Seite älter als der Cache (Update schon
      // installiert, Seite nie neu geladen)? → direkt neu laden.
      const keys = window.caches ? await caches.keys().catch(() => []) : [];
      const k = keys.filter(x => x.indexOf('busbegleiter-') === 0).sort().pop();
      if (k && k !== 'busbegleiter-v' + APP.version) { toast('Update bereit – App lädt neu …'); setTimeout(() => location.reload(), 700); return; }
      toast('App ist aktuell (v' + APP.version + ')');
    } catch (e) { toast('Update-Prüfung fehlgeschlagen'); }
  };
}
