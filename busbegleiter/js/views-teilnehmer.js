/* =============================================================================
   views-teilnehmer.js – Teilnehmerliste, Detailseite und Sitzplan
   -----------------------------------------------------------------------------
   Der Kern der App während der Fahrt: suchen, filtern, einchecken (Unterschrift),
   Details bearbeiten und Sitzplätze erfassen (versicherungsrelevant).
   ============================================================================= */

import { $, elFromHTML, toast } from './dom.js';
import { esc, telHref, waHref, normPhone, uid } from './util.js';
import { state, T, ui, save, bookingOf } from './state.js';
import { openSheet, openPage } from './overlay.js';
import { openCheckin, openSignaturePad } from './signature.js';
import { nrSuggestions } from './parser.js';
import { render, updateTabBadges } from './app.js';

/* ---------- Suche / Filter / Sortierung ---------- */

/** Passt ein Teilnehmer zur Suchanfrage? (Name, Nr., Handy, Bucher) */
function matchSearch(p, q) {
  if (!q) return true;
  q = q.toLowerCase();
  return p.name.toLowerCase().includes(q) || String(p.nr) === q || String(p.nr).padStart(2, '0') === q || (p.handy || '').includes(q) || (p.bucher || '').toLowerCase().includes(q);
}

/** Passt ein Teilnehmer zum aktiven Filter? */
function passFilter(p, f) {
  if (f === 'alle') return true;
  if (f === 'anwesend') return p.anwesend;
  if (f === 'fehlt') return !p.anwesend;
  if (f === 'offen') return !p.bezahlt;
  if (f === 'camp') return p.camp;
  if (f === 'gepaeck') return !!p.sondergepaeck;
  if (f === 'abgemeldet') return p.status === 'abgemeldet';
  if (f === 'nichtangetreten') return p.status === 'nicht_angetreten';
  if (f.indexOf('ort:') === 0) return (p.abfahrtsort || '') === f.slice(4);
  return true;
}

/** Nach Name oder Nummer sortieren (je nach ui().sortBy). */
function sortParts(arr) {
  return arr.sort((a, b) => ui().sortBy === 'name' ? a.name.localeCompare(b.name) : a.nr - b.nr);
}

/* ---------- Hauptansicht: Teilnehmerliste ---------- */

export function viewTeilnehmer() {
  const d = elFromHTML('<div></div>');
  const ps = T().participants;
  const present = ps.filter(p => p.anwesend).length;
  const filters = [
    ['alle', 'Alle', ps.length], ['fehlt', 'Fehlt', ps.filter(p => !p.anwesend).length], ['anwesend', 'An Bord', present],
    ['offen', 'Offen 💶', ps.filter(p => !p.bezahlt).length], ['camp', 'Camping', ps.filter(p => p.camp).length], ['gepaeck', 'Sondergepäck', ps.filter(p => p.sondergepaeck).length],
  ];
  const nAbg = ps.filter(p => p.status === 'abgemeldet').length, nNa = ps.filter(p => p.status === 'nicht_angetreten').length;
  if (nAbg) filters.push(['abgemeldet', '🚫 Abgemeldet', nAbg]);
  if (nNa) filters.push(['nichtangetreten', '🚷 Nicht angetreten', nNa]);
  const orte = [...new Set(ps.map(p => p.abfahrtsort).filter(Boolean))].sort();

  let html = '<div class="search"><span class="ic">🔎</span><input id="srch" placeholder="Name, Nummer, Handy oder Bucher …" value="' + esc(ui().search) + '" autocomplete="off"></div>';
  html += '<div class="chips">' + filters.map(f => '<button class="chip' + (ui().filter === f[0] ? ' on' : '') + '" data-f="' + f[0] + '">' + f[1] + ' ' + f[2] + '</button>').join('') + '</div>';
  if (orte.length > 1) {
    html += '<div class="chipslabel">Abfahrtsort</div><div class="chips orte">' + orte.map(o => '<button class="chip' + (ui().filter === 'ort:' + o ? ' on' : '') + '" data-f="ort:' + esc(o) + '">📍 ' + esc(o) + ' ' + ps.filter(p => p.abfahrtsort === o).length + '</button>').join('') + '</div>';
  }
  html += '<div class="counts"><span id="cnt"></span> · <button class="linkbtn" id="sortToggle" style="padding:0">Sortierung: ' + (ui().sortBy === 'name' ? 'Name' : 'Nr') + '</button></div>';
  html += '<button class="btn out" id="addP" style="margin:2px 0 12px">＋ Teilnehmer hinzufügen</button>';
  html += '<div class="plist" id="plist"></div>';
  d.innerHTML = html;

  const redraw = () => {
    const l = d.querySelector('#plist');
    l.innerHTML = '';
    const fl = sortParts(ps.filter(p => matchSearch(p, ui().search) && passFilter(p, ui().filter)));
    d.querySelector('#cnt').textContent = fl.length + ' angezeigt · ' + present + '/' + ps.length + ' eingecheckt';
    if (!fl.length) l.innerHTML = '<p class="muted" style="text-align:center;padding:30px">Keine Treffer.</p>';
    fl.forEach(p => l.appendChild(pcard(p)));
  };
  redraw();

  const s = d.querySelector('#srch');
  s.oninput = () => { ui().search = s.value; save(); redraw(); };
  d.querySelectorAll('.chip').forEach(c => c.onclick = () => { ui().filter = c.dataset.f; render(); });
  d.querySelector('#sortToggle').onclick = () => { ui().sortBy = ui().sortBy === 'name' ? 'nr' : 'name'; render(); };
  d.querySelector('#addP').onclick = openAddParticipant;
  return d;
}

