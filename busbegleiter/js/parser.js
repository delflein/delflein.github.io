/* =============================================================================
   parser.js – Teilnehmerliste (PDF) → strukturierte Daten
   -----------------------------------------------------------------------------
   Eingang:  pages = [{ items: [{ s, x, y }] }]   (Text-Fragmente aus pdf.js:
             s = Text, x/y = Position auf der Seite, y von unten gemessen)
   Ausgang:  { participants, bookings, meta }

   BUCHUNGS-MODELL (wichtig fürs Verständnis):
   Die Liste besteht aus zwei Zeilentypen:
     • „Bucher"-Zeile   – dunkel hinterlegt, OHNE laufende Nummer. Enthält den
                          Namen der buchenden Person, evtl. Handy und „Bezahlt".
                          Startet eine neue Buchung.
     • „Mitfahrer"-Zeile – weiß, MIT laufender Nummer. Gehört zur zuletzt
                          gestarteten Buchung. Erbt deren Bezahl-Status.
   Eine Buchung kann mehrere Mitfahrer haben (Gruppenbuchung).

   LAYOUT-ROBUSTHEIT:
   Verschiedene Listen haben verschieden benannte/angeordnete Spalten
   (z. B. „AbfahrtOrt" vs. „Abfahrtsort", „Beutel"/„Extras" vs. „Sondergepäck").
   Deshalb werden die Spaltengrenzen pro PDF aus der Kopfzeile ERKANNT
   (detectHeaderBounds) statt fest verdrahtet, und „Bezahlt" wird zeilenweit
   gesucht statt in einer festen Spalte.
   ============================================================================= */

/** Fallback-Spaltengrenzen (x-Positionen), falls keine Kopfzeile erkannt wird. */
const DEFAULT_BOUNDS = { nr:14, name:48, sitzplatz:145, handy:271, abfahrtsort:368, ticket:429, skat:476, sondergepaeck:542, camp:668, offen:707, kommentar:755, end:822 };

/** Reihenfolge der logischen Spalten (links → rechts). */
const COLS = ['nr','name','sitzplatz','handy','abfahrtsort','ticket','skat','sondergepaeck','camp','offen','kommentar'];

/** Kanonische Spalte → mögliche Kopf-Beschriftungen (Varianten werden toleriert). */
const LABELMAP = [
  ['name',         /^Name$/i],
  ['sitzplatz',    /Unterschrift|Sitzplatz/i],
  ['handy',        /^Handy$/i],
  ['abfahrtsort',  /Abfahrt/i],                       // AbfahrtOrt / Abfahrtsort
  ['ticket',       /^Ticket$/i],
  ['skat',         /Skat|Geburtstag|GB/i],
  ['sondergepaeck',/Sondergep|Beutel|Extras|Gep(a|ä)ck/i],
  ['camp',         /Camp/i],
  ['offen',        /Offen/i],                          // Offen / Offen?
  ['kommentar',    /Kommentar/i],
];

/** Namen säubern: Bindestrich-Umbrüche zusammenführen, Mehrfach-Leerzeichen weg. */
function cleanName(s) {
  return (s || '').replace(/-\s+/g, '-').replace(/\s+/g, ' ').trim();
}

/** Ist diese Zeile die Tabellen-Kopfzeile? (Enthält exakt „Handy" UND „Name".) */
function isHeaderRow(row) {
  return row.some(i => /^Handy$/i.test(i.s)) && row.some(i => /^Name$/i.test(i.s));
}

/**
 * Spaltengrenzen aus der Kopfzeile ableiten.
 * Für jede Kopf-Beschriftung wird die x-Position gemerkt (minus kleiner Puffer).
 * @returns {object|null} bounds-Objekt oder null, wenn keine Kopfzeile gefunden
 */
