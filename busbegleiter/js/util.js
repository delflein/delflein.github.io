/* =============================================================================
   util.js – Reine Hilfsfunktionen (kein DOM, kein Zustand)
   -----------------------------------------------------------------------------
   Formatierung, Telefonnummern, Datei-/Base64-Umwandlung. Alles testbar ohne
   Browser, weil hier nichts auf `document` oder `state` zugreift.
   ============================================================================= */

/** Zufällige, kurze ID (für Fahrten / Buchungen). */
export const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

/** HTML-escapen – gegen kaputtes Markup & XSS beim Einsetzen von Nutzertext. */
export const esc = s => (s == null ? '' : String(s)).replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/**
 * Telefonnummer für wa.me normalisieren: nur Ziffern, deutsche Vorwahl 49,
 * führende 0 → 49, +/00 entfernt. Beispiel: "0176 123" → "49176123".
 */
export function normPhone(raw) {
  let n = (raw || '').replace(/[^\d+]/g, '');
  if (!n) return '';
  if (n.indexOf('+') > 0) n = n.replace(/\+/g, '');
  if (n.startsWith('+')) n = n.slice(1);
  if (n.startsWith('00')) n = n.slice(2);
  else if (n.startsWith('0')) n = '49' + n.slice(1);
  else if (n.startsWith('49')) n = n;
  else if (n.startsWith('1')) n = '49' + n;
  return n;
}

/** `tel:`-Link (unverändert lassen, nur Störzeichen weg). */
export const telHref = raw => 'tel:' + (raw || '').replace(/[^\d+]/g, '');

/** `https://wa.me/...`-Link, optional mit vorausgefülltem Text. */
export const waHref = (raw, text) => 'https://wa.me/' + normPhone(raw) + (text ? '?text=' + encodeURIComponent(text) : '');

/** Betrag als deutschen Euro-String, z. B. 12.5 → "12,50 €". */
export const money = n => (Number(n) || 0).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

/** Summe der `betrag`-Felder einer Liste (deutsche Kommazahlen erlaubt). */
export const sumItems = arr => arr.reduce((a, b) => a + (parseFloat((b.betrag || '').replace(',', '.')) || 0), 0);

/** String auf Datei-taugliche Zeichen reduzieren (für Dateinamen). */
export const safeTag = s => (s || '').normalize('NFKD').replace(/[^\w]+/g, '');

/** Bus-Kürzel für Dateinamen, z. B. "2" → "BUS02", leer → "BUSXX". */
export const busTagOf = t => {
  const b = (t.busNr || '').replace(/\D/g, '');
  return 'BUS' + (b ? (b.length < 2 ? b.padStart(2, '0') : b) : 'XX');
};

/** Event-Kürzel für Dateinamen. */
export const evTagOf = t => safeTag(t.name) || 'Event';

/** Euro-Betrag als Dateinamen-Kürzel, z. B. 45.5 → "45,50EUR". */
export const eurTag = s => {
  const r = Math.round((Number(s) || 0) * 100) / 100;
  return (Number.isInteger(r) ? String(r) : r.toFixed(2).replace('.', ',')) + 'EUR';
};

/** Status-Klartext für Anzeige. */
export const statusLabel = s => s === 'abgemeldet' ? 'Abgemeldet' : (s === 'nicht_angetreten' ? 'Nicht angetreten' : '');

/** ISO-Datum (YYYY-MM-DD) → deutsches Format (DD.MM.YYYY). */
export function fmtDate(d) {
  if (!d) return '';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(d);
  return m ? m[3] + '.' + m[2] + '.' + m[1] : d;
}

/** Uint8Array → Base64 (in Blöcken, damit große PDFs den Stack nicht sprengen). */
export function abToB64(u8) {
  let bin = '';
  const chunk = 0x8000;
  for (let i = 0; i < u8.length; i += chunk) bin += String.fromCharCode.apply(null, u8.subarray(i, i + chunk));
  return btoa(bin);
}

/** Base64 → Uint8Array. */
export function b64ToBytes(b64) {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

/** Data-URL ("data:...;base64,XXXX") → Uint8Array. */
export function dataURLToBytes(d) { return b64ToBytes(d.split(',')[1]); }
