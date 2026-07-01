/* =============================================================================
   views-formulare.js – Formulare, Bus-Checkliste, Namensänderungen,
                        Tourbericht und Abschluss/Export
   ============================================================================= */

import { CHECK_HIN, CHECK_RUECK } from './config.js';
import { $, elFromHTML, toast, pickFile, fileToBeleg } from './dom.js';
import { esc, money, sumItems, busTagOf, evTagOf, eurTag, safeTag } from './util.js';
import { state, T, save } from './state.js';
import { openPage } from './overlay.js';
import { openSignaturePad } from './signature.js';
import { generatePDF } from './pdf.js';
import { openSettings } from './views-trips.js';

/* ---------- Formular-Übersicht ---------- */

export function viewFormulare() {
  const t = T();
  const d = elFromHTML('<div></div>');
  d.appendChild(elFromHTML('<div class="card" style="padding:12px 14px;margin-bottom:14px"><div class="field" style="margin-bottom:8px"><label>Event / Bustour</label><input id="mEvent" value="' + esc(t.name) + '"></div><div class="row" style="gap:8px"><div class="field" style="flex:1;margin:0"><label>Bus-Nr.</label><input id="mBus" value="' + esc(t.busNr) + '"></div><div class="field" style="flex:1;margin:0"><label>Datum</label><input id="mDate" type="date" value="' + esc(t.datum) + '"></div></div></div>'));
  // Abschnitt inline / als eigene Unterseite:
  const sec = (title, fn) => { const c = elFromHTML('<div class="card" style="margin-bottom:10px;padding:14px"></div>'); c.appendChild(elFromHTML('<div class="bold" style="margin-bottom:12px;font-size:15px">' + title + '</div>')); c.appendChild(fn()); d.appendChild(c); };
  const nav = (title, fn) => { const c = elFromHTML('<button class="card" style="display:flex;width:100%;justify-content:space-between;align-items:center;padding:16px 14px;margin-bottom:10px;text-align:left;font-size:15px"><span class="bold">' + title + ' ›</span><span style="color:var(--muted)">öffnen</span></button>'); c.onclick = () => openPage(title, fn()); d.appendChild(c); };
  sec('💶 Auslagenerstattung', renderAuslagen);
  sec('🧾 Einnahmebeleg', renderEinnahmen);
  sec('🚷 No-Shows (nicht erschienen)', renderNoshows);
  sec('🎟 Tickets übrig / weitergeben', renderTickets);
  nav('🚌 Bus-Checkliste', renderCheck);
  sec('✏️ Namensänderungen / Neubucher', renderNamen);
  d.querySelector('#mEvent').oninput = e => { t.name = e.target.value; save(); $('#hdrTitle').textContent = t.name || 'Feierreisen Busbegleiter'; };
  d.querySelector('#mBus').oninput = e => { t.busNr = e.target.value; save(); };
  d.querySelector('#mDate').oninput = e => { t.datum = e.target.value; save(); };
  return d;
}

/**
 * Wiederverwendbare Zeilen-Liste (Auslagen/Einnahmen/No-Shows).
 * @param {Array} arr  Datenarray
 * @param {Array<{k:string,ph:string,num?:boolean,w?:string,max?:number}>} fields  Spalten
 * @param {{attach?:boolean}} [opts]  attach = Beleg-Anhang je Zeile erlauben
 */