function detectHeaderBounds(rows) {
  for (let ri = 0; ri < rows.length; ri++) {
    const r = rows[ri];
    if (!isHeaderRow(r)) continue;
    // Umbrochene Labels (z. B. „Unterschrift/Sitzpla" + „tz" auf zwei Zeilen)
    // landen in Nachbarzeilen → für die Label-Suche mit einbeziehen.
    const headerY = r[0].y;
    const near = [];
    [rows[ri - 1], rows[ri + 1]].forEach(nr => {
      if (nr && nr.length && Math.abs(nr[0].y - headerY) <= 24) near.push.apply(near, nr);
    });
    const cand = r.concat(near);
    const b = { nr: 14 };
    for (const [key, re] of LABELMAP) {
      const it = cand.find(i => re.test(i.s.trim()));
      if (it && b[key] == null) b[key] = Math.round(it.x) - 3;
    }
    b.end = Math.round(Math.max.apply(null, r.map(i => i.x))) + 90;
    // Nur akzeptieren, wenn die beiden Pflichtspalten erkannt wurden.
    if (b.name != null && b.handy != null) {
      if (b.name <= b.nr) b.nr = Math.max(0, b.name - 24); // Nummer-Spalte links vom Namen halten
      // Unterschrift-Spalte notfalls schätzen (liegt zwischen Name und Handy) –
      // sonst würden Unterschrift & Sitzplatz später mit NaN-Koordinaten gestempelt.
      if (b.sitzplatz == null) b.sitzplatz = Math.max(b.name + 60, b.handy - 105);
      return b;
    }
  }
  return null;
}

/**
 * Text-Fragmente zu Zeilen gruppieren (nach y-Position, mit Toleranz).
 * Innerhalb einer Zeile nach x sortiert (links → rechts).
 */
function groupRows(items, tol) {
  tol = tol || 8;
  const sorted = items.filter(i => i.s.trim() !== '').slice().sort((a, b) => b.y - a.y); // oben zuerst
  const rows = [];
  let cur = [], curY = null;
  for (const it of sorted) {
    if (curY === null || Math.abs(it.y - curY) <= tol) {
      cur.push(it);
      curY = curY === null ? it.y : (curY + it.y) / 2;
    } else {
      rows.push(cur);
      cur = [it];
      curY = it.y;
    }
  }
  if (cur.length) rows.push(cur);
  return rows.map(r => r.sort((a, b) => a.x - b.x));
}

/**
 * Eine Zeile in Spalten-Zellen aufteilen. Jedes Fragment landet in der am
 * weitesten rechts liegenden Spalte, deren Grenze ≤ x ist (robust gegen fehlende
 * oder vertauschte Spalten – deshalb wird `present` nach x sortiert).
 */
function rowToCells(row, bounds) {
  const cells = {};
  COLS.forEach(c => cells[c] = '');
  const present = COLS.filter(c => bounds[c] != null).sort((a, b) => bounds[a] - bounds[b]);
  for (const it of row) {
    let col = present[0];
    for (const c of present) { if (it.x >= bounds[c] - 2) col = c; }
    cells[col] = (cells[col] ? cells[col] + ' ' : '') + it.s.trim();
  }
  COLS.forEach(c => cells[c] = cells[c].replace(/\s+/g, ' ').trim());
  return cells;
}

/**
 * Hauptfunktion: Seiten (pdf.js-Fragmente) → Teilnehmer + Buchungen + Meta.
 * @param {Array} pages
 * @returns {{participants:Array, bookings:Array, meta:object}}
 */