/** Sheet „Teilnehmer hinzufügen" (manuell, z. B. spontane Mitfahrer). */
export function openAddParticipant() {
  const t = T();
  const n = elFromHTML('<div></div>');
  const segVal = { camp: false, paid: false };
  n.innerHTML = '<h2>Teilnehmer hinzufügen</h2><div class="field"><label>Name *</label><input id="apName"></div><div class="field"><label>Handynummer</label><input id="apHandy" inputmode="tel" placeholder="z. B. 0176…"></div><div class="row" style="gap:8px"><div class="field" style="flex:1;margin:0"><label>Abfahrtsort</label><input id="apOrt" value="' + esc((t.participants[0] && t.participants[0].abfahrtsort) || '') + '"></div><div class="field" style="flex:1;margin:0"><label>Ticket</label><input id="apTicket" placeholder="REG"></div></div><div class="field"><label>Sondergepäck</label><input id="apGep"></div><div class="field" style="margin-bottom:10px"><label>Camping</label><div class="seg" id="apCampSeg"><button type="button" data-v="0" class="on">Nein</button><button type="button" data-v="1">Ja</button></div></div><div class="field" style="margin-bottom:14px"><label>Bezahlt</label><div class="seg" id="apPaidSeg"><button type="button" data-v="0" class="on">Nein</button><button type="button" data-v="1">Ja</button></div></div><button class="btn" id="apSave">Hinzufügen</button>';
  const bg = openSheet(n);
  // Segment-Umschalter per Delegation (funktioniert zuverlässig auf iOS).
  const bindSeg = (sel, key) => {
    const seg = n.querySelector(sel);
    seg.addEventListener('click', ev => {
      const b = ev.target.closest('button');
      if (!b || !seg.contains(b)) return;
      ev.preventDefault();
      segVal[key] = b.dataset.v === '1';
      seg.querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b));
    });
  };
  bindSeg('#apCampSeg', 'camp'); bindSeg('#apPaidSeg', 'paid');
  n.querySelector('#apSave').onclick = () => {
    const name = n.querySelector('#apName').value.trim();
    if (!name) { toast('Bitte Name eingeben'); return; }
    const nr = t.participants.reduce((m, p) => Math.max(m, p.nr || 0), 0) + 1;
    const bid = 'm' + uid();
    const handy = n.querySelector('#apHandy').value.trim();
    t.bookings.push({ id: bid, bucher: name, handy, paid: segVal.paid });
    t.participants.push({ nr, name, handy, abfahrtsort: n.querySelector('#apOrt').value.trim(), ticket: n.querySelector('#apTicket').value.trim(), skat: '', sondergepaeck: n.querySelector('#apGep').value.trim(), camp: segVal.camp, kommentar: '', buchungId: bid, bucher: name, istBucher: true, bezahlt: segVal.paid, anwesend: false, sitzplatz: '', signature: null, status: '', manuell: true, page: null });
    save(); bg._close(); render(); toast(name + ' hinzugefügt (Nr ' + nr + ')');
  };
}

