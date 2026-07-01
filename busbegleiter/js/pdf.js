/* =============================================================================
   pdf.js – PDF lesen (Import) & schreiben (Export)
   -----------------------------------------------------------------------------
   Nutzt drei geräteintern gebündelte Bibliotheken (globale Objekte, in index.html
   als klassische <script> geladen):
     • window.pdfjsLib  – Text aus der Teilnehmerliste extrahieren (Import)
     • window.PDFLib    – in die Original-Formulare stempeln (Export)
     • window.jspdf     – Tabellen-Fallback, falls keine Original-PDF vorliegt

   Export erzeugt IMMER drei Dateien (Checkliste+Teilnehmer / Auslagen / Einnahmen)
   und teilt sie zusammen über die Web-Share-API (z. B. an WeTransfer).
   ============================================================================= */

import { CHECK_HIN, CHECK_RUECK, APP } from './config.js';
import { state, T, ui, save } from './state.js';
import { toast, elFromHTML, $ } from './dom.js';
import { esc, money, sumItems, fmtDate, busTagOf, evTagOf, eurTag, safeTag, abToB64, b64ToBytes, dataURLToBytes } from './util.js';
import { parseTeilnehmer, nrSuggestions } from './parser.js';
import { openSheet } from './overlay.js';
import { render } from './app.js';
import { openNewTrip } from './views-trips.js';

// pdf.js braucht einen Worker – lokal gebündelt, damit es offline funktioniert.
if (window.pdfjsLib) pdfjsLib.GlobalWorkerOptions.workerSrc = './assets/vendor/pdf.worker.min.js';

/* ---------- Formular-Vorlage (lokales Asset, einmal geladen & gemerkt) ---------- */
let _formBytes = null;
async function formTemplateBytes() {
  if (_formBytes) return _formBytes;
  const res = await fetch(APP.formTemplateUrl);
  if (!res.ok) throw new Error('Formular-Vorlage nicht ladbar');
  _formBytes = new Uint8Array(await res.arrayBuffer());
  return _formBytes;
}

/* =========================== IMPORT (Liste einlesen) =========================== */

/** Teilnehmerliste (PDF) einlesen, parsen und in die aktive Fahrt übernehmen. */
export async function doImport(file) {
  if (!T()) { openNewTrip(); toast('Erst eine Fahrt anlegen'); return; }
  if (!window.pdfjsLib) { toast('PDF-Bibliothek lädt noch – kurz warten'); return; }
  toast('Lese PDF …');
  try {
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf);
    const b64 = abToB64(u8); // Original-PDF merken → später bestempeln
    const doc = await pdfjsLib.getDocument({ data: u8.slice() }).promise;
    const pages = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const tc = await page.getTextContent();
      pages.push({ items: tc.items.filter(t => t.str.trim() !== '').map(t => ({ s: t.str, x: t.transform[4], y: t.transform[5] })) });
    }
    const { participants, bookings, meta } = parseTeilnehmer(pages);
    if (!participants.length) { toast('Keine Teilnehmer erkannt – ist es die richtige Liste?'); return; }

    // Bereits erfasste Check-ins/Sitzplätze/Unterschriften beim Re-Import erhalten.
    const t = T();
    const prev = {};
    t.participants.forEach(p => prev[p.nr] = p);
    participants.forEach(p => { const o = prev[p.nr]; if (o) { p.anwesend = o.anwesend; p.sitzplatz = o.sitzplatz; p.signature = o.signature; } });

    t.participants = participants; t.bookings = bookings; t.pdfData = b64; t.pdfName = file.name; t.bounds = meta.bounds;
    const fn = file.name.replace(/\.pdf$/i, '');
    const bus = (fn.match(/Bus\s*0?(\d+)/i) || [])[1];
    if (bus && !t.busNr) t.busNr = bus;
    t.importedAt = new Date().toISOString();
    save();

    let msg = participants.length + ' Teilnehmer · ' + meta.bookingCount + ' Buchungen' + (meta.offen ? (' · ' + meta.offen + ' offen') : ' · alle bezahlt');
    if (meta.warnings.length) msg += ' ⚠';
    ui().tab = 'teilnehmer'; render();
    setTimeout(() => toast(msg), 300);

    // Tippfehler in den Nummern? → bestätigbaren Korrektur-Dialog zeigen, sonst schlichter Hinweis.
    const sugs = nrSuggestions(participants);
    if (sugs.length) setTimeout(() => showImportNrFixes(sugs, meta.warnings.join(' · ')), 600);
    else if (meta.warnings.length) setTimeout(() => alert('Hinweis beim Import:\n' + meta.warnings.join('\n') + '\n\nBitte diese Nummern manuell prüfen.'), 600);
  } catch (err) { console.error(err); toast('Fehler beim Lesen der PDF'); }
}