function lineItems(arr, fields, opts) {
  opts = opts || {};
  const wrap = elFromHTML('<div></div>');
  function refreshSum() { const sv = wrap.parentNode && wrap.parentNode.querySelector('.sumval'); if (sv) sv.textContent = money(sumItems(arr)); }
  function draw() {
    wrap.innerHTML = '';
    arr.forEach((it, idx) => {
      const r = elFromHTML('<div class="lrow"></div>');
      fields.forEach(fl => {
        const i = elFromHTML('<input>');
        i.placeholder = fl.ph; i.value = it[fl.k] || '';
        if (fl.num) i.inputMode = 'decimal';
        if (fl.w) i.style.flex = '0 0 ' + fl.w;
        if (fl.max) i.maxLength = fl.max;
        i.oninput = () => { it[fl.k] = i.value; save(); refreshSum(); };
        r.appendChild(i);
      });
      if (opts.attach) { const a = elFromHTML('<button class="att' + (it.beleg ? ' has' : '') + '" title="Beleg anhängen">📎</button>'); a.onclick = () => pickFile('image/*,application/pdf', f => fileToBeleg(f, bl => { it.beleg = bl; save(); draw(); })); r.appendChild(a); }
      const x = elFromHTML('<button class="x">✕</button>');
      x.onclick = () => { arr.splice(idx, 1); draw(); save(); refreshSum(); };
      r.appendChild(x);
      wrap.appendChild(r);
      if (opts.attach && it.beleg) { const bl = elFromHTML('<div class="belegline"><span>📎 ' + esc(it.beleg.name || (it.beleg.type === 'pdf' ? 'Beleg.pdf' : 'Beleg')) + '</span><button class="rm linkbtn" style="padding:0">entfernen</button></div>'); bl.querySelector('.rm').onclick = () => { delete it.beleg; draw(); save(); }; wrap.appendChild(bl); }
    });
    const add = elFromHTML('<button class="btn sec" style="margin-top:4px">+ Zeile hinzufügen</button>');
    add.onclick = () => { const o = {}; fields.forEach(f => o[f.k] = ''); arr.push(o); draw(); save(); };
    wrap.appendChild(add);
  }
  draw();
  return wrap;
}

/* ---------- Auslagen ---------- */
function renderAuslagen() {
  const f = T().forms.auslagen;
  const k = state.settings.konto;
  const d = elFromHTML('<div></div>');
  d.innerHTML = '<p class="tiny muted">Firma + wofür (z. B. Real, Schnaps), Betrag und Beleg (Foto/PDF) je Posten.</p>';
  d.appendChild(lineItems(f.items, [{ k: 'firma', ph: 'Firma / wofür', max: 62 }, { k: 'betrag', ph: '€', num: true, w: '84px', max: 12 }], { attach: true }));
  d.appendChild(elFromHTML('<div class="sumbar"><span>GESAMT</span><span class="sumval">' + money(sumItems(f.items)) + '</span></div>'));
  const kb = elFromHTML('<div class="card" style="padding:10px 12px;margin-top:12px;background:var(--bg)"></div>');
  kb.innerHTML = '<div class="bold small" style="margin-bottom:4px">Zu erstatten an (aus Einstellungen)</div><div class="small">' + (k.inhaber ? esc(k.inhaber) : '<span class="muted">Kontoinhaber –</span>') + '<br>' + (k.iban ? esc(k.iban) : '<span class="muted">IBAN –</span>') + (k.bank ? (' · ' + esc(k.bank)) : '') + '</div><button class="linkbtn" id="editKonto" style="padding:6px 0 0">In Einstellungen bearbeiten ›</button>';
  kb.querySelector('#editKonto').onclick = openSettings;
  d.appendChild(kb);
  return d;
}

/* ---------- Einnahmen ---------- */
function renderEinnahmen() {
  const f = T().forms.einnahmen;
  const d = elFromHTML('<div></div>');
  d.innerHTML = '<div class="field"><label>Bareinnahmen im Bus?</label></div>';
  const seg = elFromHTML('<div class="seg" style="margin-bottom:12px"><button data-v="0">Nein</button><button data-v="1">Ja</button></div>');
  const upd = () => seg.querySelectorAll('button').forEach(b => b.classList.toggle('on', (b.dataset.v === '1') === f.bar));
  seg.querySelectorAll('button').forEach(b => b.onclick = () => { f.bar = b.dataset.v === '1'; upd(); save(); });
  upd();
  d.appendChild(seg);
  d.appendChild(elFromHTML('<p class="tiny muted">Kundenname, Einstiegsort, Nr. (+ ggf. Rechnungsnr.), Betrag und Beleg je Posten.</p>'));
  d.appendChild(lineItems(f.items, [{ k: 'text', ph: 'Kunde · Einstieg · Nr.', max: 66 }, { k: 'betrag', ph: '€', num: true, w: '84px', max: 12 }], { attach: true }));
  d.appendChild(elFromHTML('<div class="sumbar"><span>GESAMT</span><span class="sumval">' + money(sumItems(f.items)) + '</span></div>'));
  return d;
}