export function parseTeilnehmer(pages) {
  let bounds = null;
  const participants = [];
  const bookings = [];
  const warnings = [];
  let pending = '';   // ggf. umgebrochener Bucher-Name, der noch keiner Zeile zugeordnet ist
  let cur = null;     // aktuelle Buchung
  let bid = 0;        // fortlaufende Buchungs-ID

  for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
    const rows = groupRows(pages[pageIndex].items);
    const hb = detectHeaderBounds(rows);
    if (hb) bounds = hb;                 // Kopfzeile gefunden → Grenzen für Folgeseiten übernehmen
    const B = bounds || DEFAULT_BOUNDS;

    for (const row of rows) {
      if (isHeaderRow(row)) continue;    // Kopfzeile überspringen (in JEDEM Layout)
      const c = rowToCells(row, B);
      const joined = row.map(i => i.s).join(' ');
      if (/Skat|Geburtstag/i.test(joined) && c.name === '') continue; // Rest-Fragmente der Kopfzeile

      const isNum = /^\d{1,3}$/.test(c.nr);
      const isPaid = /bezahlt/i.test(joined);                          // Zahlung zeilenweit prüfen
      const handy = (c.handy || '').replace(/[^\d+]/g, '').replace(/(?!^)\+/g, ''); // nur Ziffern + führendes +
      const handyIsPhone = /\d{5,}/.test(handy);

      if (isNum) {
        // ---- Mitfahrer-Zeile (weiß, mit Nummer) ----
        const name = cleanName((pending ? pending + ' ' : '') + c.name);
        pending = '';
        if (!cur) { cur = { id: ++bid, bucher: '', handy: '', paid: false }; bookings.push(cur); }
        participants.push({
          nr: parseInt(c.nr, 10), name, handy,
          abfahrtsort: c.abfahrtsort, ticket: c.ticket, skat: c.skat, sondergepaeck: c.sondergepaeck,
          camp: /ja/i.test(c.camp), kommentar: c.kommentar,
          buchungId: cur.id, bucher: cur.bucher, istBucher: false, bezahlt: cur.paid,
          anwesend: false, rueckAnwesend: false, sitzplatz: '', signature: null, status: '', manuell: false,
          // Für das spätere Stempeln in die Original-Liste: Seite, y und x-Bereich der Unterschriftsspalte
          page: pageIndex, y: Math.round(row[0].y), sx0: Math.round(B.sitzplatz), sx1: Math.round(B.handy),
        });
      } else {
        // ---- evtl. Bucher-Zeile (dunkel, ohne Nummer) ----
        const signal = handyIsPhone || isPaid; // echtes Signal für eine neue Buchung
        if (signal) {
          const name = cleanName((pending ? pending + ' ' : '') + c.name);
          pending = '';
          cur = { id: ++bid, bucher: name, handy: handyIsPhone ? handy : '', paid: isPaid };
          bookings.push(cur);
        } else if (c.name) {
          // Weder Nummer noch Signal → vermutlich umgebrochener Name; für nächste Zeile merken.
          pending = cleanName((pending ? pending + ' ' : '') + c.name);
        }
      }
    }
  }

  // Bucher-Infos von der Buchung auf ihre Mitfahrer übertragen.
  const bmap = {};
  bookings.forEach(b => bmap[b.id] = b);
  for (const p of participants) {
    const b = bmap[p.buchungId];
    if (b) { p.bucher = b.bucher; p.bezahlt = b.paid; p.istBucher = !!(b.bucher && p.name === b.bucher); }
  }

  // Nur Buchungen behalten, die tatsächlich Mitfahrer haben.
  const used = {};
  participants.forEach(p => used[p.buchungId] = 1);
  const realB = bookings.filter(b => used[b.id]);

  // Plausibilitätsprüfung der laufenden Nummern (fehlende / doppelte).
  const nums = participants.map(p => p.nr);
  const min = nums.length ? Math.min.apply(null, nums) : 0;
  const max = nums.length ? Math.max.apply(null, nums) : 0;
  const missing = [];
  const seen = {};
  for (let n = min; n <= max; n++) if (nums.indexOf(n) < 0) missing.push(n);
  const dups = nums.filter(n => { seen[n] = (seen[n] || 0) + 1; return seen[n] === 2; });
  if (missing.length) warnings.push('Fehlende Nummern: ' + missing.join(', '));
  if (dups.length) warnings.push('Doppelte Nummern: ' + dups.join(', '));

  return {
    participants, bookings: realB,
    meta: {
      count: participants.length, min, max, missing, dups,
      bookingCount: realB.length, offen: realB.filter(b => !b.paid).length,
      warnings, bounds: (bounds || DEFAULT_BOUNDS),
    },
  };
}

/**
 * Tippfehler-Vorschläge für laufende Nummern.
 * Findet eine DOPPELTE Nummer, die laut Dokument-Reihenfolge exakt in einer
 * fortlaufenden Lücke sitzt (z. B. zweite „28" zwischen 37 und 39 → 38).
 * @returns {Array<{p:object, from:number, to:number}>}
 */
export function nrSuggestions(parts) {
  parts = parts || [];
  const nrs = parts.map(x => x.nr);
  const ordered = parts
    .filter(x => x.page != null && typeof x.y === 'number')
    .slice()
    .sort((a, b) => (a.page - b.page) || (b.y - a.y)); // Dokument-Reihenfolge
  const out = [];
  for (let i = 1; i < ordered.length - 1; i++) {
    const p = ordered[i];
    if (nrs.filter(n => n === p.nr).length < 2) continue;   // nur doppelte Nummern
    const exp = ordered[i - 1].nr + 1;
    if (exp === p.nr || ordered[i + 1].nr !== exp + 1) continue; // muss exakt zwischen k und k+2 liegen
    if (nrs.indexOf(exp) >= 0) continue;                    // erwartete Nummer muss aktuell fehlen
    out.push({ p, from: p.nr, to: exp });
  }
  return out;
}