/** Eine Teilnehmer-Karte (Info-Bubbles + Anrufen/WhatsApp/Details + Check-in). */
function pcard(p) {
  const tags = [];
  tags.push('<span class="tag">📍 ' + esc(p.abfahrtsort || '—') + '</span>');
  if (p.ticket) tags.push('<span class="tag">' + esc(p.ticket) + '</span>');
  const kmt = (p.kommentar || '').trim();
  if (kmt) tags.push('<span class="tag cmt">💬 ' + esc(kmt) + '</span>'); // Kommentar aus der Liste als feste Bubble
  if (p.camp) tags.push('<span class="tag cm">🏕 Camping</span>');
  if (p.sondergepaeck) tags.push('<span class="tag gepaeck">🧳 Sondergepäck</span>');
  if (!p.bezahlt) tags.push('<span class="tag offen">⚠️ Offen</span>');
  if (p.bucher && !p.istBucher) tags.push('<span class="tag bucher">👤 ' + esc(p.bucher) + '</span>');
  if (p.sitzplatz) tags.push('<span class="tag seat">💺 ' + esc(p.sitzplatz) + '</span>');
  if (p.status) tags.push('<span class="tag" style="font-weight:600">' + (p.status === 'abgemeldet' ? '🚫 Abgemeldet' : '🚷 Nicht angetreten') + '</span>');
  if (p.manuell) tags.push('<span class="tag" style="background:var(--accent-l);color:var(--accent-d)">＋ manuell</span>');

  const c = elFromHTML('<div class="pcard"></div>');
  if (p.status) c.style.opacity = '0.62';
  c.innerHTML = '<div class="top"><div class="nrbadge">' + p.nr + '</div><div style="flex:1;min-width:0"><div class="pname">' + esc(p.name) + (p.signature ? ' <span title="unterschrieben" style="color:var(--accent)">✍︎</span>' : '') + '</div><div class="ptags">' + tags.join('') + '</div></div><button class="checkbtn' + (p.anwesend ? ' on' : '') + '" title="' + (p.anwesend ? 'eingecheckt' : 'einchecken (Unterschrift)') + '">' + (p.anwesend ? '✓' : '') + '</button></div><div class="pactions"><a class="pact call" href="' + telHref(p.handy) + '">📞 Anrufen</a><a class="pact wa" href="' + waHref(p.handy, '') + '" target="_blank" rel="noopener">💬 WhatsApp</a><button class="pact sign">' + (p.signature ? '✍︎' : '☰') + ' Details</button></div>';
  c.querySelector('.checkbtn').onclick = e => {
    e.stopPropagation();
    if (p.anwesend) { if (confirm('Check-in von ' + p.name + ' zurücknehmen?')) { p.anwesend = false; save(); render(); } }
    else openCheckin(p);
  };
  c.querySelector('.pact.sign').onclick = () => openDetail(p);
  if (!normPhone(p.handy)) c.querySelector('.pact.wa').classList.add('hidden');
  return c;
}

/* ---------- Detailseite ---------- */

/**
 * Nummern-Vorschlag für DIESEN Teilnehmer (dünner Wrapper um nrSuggestions):
 * nur gesetzt, wenn seine doppelte Nummer laut Reihenfolge ein Tippfehler ist.
 */
function suggestNr(p) {
  const s = nrSuggestions((T() && T().participants) || []).find(x => x.p === p);
  return s ? s.to : null;
}