/* ---------- No-Shows ---------- */
function renderNoshows() {
  const f = T().forms;
  const d = elFromHTML('<div></div>');
  const fields = [{ k: 'name', ph: 'Name' }, { k: 'einstieg', ph: 'Einstieg' }, { k: 'nr', ph: 'Nr.', w: '60px' }];
  const btn = elFromHTML('<button class="btn out" style="margin-bottom:10px">⤵ Nicht-Eingecheckte übernehmen</button>');
  fields[0].max = 40; fields[1].max = 22; fields[2].max = 6;
  let li = lineItems(f.noshows, fields);
  btn.onclick = () => {
    T().participants.filter(p => !p.anwesend).forEach(p => { if (!f.noshows.some(n => n.nr == String(p.nr))) f.noshows.push({ name: p.name, einstieg: p.abfahrtsort, nr: String(p.nr) }); });
    save();
    const nl = lineItems(f.noshows, fields); li.replaceWith(nl); li = nl; toast('No-Shows übernommen');
  };
  d.appendChild(btn); d.appendChild(li);
  return d;
}

/* ---------- Tickets ---------- */
function renderTickets() {
  const f = T().forms.tickets;
  const d = elFromHTML('<div></div>');
  function redraw() {
    d.innerHTML = '';
    d.appendChild(elFromHTML('<div class="field" style="margin:0 0 6px"><label>Tickets übrig?</label></div>'));
    const mk = val => { const seg = elFromHTML('<div class="seg" style="margin-bottom:10px"><button type="button" data-v="0">Nein</button><button type="button" data-v="1">Ja</button></div>'); seg.querySelectorAll('button').forEach(b => { b.classList.toggle('on', (b.dataset.v === '1') === f[val]); b.onclick = () => { f[val] = b.dataset.v === '1'; save(); redraw(); }; }); return seg; };
    d.appendChild(mk('uebrig'));
    if (f.uebrig) { const a = elFromHTML('<div class="field"><label>Anzahl übrig</label><input inputmode="numeric"></div>'); a.querySelector('input').value = f.uebrigAnzahl || ''; a.querySelector('input').oninput = e => { f.uebrigAnzahl = e.target.value; save(); }; d.appendChild(a); }
    d.appendChild(elFromHTML('<div class="field" style="margin:4px 0 6px"><label>Tickets weitergeben?</label></div>'));
    d.appendChild(mk('weitergeben'));
    if (f.weitergeben) { const a = elFromHTML('<div class="field"><label>An wen? Anzahl? Erlös?</label><textarea></textarea></div>'); a.querySelector('textarea').value = f.weiterAn || ''; a.querySelector('textarea').oninput = e => { f.weiterAn = e.target.value; save(); }; d.appendChild(a); }
  }
  redraw();
  return d;
}

