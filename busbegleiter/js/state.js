/* =============================================================================
   state.js – Anwendungszustand & Persistenz
   -----------------------------------------------------------------------------
   Hält den gesamten Zustand (`state`) und speichert ihn geräteintern:
   primär in IndexedDB, Fallback localStorage. NICHTS verlässt das Gerät.

   `state` wird als "live binding" exportiert: andere Module importieren `state`
   und sehen automatisch den aktuellen Wert, auch nachdem `loadState()` ihn
   beim Start neu gesetzt hat.
   ============================================================================= */

import { STORE } from './config.js';
import { uid } from './util.js';
import { toast } from './dom.js';

/** Der komplette Zustand. Wird von loadState() befüllt. */
export let state = null;

/* ---------- Datenmodell ---------- */

/** Leeres Formular-Set für eine Fahrt (Auslagen, Einnahmen, Checkliste …). */
export const blankForms = () => ({
  auslagen: { items: [] },
  einnahmen: { bar: false, items: [] },
  noshows: [],
  tickets: { uebrig: false, uebrigAnzahl: '', weitergeben: false, weiterAn: '' },
  checkHin: {}, checkRueck: {}, checkSig: {}, bemerkungen: '',
  namensaenderungen: [], neubucher: [], aenderungen: [],
});

/** Neue, leere Fahrt anlegen. */
export function newTrip(name, bus, datum) {
  return {
    id: uid(), name: name || 'Neue Fahrt', busNr: bus || '', datum: datum || '',
    groupInvite: '', tourbericht: '', createdAt: new Date().toISOString(), importedAt: '',
    pdfData: null, pdfName: '', participants: [], bookings: [], forms: blankForms(),
  };
}

/** Standard-Zustand für den ersten Start. */
export function defaults() {
  return {
    trips: [], activeId: null,
    settings: {
      betreuer: '', konto: { inhaber: '', iban: '', bank: '' },
      waTemplate: 'Moin! Hier der Link zur WhatsApp-Gruppe für unsere Fahrt: {invite}',
    },
    ui: { tab: 'teilnehmer', filter: 'alle', search: '', sortBy: 'nr', seatSearch: '', leg: 'hin' },
  };
}

/* ---------- Zugriffs-Helfer ---------- */

/** Aktuell ausgewählte Fahrt (oder null). */
export const T = () => state.trips.find(t => t.id === state.activeId) || null;

/** UI-Teil des Zustands (aktiver Tab, Filter, Suche …). */
export const ui = () => state.ui;

/** Buchung zu einem Teilnehmer finden. */
export function bookingOf(p) {
  const t = T();
  return t && t.bookings ? t.bookings.find(b => b.id === p.buchungId) : null;
}

/* ---------- Persistenz ---------- */

const IDB_OK = (typeof indexedDB !== 'undefined' && indexedDB);

/** Kleiner Promise-Wrapper um eine IndexedDB-Transaktion auf dem "kv"-Store. */
function idbReq(mode, fn) {
  return new Promise((res, rej) => {
    const o = indexedDB.open(STORE.db, 1);
    o.onupgradeneeded = () => { try { o.result.createObjectStore('kv'); } catch (e) {} };
    o.onerror = () => rej(o.error);
    o.onsuccess = () => {
      try {
        const tx = o.result.transaction('kv', mode);
        const req = fn(tx.objectStore('kv'));
        tx.oncomplete = () => res(req ? req.result : undefined);
        tx.onerror = () => rej(tx.error);
      } catch (e) { rej(e); }
    };
  });
}

/** Zustand laden: erst IndexedDB, dann localStorage-Fallback. */
async function persistLoad() {
  if (IDB_OK) {
    try { const v = await idbReq('readonly', st => st.get(STORE.key)); if (v) return v; } catch (e) {}
  }
  try {
    const ls = localStorage.getItem(STORE.ls) || localStorage.getItem(STORE.lsOld);
    if (ls) return JSON.parse(ls);
  } catch (e) {}
  return null;
}

let _saveT;
/** Speichern (entprellt – häufige Aufrufe werden gebündelt). */
export function save() {
  if (!state) return;
  clearTimeout(_saveT);
  _saveT = setTimeout(doSave, 120);
}

async function doSave() {
  if (IDB_OK) {
    try { await idbReq('readwrite', st => st.put(state, STORE.key)); return; } catch (e) {}
  }
  try { localStorage.setItem(STORE.ls, JSON.stringify(state)); } catch (e) { toast('Speicher voll'); }
}

/** Sofort (unentprellt) speichern – z. B. wenn die Seite in den Hintergrund geht. */
export function flush() { return doSave(); }

/** Beim Start aufrufen: geladenen Zustand migrieren/normalisieren und setzen. */
export async function loadState() {
  state = migrate(await persistLoad());
  return state;
}

/* ---------- Migration / Normalisierung älterer Datenstände ---------- */

/** Sehr alte Ein-Fahrt-Struktur auf das Mehr-Fahrten-Modell heben. */
function migrate(s) {
  if (!s) return defaults();
  if (!s.trips) {
    const t = newTrip((s.meta && s.meta.event) || 'Fahrt 1', s.meta && s.meta.busNr, s.meta && s.meta.datum);
    t.participants = s.participants || [];
    t.forms = s.forms || blankForms();
    s = {
      trips: t.participants.length ? [t] : [],
      activeId: t.participants.length ? t.id : null,
      settings: s.settings || {}, ui: defaults().ui,
    };
  }
  return normalize(s);
}

/** Fehlende Felder ergänzen, damit neuere Versionen nie über `undefined` stolpern. */
function normalize(s) {
  s.settings = s.settings || {};
  if (!s.settings.konto) s.settings.konto = { inhaber: '', iban: '', bank: '' };
  if (s.settings.waTemplate == null) s.settings.waTemplate = defaults().settings.waTemplate;
  delete s.settings.groupInvite;
  s.ui = s.ui || defaults().ui;
  if (!s.ui.leg) s.ui.leg = 'hin';
  (s.trips || []).forEach(t => {
    if (t.groupInvite == null) t.groupInvite = '';
    if (t.pdfData === undefined) t.pdfData = null;
    if (!t.forms) t.forms = blankForms();
    if (!t.forms.auslagen) t.forms.auslagen = { items: [] };
    if (!t.forms.aenderungen) t.forms.aenderungen = [];
    if (!t.forms.checkSig) t.forms.checkSig = {};
    if (t.tourbericht === undefined) t.tourbericht = '';
    // Konto wanderte früher ins Auslagen-Formular – einmalig in die Settings heben.
    if (t.forms.auslagen.kontoinhaber && !s.settings.konto.inhaber) {
      s.settings.konto = { inhaber: t.forms.auslagen.kontoinhaber || '', iban: t.forms.auslagen.iban || '', bank: t.forms.auslagen.bank || '' };
    }
    t.participants = t.participants || [];
    t.participants.forEach(p => { if (p.status === undefined) p.status = ''; if (p.rueckAnwesend === undefined) p.rueckAnwesend = false; });
    t.bookings = t.bookings || [];
  });
  return s;
}