/** Bestätigungs-Sheet für vorgeschlagene Nummern-Korrekturen (z. B. 28 → 38). */
export function showImportNrFixes(sugs, otherText) {
  const n = elFromHTML('<div></div>');
  const rows = sugs.map((s, i) =>
    '<label style="display:flex;align-items:center;gap:10px;padding:9px 2px;border-bottom:1px solid var(--line)">' +
    '<input type="checkbox" data-i="' + i + '" checked style="width:20px;height:20px;flex:0 0 auto">' +
    '<span>Nr. <b>' + s.from + '</b> · ' + esc(s.p.name) + ' &nbsp;→&nbsp; <b>' + s.to + '</b></span></label>').join('');
  n.innerHTML =
    '<h2>⚠️ Nummern prüfen</h2>' +
    '<p class="tiny muted" style="margin:0 0 12px">Eine Nummer kommt doppelt vor und sitzt laut Reihenfolge genau in einer Lücke – das sieht nach einem Tippfehler in der Liste aus. Vorschlag zum Korrigieren:</p>' +
    rows +
    (otherText ? ('<div class="note" style="margin-top:12px">' + esc(otherText) + '<br><span class="tiny">Nach dem Übernehmen sollte das passen – sonst im Detail manuell anpassen.</span></div>') : '') +
    '<button class="btn" id="fixApply" style="margin-top:14px">✓ Ausgewählte übernehmen</button>' +
    '<button class="btn sec" id="fixSkip" style="margin-top:8px">Später / manuell</button>';
  const bg = openSheet(n);
  n.querySelector('#fixApply').onclick = () => {
    let cnt = 0;
    [...n.querySelectorAll('input[data-i]')].forEach(b => { if (b.checked) { const s = sugs[+b.dataset.i]; s.p.nr = s.to; cnt++; } });
    save(); render(); bg._close();
    toast(cnt ? (cnt + ' Nummer(n) korrigiert ✓') : 'Nichts geändert');
  };
  n.querySelector('#fixSkip').onclick = () => bg._close();
}

/* =========================== EXPORT (3 PDFs erstellen) =========================== */

/**
 * Haupt-Export. Erstellt drei PDFs:
 *   1) Original-Teilnehmerliste (mit Unterschriften/Sitzplätzen gestempelt)
 *      + Bus-Checkliste (+ Namensänderungen), oder Tabellen-Fallback.
 *   2) Auslagenerstattung (+ angehängte Belege)
 *   3) Einnahmebeleg (+ angehängte Belege)
 * und teilt sie zusammen (Web-Share) bzw. lädt sie einzeln herunter.
 *
 * Die vielen Zahlen in den stamp*-Funktionen sind KALIBRIERTE Koordinaten,
 * damit der Text exakt auf den Linien der Original-Formulare landet.
 */