/* ---------- Bus-Checkliste (eigene Unterseite) ---------- */
function renderCheck() {
  const d = elFromHTML('<div></div>');
  const auto = (T().name || '') + ' - ' + busTagOf(T());
  const block = (title, arr, store) => {
    const w = elFromHTML('<div></div>');
    w.innerHTML = '<div class="sectitle">' + title + '</div>';
    arr.forEach(label => {
      const fld = elFromHTML('<div class="field"><label>' + esc(label) + '</label><input></div>');
      const inp = fld.querySelector('input');
      inp.maxLength = 40;
      inp.value = store[label] || (label === 'Eventname und Busnummer' ? auto : '');
      if (label === 'Eventname und Busnummer') inp.placeholder = auto;
      const cnt = elFromHTML('<div class="tiny muted" style="text-align:right;margin-top:2px"></div>');
      const upd = () => { cnt.textContent = inp.value.length + '/40'; cnt.style.color = inp.value.length >= 40 ? 'var(--danger)' : 'var(--muted)'; };
      inp.oninput = e => { store[label] = e.target.value; save(); upd(); };
      upd();
      fld.appendChild(cnt); w.appendChild(fld);
    });
    return w;
  };
  d.appendChild(block('Hinfahrt', CHECK_HIN, T().forms.checkHin));
  d.appendChild(block('Rückfahrt', CHECK_RUECK, T().forms.checkRueck));
  const bem = elFromHTML('<div class="field"><label>Bemerkungen, Vorkommnisse, Probleme (3 Zeilen)</label><textarea maxlength="210"></textarea><div class="tiny muted bemcnt" style="text-align:right;margin-top:2px"></div></div>');
  const bta = bem.querySelector('textarea');
  bta.value = T().forms.bemerkungen || '';
  const bc = bem.querySelector('.bemcnt');
  const bupd = () => { bc.textContent = bta.value.length + '/210'; bc.style.color = bta.value.length >= 210 ? 'var(--danger)' : 'var(--muted)'; };
  bta.oninput = e => { T().forms.bemerkungen = e.target.value; save(); bupd(); };
  bupd();
  d.appendChild(bem);
  // Vier Unterschriften (Hin/Rück × Begleiter/Fahrer).
  const cs = T().forms.checkSig;
  const sigRow = (label, key) => {
    const wrap = elFromHTML('<div class="field" style="margin-bottom:8px"></div>');
    const upd = () => {
      wrap.innerHTML = '<label>' + label + '</label>' + (cs[key] ? '<div class="sigsaved" style="margin-bottom:6px"><img src="' + cs[key] + '" alt="Unterschrift"></div>' : '');
      const btn = elFromHTML('<button class="btn out">✍︎ ' + (cs[key] ? 'neu unterschreiben' : 'unterschreiben') + '</button>');
      btn.onclick = () => openSignaturePad({ title: label, onSave: data => { cs[key] = data; save(); upd(); } });
      wrap.appendChild(btn);
    };
    upd();
    return wrap;
  };
  d.appendChild(elFromHTML('<div class="sectitle">✍︎ Unterschriften</div>'));
  d.appendChild(elFromHTML('<div class="tiny muted" style="margin:0 0 6px">Hinfahrt</div>'));
  d.appendChild(sigRow('Busbegleiter (Hinfahrt)', 'hinBegleiter'));
  d.appendChild(sigRow('Busfahrer (Hinfahrt)', 'hinFahrer'));
  d.appendChild(elFromHTML('<div class="tiny muted" style="margin:10px 0 6px">Rückfahrt</div>'));
  d.appendChild(sigRow('Busbegleiter (Rückfahrt)', 'rueckBegleiter'));
  d.appendChild(sigRow('Busfahrer (Rückfahrt)', 'rueckFahrer'));
  return d;
}

/* ---------- Tourbericht (eigener Tab) ---------- */
export function viewBericht() {
  const t = T();
  const d = elFromHTML('<div></div>');
  d.innerHTML = '<div class="card" style="padding:14px"><div class="bold" style="margin-bottom:4px">📝 Tourbericht</div><p class="tiny muted" style="margin:0 0 10px">Dein Log zur Fahrt – Ablauf, Vorkommnisse, Notizen. <b>Kommt NICHT ins PDF</b> – kopiere ihn am Ende und füge ihn separat ein (z. B. in die WeTransfer-Notiz).</p><textarea id="tbArea" style="min-height:52vh;resize:vertical" placeholder="Hier deinen Tourbericht schreiben …"></textarea><button class="btn" id="tbCopy" style="margin-top:10px">📋 Bericht kopieren</button></div>';
  const ta = d.querySelector('#tbArea');
  ta.value = t.tourbericht || '';
  ta.oninput = e => { t.tourbericht = e.target.value; save(); };
  d.querySelector('#tbCopy').onclick = () => {
    const txt = t.tourbericht || '';
    if (!txt.trim()) { toast('Noch kein Bericht zum Kopieren'); return; }
    const ok = () => toast('Bericht kopiert ✓');
    const fb = () => { try { const x = document.createElement('textarea'); x.value = txt; x.style.position = 'fixed'; x.style.opacity = '0'; document.body.appendChild(x); x.focus(); x.select(); document.execCommand('copy'); x.remove(); ok(); } catch (e) { toast('Kopieren nicht möglich – bitte Text markieren'); } };
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).then(ok, fb); else fb();
  };
  return d;
}

