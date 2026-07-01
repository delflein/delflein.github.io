/* =============================================================================
   views-trips.js – Fahrten-Übersicht, „Neue Fahrt", Import-Start, Einstellungen
   ============================================================================= */

import { $, elFromHTML, toast } from './dom.js';
import { esc, fmtDate } from './util.js';
import { state, T, ui, save, newTrip } from './state.js';
import { openSheet, confirmSheet } from './overlay.js';
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

/** Einstellungen: Name, Kontodaten (Auslagen), WhatsApp-Vorlage. */
export function openSettings() {
  const k = state.settings.konto;
  const n = elFromHTML('<div></div>');
  n.innerHTML = '<h2>Einstellungen</h2><div class="field"><label>Dein Name (Busbegleiter)</label><input id="sBetreuer" value="' + esc(state.settings.betreuer) + '"></div>' +
    '<div class="sectitle">Kontodaten für Auslagenerstattung</div><p class="tiny muted" style="margin:-4px 0 8px">Einmal hinterlegen – gilt für alle Fahrten.</p>' +
    '<div class="field"><label>Kontoinhaber</label><input id="kInh" value="' + esc(k.inhaber) + '"></div><div class="field"><label>IBAN</label><input id="kIban" value="' + esc(k.iban) + '"></div><div class="field"><label>Bank</label><input id="kBank" value="' + esc(k.bank) + '"></div>' +
    '<div class="sectitle">WhatsApp-Nachricht</div><div class="field"><label>Vorlage „an alle" ({invite} = Gruppenlink der Fahrt)</label><textarea id="sTpl">' + esc(state.settings.waTemplate) + '</textarea></div>' +
    '<hr class="sep">' + (T() ? '<button class="btn sec" id="reimport">📄 Liste in „' + esc(T().name) + '" importieren</button>' : '') + '<p class="tiny muted" style="text-align:center;margin-top:14px">Alle Daten liegen nur lokal auf diesem Gerät (IndexedDB).</p><button class="btn" id="sClose" style="margin-top:6px">Fertig</button>';
  const bg = openSheet(n);
  n.querySelector('#sBetreuer').oninput = e => { state.settings.betreuer = e.target.value; save(); };
  n.querySelector('#kInh').oninput = e => { k.inhaber = e.target.value; save(); };
  n.querySelector('#kIban').oninput = e => { k.iban = e.target.value; save(); };
  n.querySelector('#kBank').oninput = e => { k.bank = e.target.value; save(); };
  n.querySelector('#sTpl').oninput = e => { state.settings.waTemplate = e.target.value; save(); };
  const ri = n.querySelector('#reimport');
  if (ri) ri.onclick = () => { bg._close(); $('#pdfInput').click(); };
  n.querySelector('#sClose').onclick = () => { bg._close(); render(); };
}