export async function generatePDF() {
  const t = T(); if (!t) return;
  if (!window.PDFLib || !window.jspdf) { toast('PDF-Bibliotheken laden noch – kurz warten'); return; }
  if (!t.pdfData) {
    if (confirm('Für diese Fahrt ist keine Original-Teilnehmerliste gespeichert.\n\nJetzt importieren, um die Original-Liste mit Unterschrift & Sitzplatz zu erzeugen?\n\nOK = importieren  ·  Abbrechen = als Tabelle exportieren')) { $('#pdfInput').click(); return; }
  }
  toast('Erstelle 3 PDFs …');
  const { jsPDF } = window.jspdf;
  const { PDFDocument, StandardFonts, rgb } = window.PDFLib;
  const f = t.forms;
  const k = state.settings.konto;
  const col = rgb(0.05, 0.16, 0.30), red = rgb(0.62, 0.18, 0.12);
  const cur = v => v ? money(parseFloat((v || '').replace(',', '.')) || 0) : '';

  // Formular-Vorlage laden (lokales Asset). Klappt es nicht → Tabellen-Fallback.
  let formDoc = null;
  try { formDoc = await PDFDocument.load(await formTemplateBytes()); } catch (e) { formDoc = null; }

  // Text-Platzierungs-Helfer (y in pdf-lib von UNTEN, deshalb getHeight()-...):
  const dT = (pg, x, top, text, size, font, c) => { pg.drawText(String(text == null ? '' : text), { x, y: pg.getHeight() - top - size, size, font, color: c || col }); };       // roh (top-links)
  const oL = (pg, x, L, text, size, font, c) => { pg.drawText(String(text == null ? '' : text), { x, y: pg.getHeight() - L + 2, size, font, color: c || col }); };                 // Grundlinie 2pt über Linie L
  const aL = (pg, x, Tp, text, size, font, c) => { pg.drawText(String(text == null ? '' : text), { x, y: pg.getHeight() - (Tp + 9), size, font, color: c || col }); };             // Grundlinie an Label-Oberkante+9
  async function copyFormPage(target, idx) { const cp = await target.copyPages(formDoc, [idx]); target.addPage(cp[0]); return cp[0]; }

  // Feste Zeilen-Positionen der Original-Formulare:
  const ALINES = [200, 223, 246, 270, 293, 316, 339, 362, 385, 408];                 // Auslagen-Zeilen
  const ELINES = [195, 217, 238, 259, 280, 302, 323];                                // Einnahmen-Zeilen
  const NLINES = [497, 519, 540, 561, 582, 604, 625, 646];                           // No-Show-Zeilen
  const eventBus = () => (t.name || '') + ' - ' + busTagOf(t);

  // --- Formular 1: Auslagenerstattung ---
  function stampAuslagen(pg, font, fontB) {
    oL(pg, 252, 108, eventBus(), 9, font);
    f.auslagen.items.forEach((it, i) => { if (i >= ALINES.length) return; oL(pg, 56, ALINES[i], it.firma || '', 10, font); oL(pg, 432, ALINES[i], cur(it.betrag), 10, font); });
    aL(pg, 432, 423, money(sumItems(f.auslagen.items)), 11, fontB);
    oL(pg, 152, 522, k.inhaber || '', 10, font); oL(pg, 152, 545, k.iban || '', 10, font); oL(pg, 152, 569, k.bank || '', 10, font); oL(pg, 152, 592, money(sumItems(f.auslagen.items)), 10, font);
  }
  // --- Formular 2: Einnahmebeleg ---
  function stampEinnahmen(pg, font, fontB) {
    oL(pg, 300, 57, (state.settings.betreuer || '') + ' · ' + (t.name || '') + ' · Bus ' + (t.busNr || ''), 9, font);
    dT(pg, 438, f.einnahmen.bar ? 114 : 91, 'X', 11, fontB);
    f.einnahmen.items.forEach((it, i) => { if (i >= ELINES.length) return; oL(pg, 56, ELINES[i], it.text || '', 10, font); oL(pg, 466, ELINES[i], cur(it.betrag), 10, font); });
    aL(pg, 466, 335, money(sumItems(f.einnahmen.items)), 11, fontB);
    f.noshows.forEach((nn, i) => { if (i >= NLINES.length) return; oL(pg, 56, NLINES[i], (nn.name || '') + '  ·  ' + (nn.einstieg || '') + '  ·  Nr ' + (nn.nr || ''), 10, font); });
    dT(pg, f.tickets.uebrig ? 386 : 263, 681, 'X', 11, fontB); if (f.tickets.uebrig) oL(pg, 466, 693, f.tickets.uebrigAnzahl || '', 10, font);
    dT(pg, f.tickets.weitergeben ? 386 : 263, 720, 'X', 11, fontB); if (f.tickets.weiterAn) oL(pg, 60, 770, f.tickets.weiterAn, 9, font);
  }
  // --- Formular 3: Bus-Checkliste ---
  const HIN_Y = [50, 70, 89, 109, 128, 148, 167, 187, 206, 226, 246, 265, 285], RUECK_Y = [376, 395, 415];
  function stampCheckliste(pg, font) {
    CHECK_HIN.forEach((l, i) => aL(pg, 216, HIN_Y[i], (f.checkHin[l] || (i === 0 ? eventBus() : '')), 11, font));
    CHECK_RUECK.forEach((l, i) => aL(pg, 216, RUECK_Y[i], f.checkRueck[l] || '', 11, font));
    if (f.bemerkungen) { const bls = [506, 532, 557]; let rem = f.bemerkungen; for (let i = 0; i < 3 && rem; i++) { aL(pg, 40, bls[i] - 3, rem.slice(0, 70), 10, font); rem = rem.slice(70); } }
  }
  // --- Formular 4: Namensänderungen & Neubucher (links alt, rechts neu) ---
  const NBT = [51, 158, 265, 372, 479], NOFF = { nr: 0, name: 14, strasse: 29, plzort: 43, geb: 58, handy: 72, email: 87 };
  function stampNamen(pg, font) {
    f.aenderungen.forEach((e, i) => {
      if (i >= 5) return; const b = NBT[i]; const a = (x, off, v) => aL(pg, x, b + off - 3, v || '', 10, font);
      a(161, NOFF.nr, e.altNr); a(161, NOFF.name, e.altName); a(161, NOFF.strasse, e.altStrasse); a(161, NOFF.plzort, e.altPlzOrt); a(161, NOFF.geb, e.altGeb); a(161, NOFF.handy, e.altHandy); a(161, NOFF.email, e.altEmail);
      a(544, NOFF.nr, e.neuNr); a(544, NOFF.name, e.neuName); a(544, NOFF.strasse, e.neuStrasse); a(544, NOFF.plzort, e.neuPlzOrt); a(544, NOFF.geb, e.neuGeb); a(544, NOFF.handy, e.neuHandy); a(544, NOFF.email, e.neuEmail);
    });
  }

  // Unterschriften + Sitzplätze in die ORIGINAL-Teilnehmerliste stempeln.
  async function stampList(doc) {
    const font = await doc.embedFont(StandardFonts.Helvetica);
    const pgs = doc.getPages();
    for (const p of t.participants) {
      if (p.page == null || !pgs[p.page]) continue;
      const pg = pgs[p.page];
      const cw = (p.sx1 - p.sx0) || 120;
      const cellBot = p.y - 3, cellH = 29; // weiße Teilnehmer-Zelle, Zeilenhöhe 29pt
      if (p.signature) { try { const png = await doc.embedPng(p.signature); const maxH = 26, maxW = cw - 30; let h = maxH, w = (png.width / png.height) * h; if (w > maxW) { w = maxW; h = (png.height / png.width) * w; } pg.drawImage(png, { x: p.sx0 + 3, y: cellBot + (cellH - h) / 2, width: w, height: h }); } catch (e) {} }
      if (p.sitzplatz) { try { pg.drawText(p.sitzplatz, { x: p.sx1 - 22, y: cellBot + 9, size: 11, font, color: col }); } catch (e) {} }
      if (!p.signature && p.status) { try { pg.drawText(p.status === 'abgemeldet' ? 'abgemeldet' : 'nicht angetreten', { x: p.sx0 + 4, y: cellBot + 10, size: 8, font, color: red }); } catch (e) {} }
    }
    // Nachträglich manuell hinzugefügte Teilnehmer unten anhängen.
    const man = t.participants.filter(p => p.manuell);
    if (man.length && t.bounds) {
      const B = t.bounds; const lastIdx = pgs.length - 1; let pg = pgs[lastIdx];
      const onLast = t.participants.filter(p => !p.manuell && p.page === lastIdx);
      let y = onLast.length ? Math.min.apply(null, onLast.map(p => p.y)) - 26 : pg.getHeight() - 80;
      for (const p of man) {
        if (y < 34) { pg = doc.addPage([pg.getWidth(), pg.getHeight()]); y = pg.getHeight() - 50; pg.drawText('Nachträgliche Teilnehmer', { x: B.nr, y: y + 16, size: 10, font, color: col }); }
        try {
          pg.drawText(String(p.nr), { x: B.nr + 2, y, size: 9, font, color: col });
          pg.drawText(p.name || '', { x: B.name + 2, y, size: 9, font, color: col });
          if (p.handy) pg.drawText(p.handy, { x: B.handy + 2, y, size: 8, font, color: col });
          if (p.abfahrtsort) pg.drawText(p.abfahrtsort, { x: B.abfahrtsort + 2, y, size: 8, font, color: col });
          if (p.ticket) pg.drawText(p.ticket, { x: B.ticket + 2, y, size: 8, font, color: col });
          if (p.camp) pg.drawText('Ja', { x: B.camp + 2, y, size: 8, font, color: col });
          if (p.signature) { const png = await doc.embedPng(p.signature); const cw = (B.handy - B.sitzplatz) || 120; const maxH = 24, maxW = cw - 30; let h = maxH, w = (png.width / png.height) * h; if (w > maxW) { w = maxW; h = (png.height / png.width) * w; } pg.drawImage(png, { x: B.sitzplatz + 3, y: y - 7, width: w, height: h }); }
          else if (p.sitzplatz) pg.drawText(p.sitzplatz, { x: B.handy - 22, y, size: 10, font, color: col });
          if (!p.signature && p.status) pg.drawText(p.status === 'abgemeldet' ? 'abgemeldet' : 'nicht angetr.', { x: B.sitzplatz + 3, y, size: 8, font, color: red });
        } catch (e) {}
        y -= 26;
      }
    }
  }

  // Fallback-Teilnehmerliste als jsPDF-Tabelle (wenn keine Original-PDF vorliegt).
  function tableDoc() {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' }); const W = doc.internal.pageSize.getWidth();
    doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(t.name || 'Feierreisen Fahrt', 40, 44);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90);
    doc.text('Bus ' + (t.busNr || '—') + '   ·   ' + (fmtDate(t.datum) || '') + '   ·   Begleiter: ' + (state.settings.betreuer || '—'), 40, 62); doc.setTextColor(20);
    doc.autoTable({ startY: 76, head: [['Nr', 'Name', 'Sitz', 'Anw.', 'Zahlung', 'Bucher', 'Abfahrt', 'Camp', 'Handy']], body: t.participants.slice().sort((a, b) => a.nr - b.nr).map(p => [p.nr, p.name + (p.manuell ? ' *' : ''), p.sitzplatz || '', p.anwesend ? 'Ja' : '—', p.bezahlt ? 'Bezahlt' : 'OFFEN', p.istBucher ? '(selbst)' : p.bucher, p.abfahrtsort || '', p.camp ? 'Ja' : '', p.handy || '']), styles: { fontSize: 8, cellPadding: 3 }, headStyles: { fillColor: [14, 124, 102] }, columnStyles: { 0: { cellWidth: 20 }, 1: { cellWidth: 92 }, 2: { cellWidth: 26 }, 3: { cellWidth: 24 }, 4: { cellWidth: 44 }, 5: { cellWidth: 80 } }, didParseCell: dd => { if (dd.section === 'body' && dd.column.index === 4 && dd.cell.raw === 'OFFEN') { dd.cell.styles.textColor = [183, 121, 31]; dd.cell.styles.fontStyle = 'bold'; } } });
    const signed = t.participants.filter(p => p.signature).sort((a, b) => a.nr - b.nr);
    if (signed.length) { doc.addPage(); let yy = 44; doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.text('Unterschriften', 40, yy); yy += 14; doc.setFont('helvetica', 'normal'); doc.setFontSize(9); const cw = (W - 80) / 2, ch = 70; let c2 = 0; signed.forEach(p => { if (yy + ch > doc.internal.pageSize.getHeight() - 40) { doc.addPage(); yy = 44; } const x = 40 + c2 * cw; doc.setDrawColor(210); doc.rect(x, yy, cw - 10, ch); doc.setTextColor(60); doc.text('Nr ' + p.nr + '  ' + p.name, x + 5, yy + 13, { maxWidth: cw - 20 }); try { doc.addImage(p.signature, 'PNG', x + 6, yy + 18, cw - 22, ch - 26); } catch (e) {} c2++; if (c2 === 2) { c2 = 0; yy += ch + 12; } }); }
    return doc.output('arraybuffer');
  }

  // Fallback-Formulare (Checkliste / Auslagen / Einnahmen) als jsPDF.
  function fbDoc(kind) {
    const doc = new jsPDF({ unit: 'pt', format: 'a4' }); const W = doc.internal.pageSize.getWidth();
    if (kind === 'check') {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text('Bus-Checkliste', 40, 44);
      doc.autoTable({ startY: 58, head: [['Hinfahrt', 'Eintrag']], body: CHECK_HIN.map(l => [l, f.checkHin[l] || '']), styles: { fontSize: 9 }, headStyles: { fillColor: [14, 124, 102] }, columnStyles: { 0: { cellWidth: 230 } } });
      let yy = doc.lastAutoTable.finalY + 12; doc.autoTable({ startY: yy, head: [['Rückfahrt', 'Eintrag']], body: CHECK_RUECK.map(l => [l, f.checkRueck[l] || '']), styles: { fontSize: 9 }, headStyles: { fillColor: [14, 124, 102] }, columnStyles: { 0: { cellWidth: 230 } } });
      if (f.bemerkungen) { yy = doc.lastAutoTable.finalY + 14; doc.setFont('helvetica', 'bold'); doc.text('Bemerkungen', 40, yy); doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.text(doc.splitTextToSize(f.bemerkungen, W - 80), 40, yy + 14); }
    } else if (kind === 'aus') {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('Auslagenerstattung', 40, 44);
      doc.autoTable({ startY: 64, head: [['Firma / wofür', 'Beleg', 'Betrag']], body: (f.auslagen.items.length ? f.auslagen.items : [{ firma: '', betrag: '' }]).map(i => [i.firma || '', i.beleg ? 'angehängt' : '', cur(i.betrag)]), headStyles: { fillColor: [14, 124, 102] }, foot: [['GESAMT', '', money(sumItems(f.auslagen.items))]], footStyles: { fillColor: [235, 238, 240], textColor: 20, fontStyle: 'bold' } });
      let yy = doc.lastAutoTable.finalY + 18; doc.setFontSize(11); doc.text('Zu erstatten an: ' + (k.inhaber || '—'), 40, yy); yy += 15; doc.text('IBAN: ' + (k.iban || '—'), 40, yy); yy += 15; doc.text('Bank: ' + (k.bank || '—'), 40, yy);
    } else {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text('Einnahmebeleg', 40, 44); doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.text('Bareinnahmen im Bus: ' + (f.einnahmen.bar ? 'Ja' : 'Nein'), 40, 68);
      doc.autoTable({ startY: 82, head: [['Kunde · Einstieg · Nr.', 'Beleg', 'Betrag']], body: (f.einnahmen.items.length ? f.einnahmen.items : [{ text: '', betrag: '' }]).map(i => [i.text || '', i.beleg ? 'angehängt' : '', cur(i.betrag)]), headStyles: { fillColor: [14, 124, 102] }, foot: [['GESAMT', '', money(sumItems(f.einnahmen.items))]], footStyles: { fillColor: [235, 238, 240], textColor: 20, fontStyle: 'bold' } });
      let yy = doc.lastAutoTable.finalY + 16; doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('No-Shows', 40, yy);
      doc.autoTable({ startY: yy + 8, head: [['Name', 'Einstieg', 'Nr.']], body: (f.noshows.length ? f.noshows : [{ name: '', einstieg: '', nr: '' }]).map(i => [i.name || '', i.einstieg || '', i.nr || '']), headStyles: { fillColor: [120, 120, 120] } });
      yy = doc.lastAutoTable.finalY + 16; doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.text('Tickets übrig: ' + (f.tickets.uebrig ? ('Ja (' + (f.tickets.uebrigAnzahl || '?') + ')') : 'Nein') + '   Weitergeben: ' + (f.tickets.weitergeben ? 'Ja' : 'Nein'), 40, yy);
    }
    return doc.output('arraybuffer');
  }

  // Belege (Bilder/PDFs) an ein Dokument anhängen.
  async function withReceipts(doc, items, prefix) {
    let font = null;
    for (let i = 0; i < items.length; i++) {
      const it = items[i]; if (!it.beleg) continue; const bl = it.beleg;
      try {
        if (bl.type === 'pdf') { const rd = await PDFDocument.load(dataURLToBytes(bl.data)); const cp = await doc.copyPages(rd, rd.getPageIndices()); cp.forEach(pg => doc.addPage(pg)); }
        else { if (!font) font = await doc.embedFont(StandardFonts.Helvetica); const bytes = dataURLToBytes(bl.data); let img; try { img = await doc.embedJpg(bytes); } catch (e) { img = await doc.embedPng(bytes); } const page = doc.addPage([595, 842]); const r = Math.min(515 / img.width, 690 / img.height, 1); const w = img.width * r, h = img.height * r; page.drawText('Beleg ' + prefix + ': ' + (it.firma || it.text || ('#' + (i + 1))), { x: 40, y: 800, size: 11, font }); page.drawImage(img, { x: 40, y: 780 - h, width: w, height: h }); }
      } catch (e) {}
    }
    return doc;
  }

  try {
    const nameCL = busTagOf(t) + '_' + evTagOf(t) + '_Checkliste_Teilnehmer.pdf';
    const nameAus = busTagOf(t) + '_' + evTagOf(t) + '_Auslagen_' + eurTag(sumItems(f.auslagen.items)) + '.pdf';
    const nameEin = busTagOf(t) + '_' + evTagOf(t) + '_' + (safeTag(state.settings.betreuer) || 'Begleiter') + '_Einnahmen_' + eurTag(sumItems(f.einnahmen.items)) + '.pdf';

    // DATEI 1: Teilnehmerliste + Bus-Checkliste (+ Namensänderungen)
    let doc1;
    if (t.pdfData) { doc1 = await PDFDocument.load(b64ToBytes(t.pdfData)); await stampList(doc1); }
    else { doc1 = await PDFDocument.load(tableDoc()); }
    if (formDoc) {
      const cf = await doc1.embedFont(StandardFonts.Helvetica);
      const clp = await copyFormPage(doc1, 2); stampCheckliste(clp, cf);
      // Vier Unterschriften auf der Checkliste (Hin/Rück × Begleiter/Fahrer).
      const SIGL = { hinBegleiter: [178, 304, 311], hinFahrer: [314, 385, 311], rueckBegleiter: [178, 304, 442], rueckFahrer: [313, 385, 442] };
      for (const kk in SIGL) { const sd = (f.checkSig || {})[kk]; if (!sd) continue; const x0 = SIGL[kk][0], x1 = SIGL[kk][1], top = SIGL[kk][2]; try { const sp = await doc1.embedPng(sd); const maxH = 18, maxW = (x1 - x0) - 4; let hh = maxH, ww = (sp.width / sp.height) * hh; if (ww > maxW) { ww = maxW; hh = (sp.height / sp.width) * ww; } clp.drawImage(sp, { x: x0 + 2, y: clp.getHeight() - (top + 9) + 1, width: ww, height: hh }); } catch (e) {} }
      if (f.aenderungen && f.aenderungen.length) stampNamen(await copyFormPage(doc1, 3), cf);
    } else {
      const cb = await PDFDocument.load(fbDoc('check')); const cp = await doc1.copyPages(cb, cb.getPageIndices()); cp.forEach(pg => doc1.addPage(pg));
    }
    /* Tourbericht bewusst NICHT im PDF – wird separat per Copy & Paste verschickt (z. B. WeTransfer-Notiz). */

    // DATEI 2: Auslagen
    let doc2;
    if (formDoc) { doc2 = await PDFDocument.create(); const fa = await doc2.embedFont(StandardFonts.Helvetica); const fab = await doc2.embedFont(StandardFonts.HelveticaBold); stampAuslagen(await copyFormPage(doc2, 0), fa, fab); }
    else { doc2 = await PDFDocument.load(fbDoc('aus')); }
    await withReceipts(doc2, f.auslagen.items, 'Auslage');

    // DATEI 3: Einnahmen
    let doc3;
    if (formDoc) { doc3 = await PDFDocument.create(); const fe = await doc3.embedFont(StandardFonts.Helvetica); const feb = await doc3.embedFont(StandardFonts.HelveticaBold); stampEinnahmen(await copyFormPage(doc3, 1), fe, feb); }
    else { doc3 = await PDFDocument.load(fbDoc('ein')); }
    await withReceipts(doc3, f.einnahmen.items, 'Einnahme');

    // Zusammen teilen (Web-Share) oder einzeln herunterladen.
    const files = [
      new File([await doc1.save()], nameCL, { type: 'application/pdf' }),
      new File([await doc2.save()], nameAus, { type: 'application/pdf' }),
      new File([await doc3.save()], nameEin, { type: 'application/pdf' }),
    ];
    if (navigator.canShare && navigator.canShare({ files })) {
      try { await navigator.share({ files }); toast('3 Dateien geteilt ✓'); return; }
      catch (e) { if (e && e.name === 'AbortError') return; }
    }
    for (const fo of files) { const url = URL.createObjectURL(fo); const a = document.createElement('a'); a.href = url; a.download = fo.name; document.body.appendChild(a); a.click(); a.remove(); await new Promise(r => setTimeout(r, 500)); setTimeout(() => URL.revokeObjectURL(url), 6000); }
    toast('3 PDFs gespeichert – in Files alle 3 wählen → Teilen → WeTransfer');
  } catch (err) { console.error(err); toast('Fehler beim Erstellen der PDFs'); }
}