/** Vollbild-Detailseite eines Teilnehmers. */
export function openDetail(p) {
  const b = bookingOf(p);
  const sug = suggestNr(p);
  const n = elFromHTML('<div></div>');
  n.innerHTML = '<div class="card" style="padding:4px 14px;margin-bottom:14px"><div class="kv"><span class="k">Handy</span><span>' + (p.handy ? '<a class="linkbtn" href="' + telHref(p.handy) + '">' + esc(p.handy) + '</a>' : '—') + '</span></div><div class="kv"><span class="k">Abfahrtsort</span><span>' + esc(p.abfahrtsort || '—') + '</span></div><div class="kv"><span class="k">Ticket</span><span>' + esc(p.ticket || '—') + '</span></div><div class="kv"><span class="k">Camping</span><span>' + (p.camp ? 'Ja 🏕' : 'Nein') + '</span></div><div class="kv"><span class="k">Sondergepäck</span><span>' + esc(p.sondergepaeck || '—') + '</span></div><div class="kv"><span class="k">Bucher</span><span>' + esc(p.bucher || '—') + (p.istBucher ? ' (selbst)' : '') + '</span></div><div class="kv"><span class="k">Zahlung (ganze Buchung)</span><span><button class="linkbtn" id="togPay">' + (p.bezahlt ? '✓ Bezahlt' : '⚠️ Offen – tippen') + '</button></span></div></div>' +
    '<div class="field"><label>Teilnehmer-Nr. (aus Liste)</label><input id="nrInp" inputmode="numeric" value="' + esc(String(p.nr)) + '"></div>' +
    (sug ? ('<div class="note" id="nrSug">⚠️ Nr. <b>' + p.nr + '</b> kommt doppelt vor – laut Reihenfolge sollte das <b>Nr. ' + sug + '</b> sein. <button class="linkbtn" id="nrFix" style="margin-left:2px;font-weight:600">→ auf ' + sug + ' setzen</button></div>') : '') +
    (!p.bezahlt && b && b.handy ? ('<a class="btn out" href="' + telHref(b.handy) + '" style="margin-bottom:14px">💶 Bucher ' + esc(p.bucher) + ' anrufen (Geld)</a>') : '') +
    '<div class="row" style="gap:8px;margin-bottom:14px"><a class="btn sec" style="flex:1" href="' + telHref(p.handy) + '">📞 Anrufen</a>' + (normPhone(p.handy) ? '<a class="btn sec" style="flex:1" href="' + waHref(p.handy, '') + '" target="_blank" rel="noopener">💬 WhatsApp</a>' : '') + '</div><div class="field"><label>Sitzplatz-Nr.</label><input id="seatInp" inputmode="numeric" placeholder="z. B. 14" value="' + esc(p.sitzplatz) + '"></div><div class="field"><label>Kommentar</label><textarea id="cmtInp" placeholder="Notiz …">' + esc(p.kommentar || '') + '</textarea></div><div class="sectitle">✍︎ Unterschrift / Check-in</div><div id="sigThumb"></div><button class="btn out" id="sigBtn" style="margin-top:6px">✍︎ Unterschrift erfassen</button><button class="btn" id="checkInBtn" style="margin-top:10px"></button><div class="sectitle">Status</div><div class="seg" id="statusSeg"><button data-s="">Aktiv</button><button data-s="abgemeldet">Abgemeldet</button><button data-s="nicht_angetreten">Nicht angetr.</button></div><button class="btn sec" id="rmP" style="margin-top:18px;color:var(--danger)">🗑 Teilnehmer entfernen</button>';
  const pg = openPage(esc(p.name) + ' · Nr ' + p.nr, n);

  // Nummer ändern (manuell oder per Vorschlag).
  const applyNr = v => {
    if (!(v > 0)) return;
    p.nr = v; save(); render();
    const tt = pg.querySelector('.ptitle'); if (tt) tt.textContent = p.name + ' · Nr ' + v;
    const inp = n.querySelector('#nrInp'); if (inp) inp.value = String(v);
    const sg = n.querySelector('#nrSug'); if (sg) sg.remove();
    toast('Nummer auf ' + v + ' gesetzt');
  };
  n.querySelector('#nrInp').onchange = e => { const v = parseInt((e.target.value || '').replace(/\D/g, ''), 10); if (!isNaN(v) && v > 0 && v !== p.nr) applyNr(v); };
  const nfx = n.querySelector('#nrFix'); if (nfx) nfx.onclick = () => applyNr(sug);

  const refreshBtn = () => {
    const btn = n.querySelector('#checkInBtn');
    if (p.anwesend) { btn.textContent = '✓ Eingecheckt – zurücknehmen'; btn.disabled = false; btn.className = 'btn sec'; }
    else if (p.signature) { btn.textContent = 'Einchecken'; btn.disabled = false; btn.className = 'btn'; }
    else { btn.textContent = 'Zum Einchecken bitte unterschreiben'; btn.disabled = true; btn.className = 'btn'; }
  };
  n.querySelector('#togPay').onclick = function () { togglePay(p); this.textContent = p.bezahlt ? '✓ Bezahlt' : '⚠️ Offen – tippen'; };
  n.querySelector('#seatInp').oninput = e => { p.sitzplatz = e.target.value.trim(); save(); };
  n.querySelector('#cmtInp').oninput = e => { p.kommentar = e.target.value; save(); };
  n.querySelector('#checkInBtn').onclick = () => {
    if (p.anwesend) { p.anwesend = false; }
    else { if (!p.signature) { toast('Bitte zuerst unterschreiben'); return; } p.anwesend = true; }
    save(); pg._close(); toast(p.anwesend ? p.name + ' eingecheckt ✓' : 'ausgecheckt');
  };
  const sigThumb = n.querySelector('#sigThumb');
  const refreshSig = () => { sigThumb.innerHTML = p.signature ? ('<div class="sigsaved" style="margin-bottom:0"><img src="' + p.signature + '" alt="Unterschrift"></div>') : ''; refreshBtn(); };
  n.querySelector('#sigBtn').onclick = () => openSignaturePad({ title: p.name, onSave: data => { p.signature = data; save(); refreshSig(); render(); } });
  refreshSig();

  const seg = n.querySelector('#statusSeg');
  const updSeg = () => seg.querySelectorAll('button').forEach(bx => bx.classList.toggle('on', (bx.dataset.s || '') === (p.status || '')));
  seg.querySelectorAll('button').forEach(bx => bx.onclick = () => { p.status = bx.dataset.s; save(); updSeg(); });
  updSeg();
  n.querySelector('#rmP').onclick = () => {
    if (confirm('„' + p.name + '" wirklich aus der Liste entfernen?')) {
      const arr = T().participants;
      const ix = arr.indexOf(p);
      if (ix >= 0) arr.splice(ix, 1);
      if (p.buchungId && !arr.some(x => x.buchungId === p.buchungId)) T().bookings = T().bookings.filter(b => b.id !== p.buchungId);
      save(); pg._close(); toast('Teilnehmer entfernt');
    }
  };
}