/* ---------- Namensänderungen / Neubucher ---------- */
function renderNamen() {
  const f = T().forms;
  const d = elFromHTML('<div></div>');
  d.appendChild(elFromHTML('<p class="tiny muted">Pro Eintrag: links der <b>alte Bucher</b> (Name, TN-Nr., Handy), rechts die Daten des <b>neuen Gastes</b>. 5,00 € pro Änderung.</p>'));
  const list = elFromHTML('<div></div>');
  function draw() {
    list.innerHTML = '';
    f.aenderungen.forEach((e, idx) => {
      const c = elFromHTML('<div class="card" style="padding:10px 12px;margin-bottom:10px"></div>');
      c.innerHTML = '<div class="row" style="justify-content:space-between"><span class="bold small">Änderung ' + (idx + 1) + '</span><button class="linkbtn delA" style="color:var(--danger);padding:0">entfernen</button></div>' +
        '<div class="tiny muted" style="margin:8px 0 4px">⬅︎ Alter Bucher</div>' +
        '<div class="row" style="gap:6px"><input class="fAltNr" placeholder="TN-Nr." style="flex:0 0 72px"><input class="fAltName" placeholder="Vor- + Nachname"></div>' +
        '<input class="fAltStr" placeholder="Straße + Hausnummer" style="margin-top:6px">' +
        '<div class="row" style="gap:6px;margin-top:6px"><input class="fAltPlz" placeholder="PLZ + Ort"><input class="fAltGeb" placeholder="Geb.-Datum" style="flex:0 0 116px"></div>' +
        '<div class="row" style="gap:6px;margin-top:6px"><input class="fAltHandy" placeholder="Handy"><input class="fAltMail" placeholder="E-Mail"></div>' +
        '<div class="tiny muted" style="margin:10px 0 4px">➡︎ Neuer Gast</div>' +
        '<div class="row" style="gap:6px"><input class="fNeuNr" placeholder="TN-Nr." style="flex:0 0 72px"><input class="fNeuName" placeholder="Vor- + Nachname"></div>' +
        '<input class="fNeuStr" placeholder="Straße + Hausnummer" style="margin-top:6px">' +
        '<div class="row" style="gap:6px;margin-top:6px"><input class="fNeuPlz" placeholder="PLZ + Ort"><input class="fNeuGeb" placeholder="Geb.-Datum" style="flex:0 0 116px"></div>' +
        '<div class="row" style="gap:6px;margin-top:6px"><input class="fNeuHandy" placeholder="Handy"><input class="fNeuMail" placeholder="E-Mail"></div>';
      const LIM = { altNr: 8, altName: 38, altStrasse: 38, altPlzOrt: 30, altGeb: 12, altHandy: 22, altEmail: 38, neuNr: 8, neuName: 38, neuStrasse: 38, neuPlzOrt: 30, neuGeb: 12, neuHandy: 22, neuEmail: 38 };
      const bind = (sel, key) => { const i = c.querySelector(sel); i.value = e[key] || ''; if (LIM[key]) i.maxLength = LIM[key]; i.oninput = () => { e[key] = i.value; save(); }; };
      bind('.fAltNr', 'altNr'); bind('.fAltName', 'altName'); bind('.fAltStr', 'altStrasse'); bind('.fAltPlz', 'altPlzOrt'); bind('.fAltGeb', 'altGeb'); bind('.fAltHandy', 'altHandy'); bind('.fAltMail', 'altEmail');
      bind('.fNeuNr', 'neuNr'); bind('.fNeuName', 'neuName'); bind('.fNeuStr', 'neuStrasse'); bind('.fNeuPlz', 'neuPlzOrt'); bind('.fNeuGeb', 'neuGeb'); bind('.fNeuHandy', 'neuHandy'); bind('.fNeuMail', 'neuEmail');
      c.querySelector('.delA').onclick = () => { f.aenderungen.splice(idx, 1); save(); draw(); };
      list.appendChild(c);
    });
    const add = elFromHTML('<button class="btn sec">+ Änderung / Neubucher</button>');
    add.onclick = () => { if (f.aenderungen.length >= 5) { toast('Max. 5 pro Formularseite'); return; } f.aenderungen.push({}); save(); draw(); };
    list.appendChild(add);
  }
  draw();
  d.appendChild(list);
  return d;
}

