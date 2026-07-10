/* =============================================================================
   config.js – Zentrale Konstanten & Konfiguration
   -----------------------------------------------------------------------------
   Alles, was an EINER Stelle stehen sollte: App-Metadaten, Speicher-Schlüssel,
   Pfade zu Assets und die festen Text-Zeilen der Bus-Checkliste.
   ============================================================================= */

/** App-Metadaten. `version` wird in den Einstellungen angezeigt –
 *  bei jedem Release zusammen mit CACHE_VERSION in sw.js hochzählen! */
export const APP = {
  name: 'Busbegleiter',
  version: '2.6.4',
  /** Original-Feierreisen-Formulare (Auslagen · Einnahmen · Checkliste · Namensänderung).
   *  Wird beim Export mit pdf-lib bestempelt. Liegt lokal im Repo → offline verfügbar. */
  formTemplateUrl: './assets/vorlage-formulare.pdf',
};

/** Schlüssel für die Persistenz. Primär IndexedDB, Fallback localStorage. */
export const STORE = {
  db: 'feierreisen',      // IndexedDB-Datenbankname
  key: 'state',           // Schlüssel des einzigen Datensatzes
  ls: 'feierreisen_betreuer_v2',      // localStorage-Fallback (aktuell)
  lsOld: 'feierreisen_betreuer_v1',   // localStorage-Fallback (Alt, für Migration)
};

/** Bus-Checkliste – abzuhakende Punkte der HINfahrt (Reihenfolge = Formular). */
export const CHECK_HIN = [
  'Eventname und Busnummer', 'Fahrendes Busunternehmen', 'Fahrender Busfahrer inkl. Nummer',
  'Pünktlichkeit bei Abfahrt', 'Sitzplatzangabe inkl. Betreuerplatz', 'Funktion Toilette',
  'Getränke vorhanden', 'Navi vorhanden', 'Zustand Bus Außen', 'Zustand Bus innen Hinfahrt',
  'CD / DVD Funktion', 'Sound und Bildschirme', 'Zustand Technik',
];

/** Bus-Checkliste – Punkte der RÜCKfahrt. */
export const CHECK_RUECK = [
  'Pünktlichkeit bei Abfahrt', 'Zustand Bus innen bei Rückkunft', 'Hotelbewertung + Parkplatz',
];