/** Zahlungsstatus der ganzen Buchung umschalten (alle Mitfahrer erben ihn). */
function togglePay(p) {
  const b = bookingOf(p);
  if (b) { b.paid = !b.paid; T().participants.forEach(x => { if (x.buchungId === b.id) x.bezahlt = b.paid; }); }
  else { p.bezahlt = !p.bezahlt; }
  save();
}

/* ---------- Sitzplan ---------- */

export function viewSitz() {
  const d = elFromHTML('<div></div>');
  const ps = T().participants;
  const done = ps.filter(p => p.sitzplatz).length;
  const pct = ps.length ? Math.round(done / ps.length * 100) : 0;
  const q = ui().seatSearch || '';
  d.innerHTML = '<div class="note ok" style="display:flex;justify-content:space-between"><span>💺 Sitzplätze für die Versicherung</span><span class="bold" id="seatDone">' + done + '/' + ps.length + '</span></div><div class="progress"><div style="width:' + pct + '%"></div></div><div class="note" id="dupeWarn" style="display:none"></div><div class="search"><span class="ic">🔎</span><input id="seatSrch" placeholder="Person suchen …" value="' + esc(q) + '" autocomplete="off"></div><p class="tiny muted" style="margin:0 0 8px">Offene zuerst. Nummer eintippen – doppelte Plätze werden rot markiert.</p><div class="plist" id="seatList"></div>';

  let rows = [];
  const counts = () => { const m = {}; ps.forEach(p => { const v = (p.sitzplatz || '').trim(); if (v) m[v] = (m[v] || 0) + 1; }); return m; };
  const refreshDupes = () => {
    const m = counts();
    const dups = Object.keys(m).filter(k => m[k] > 1).sort((a, b) => (parseInt(a, 10) || 0) - (parseInt(b, 10) || 0));
    const dn = d.querySelector('#seatDone'); if (dn) dn.textContent = ps.filter(p => p.sitzplatz).length + '/' + ps.length;
    const w = d.querySelector('#dupeWarn');
    if (dups.length) { w.style.display = ''; w.innerHTML = '⚠️ Sitzplatz doppelt vergeben: ' + dups.map(x => '<b>' + esc(x) + '</b>').join(', ') + '. Bitte prüfen.'; }
    else { w.style.display = 'none'; w.innerHTML = ''; }
    const pr = d.querySelector('.progress > div'); if (pr) pr.style.width = (ps.length ? Math.round(ps.filter(p => p.sitzplatz).length / ps.length * 100) : 0) + '%';
    rows.forEach(r => {
      const v = (r.p.sitzplatz || '').trim();
      const dup = !!v && m[v] > 1;
      r.inp.style.borderColor = dup ? 'var(--danger)' : (v ? 'var(--accent)' : 'var(--line)');
      r.inp.style.background = dup ? 'var(--warn-bg)' : (v ? 'var(--accent-l)' : 'var(--card)');
      r.inp.style.color = dup ? 'var(--danger)' : 'var(--text)';
      r.warn.style.display = dup ? '' : 'none';
    });
  };
  const draw = () => {
    const l = d.querySelector('#seatList');
    l.innerHTML = ''; rows = [];
    ps.filter(p => matchSearch(p, ui().seatSearch)).sort((a, b) => { if (!!a.sitzplatz !== !!b.sitzplatz) return a.sitzplatz ? 1 : -1; return a.nr - b.nr; }).forEach(p => { const r = seatRow(p, refreshDupes); rows.push(r); l.appendChild(r.card); });
    refreshDupes();
  };
  draw();
  const s = d.querySelector('#seatSrch');
  s.oninput = () => { ui().seatSearch = s.value; save(); draw(); };
  return d;
}

/** Eine Sitzplan-Zeile mit Nummern-Eingabe. */
function seatRow(p, onChange) {
  const c = elFromHTML('<div class="pcard"></div>');
  c.innerHTML = '<div class="top" style="align-items:center"><div class="nrbadge">' + p.nr + '</div><div style="flex:1;min-width:0"><div class="pname" style="font-size:15px">' + esc(p.name) + '</div><div class="tiny muted">📍 ' + esc(p.abfahrtsort || '') + (p.anwesend ? ' · an Bord' : ' · <span style="color:var(--warn)">fehlt noch</span>') + '<span class="dupw" style="color:var(--danger);font-weight:600;display:none"> · ⚠️ doppelt</span></div></div><input class="seatinp" inputmode="numeric" placeholder="Sitz" value="' + esc(p.sitzplatz) + '" style="width:74px;text-align:center;font-size:17px;font-weight:700;padding:11px 6px;border:2px solid var(--line);background:var(--card)"></div>';
  const inp = c.querySelector('.seatinp');
  const warn = c.querySelector('.dupw');
  inp.oninput = () => { p.sitzplatz = inp.value.trim(); save(); updateTabBadges(); onChange && onChange(); };
  return { card: c, inp, warn, p };
}