/* ---------- Abschluss / Export ---------- */
export function viewAbschluss() {
  const t = T();
  const ps = t.participants;
  const d = elFromHTML('<div></div>');
  const present = ps.filter(p => p.anwesend).length;
  const signed = ps.filter(p => p.signature).length;
  const seats = ps.filter(p => p.sitzplatz).length;
  const offen = ps.filter(p => !p.bezahlt).length;
  d.innerHTML = '<div class="card" style="padding:14px;margin-bottom:14px"><div class="bold" style="margin-bottom:8px">' + esc(t.name) + (t.busNr ? (' · Bus ' + esc(t.busNr)) : '') + '</div><div class="kv"><span class="k">Eingecheckt</span><span>' + present + ' / ' + ps.length + '</span></div><div class="kv"><span class="k">Unterschriften</span><span>' + signed + '</span></div><div class="kv"><span class="k">Sitzplätze erfasst</span><span>' + seats + ' / ' + ps.length + '</span></div><div class="kv"><span class="k">Offene Zahlungen</span><span>' + (offen ? ('<span style="color:var(--warn)">' + offen + '</span>') : '0') + '</span></div></div>' +
    (t.pdfData ? '<div class="note ok">✓ Alles wird in die <b>Original-Formulare</b> gestempelt: Teilnehmerliste (Unterschrift + Sitzplatz), Bus-Checkliste, Auslagen & Einnahmen.</div>' : '<div class="note">⚠️ Für diese Fahrt ist <b>keine Original-PDF</b> gespeichert – der Export wäre nur eine Tabelle. Bitte einmal neu importieren für die Original-Optik. Deine Check-ins, Sitzplätze &amp; Unterschriften bleiben erhalten.</div><button class="btn out" id="reimp" style="margin-bottom:12px">📄 Original-PDF jetzt importieren</button>') +
    '<button class="btn" id="genPdf">📤 3 PDFs erstellen & alle teilen</button><div class="tiny muted" style="margin:8px 2px 16px;line-height:1.55">Teilt 3 Dateien gemeinsam (z. B. WeTransfer):<br>① ' + esc(busTagOf(t) + '_' + evTagOf(t) + '_Checkliste_Teilnehmer.pdf') + '<br>② ' + esc(busTagOf(t) + '_' + evTagOf(t) + '_Auslagen_' + eurTag(sumItems(t.forms.auslagen.items)) + '.pdf') + '<br>③ ' + esc(busTagOf(t) + '_' + evTagOf(t) + '_' + (safeTag(state.settings.betreuer) || 'Begleiter') + '_Einnahmen_' + eurTag(sumItems(t.forms.einnahmen.items)) + '.pdf') + '</div>' +
    '<div class="field"><label>WhatsApp-Gruppenlink (diese Fahrt)</label><input id="grpLink" placeholder="https://chat.whatsapp.com/…" value="' + esc(t.groupInvite || '') + '"></div>' +
    '<button class="btn out" id="waAll">💬 Gruppenlink an alle senden</button>';
  d.querySelector('#genPdf').onclick = () => generatePDF();
  d.querySelector('#grpLink').oninput = e => { t.groupInvite = e.target.value.trim(); save(); };
  d.querySelector('#waAll').onclick = () => shareInvite();
  const ri = d.querySelector('#reimp');
  if (ri) ri.onclick = () => $('#pdfInput').click();
  return d;
}

/** Gruppen-Einladungslink (mit Vorlagentext) teilen. */
function shareInvite() {
  const t = T();
  const link = t.groupInvite;
  if (!link) { toast('Bitte oben den Gruppenlink dieser Fahrt eintragen'); return; }
  const text = (state.settings.waTemplate || '{invite}').replace('{invite}', link);
  if (navigator.share) { navigator.share({ text }).catch(() => {}); }
  else { window.open('https://wa.me/?text=' + encodeURIComponent(text), '_blank'); }
}
