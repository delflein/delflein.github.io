/* =============================================================================
   signature.js – Unterschrift & Check-in
   -----------------------------------------------------------------------------
   • openSignaturePad – Vollbild-Pad im QUERFORMAT. Wichtig: Die Striche werden
     als normalisierte Vektoren (0..1) gespeichert und beim Ausgeben in ein
     festes 640er-Canvas gezeichnet. Dadurch ist der spätere PDF-Stempel immer
     schön groß, egal wie das Handy gehalten wurde.
   • openCheckin – kleines Sheet mit den drei Optionen Unterschrift / Abgemeldet /
     Nicht angetreten.
   ============================================================================= */

import { esc } from './util.js';
import { elFromHTML, toast } from './dom.js';
import { _openOverlay, openSheet } from './overlay.js';
import { save } from './state.js';
import { render } from './app.js';

/**
 * Vollbild-Unterschrift-Pad öffnen.
 * @param {object} opts
 * @param {string} [opts.title]
 * @param {(dataUrl:string)=>void} [opts.onSave]
 * @param {Array<{label:string,onClick:Function}>} [opts.statusButtons]  optionale Extra-Buttons oben
 * @param {boolean} [opts.noPush]  keinen History-Eintrag anlegen (Übergang aus einem Sheet)
 */
export function openSignaturePad(opts) {
  opts = opts || {};
  const ov = elFromHTML('<div class="sigscreen"></div>');
  ov.innerHTML =
    '<div class="sbar"><button class="sx">✕ Abbrechen</button><span>' + esc(opts.title || 'Unterschrift') + '</span><span style="width:64px"></span></div>' +
    (opts.statusButtons ? ('<div class="sfoot statusrow">' + opts.statusButtons.map((b, i) => '<button class="btn sec sb' + i + '" style="flex:1">' + b.label + '</button>').join('') + '</div>') : '') +
    '<div class="scanvas"><canvas></canvas><div class="sph">Hier mit dem Finger unterschreiben.<br>Tipp: Handy quer drehen für mehr Platz.</div></div>' +
    '<div class="sfoot"><button class="btn sec" id="sigClr" style="flex:1">Löschen</button><button class="btn" id="sigOk" style="flex:2">OK</button></div>';

  const canvas = ov.querySelector('canvas');
  const ph = ov.querySelector('.sph');
  const ctx = canvas.getContext('2d');
  let strokes = [], cur = null, drawing = false; // strokes: Array von Strichen, je Punkte in 0..1

  const rectOf = () => canvas.getBoundingClientRect();

  // Canvas mittig ins verfügbare Feld setzen, Seitenverhältnis 2.5:1 (Querformat).
  function fit() {
    const c = canvas.parentNode.getBoundingClientRect();
    const AR = 2.5;
    let w = Math.max(40, c.width - 4), h = w / AR;
    if (h > c.height - 4) { h = Math.max(40, c.height - 4); w = h * AR; }
    canvas.style.width = w + 'px'; canvas.style.height = h + 'px';
    canvas.style.left = Math.round((c.width - w) / 2) + 'px';
    canvas.style.top = Math.round((c.height - h) / 2) + 'px';
  }

  // Neu zeichnen (inkl. Retina-Skalierung). Gespeicherte Vektoren → Pixel.
  function redraw() {
    fit();
    const r = rectOf();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, r.width, r.height);
    ctx.lineWidth = 2.8; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#10243b';
    strokes.forEach(s => {
      ctx.beginPath();
      s.forEach((p, i) => { const x = p.x * r.width, y = p.y * r.height; i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); });
      ctx.stroke();
    });
    ph.style.display = strokes.length ? 'none' : '';
  }

  // Pointer-Position → normalisierte Koordinate (0..1).
  const norm = e => { const r = rectOf(); const t = e.touches ? e.touches[0] : e; return { x: (t.clientX - r.left) / r.width, y: (t.clientY - r.top) / r.height }; };
  const start = e => { e.preventDefault(); drawing = true; cur = [norm(e)]; strokes.push(cur); redraw(); };
  const move = e => { if (!drawing) return; e.preventDefault(); cur.push(norm(e)); redraw(); };
  const end = () => { drawing = false; };

  canvas.addEventListener('touchstart', start, { passive: false });
  canvas.addEventListener('touchmove', move, { passive: false });
  canvas.addEventListener('touchend', end);
  canvas.addEventListener('mousedown', start);
  canvas.addEventListener('mousemove', move);
  window.addEventListener('mouseup', end);

  const onResize = () => redraw();
  window.addEventListener('resize', onResize);
  window.addEventListener('orientationchange', onResize);

  // Beim Schließen die globalen Listener wieder abmelden (cleanup).
  _openOverlay(ov, null, () => {
    window.removeEventListener('resize', onResize);
    window.removeEventListener('orientationchange', onResize);
    window.removeEventListener('mouseup', end);
  }, opts.noPush);
  setTimeout(redraw, 40);

  ov.querySelector('.sx').onclick = () => ov._close();
  ov.querySelector('#sigClr').onclick = () => { strokes = []; redraw(); };
  ov.querySelector('#sigOk').onclick = () => {
    if (!strokes.length) { toast('Bitte zuerst unterschreiben'); return; }
    // In festes, breites Ausgabe-Canvas zeichnen → gleichmäßig großer Stempel.
    const r = rectOf();
    const ow = 640;
    const oh = Math.min(900, Math.max(150, Math.round(ow * r.height / r.width)));
    const out = document.createElement('canvas');
    out.width = ow; out.height = oh;
    const o = out.getContext('2d');
    o.lineWidth = 3; o.lineCap = 'round'; o.lineJoin = 'round'; o.strokeStyle = '#10243b';
    strokes.forEach(s => {
      o.beginPath();
      s.forEach((p, i) => { const x = p.x * ow, y = p.y * oh; i ? o.lineTo(x, y) : o.moveTo(x, y); });
      o.stroke();
    });
    const data = out.toDataURL('image/png');
    ov._close();
    opts.onSave && opts.onSave(data);
  };
  if (opts.statusButtons) opts.statusButtons.forEach((b, i) => { ov.querySelector('.sb' + i).onclick = () => { ov._close(); b.onClick(); }; });
  return ov;
}

/**
 * Check-in-Sheet: Unterschrift erfassen ODER als abgemeldet / nicht angetreten
 * markieren. Der Übergang Sheet → Pad läuft über _closeSilent + noPush, damit
 * „OK" hinterher sauber in die App zurückführt (nur ein History-Eintrag).
 */
export function openCheckin(p, leg) {
  const rueck = leg === 'rueck';
  const n = elFromHTML('<div></div>');
  n.innerHTML =
    '<h2>' + (rueck ? 'Rückfahrt · ' : 'Einchecken · ') + esc(p.name) + '</h2>' +
    '<div class="tiny muted" style="margin:0 0 14px">Nr ' + p.nr + (p.bucher && !p.istBucher ? (' · gebucht von ' + esc(p.bucher)) : '') + (p.sitzplatz ? (' · Sitz ' + esc(p.sitzplatz)) : '') + '</div>' +
    '<button class="btn" id="ciSign" style="margin-bottom:10px">✍︎ Unterschrift erfassen</button>' +
    '<button class="btn sec" id="ciAbg" style="margin-bottom:10px">🚫 Abgemeldet</button>' +
    '<button class="btn sec" id="ciNa">🚷 Nicht angetreten</button>';
  const bg = openSheet(n);
  n.querySelector('#ciSign').onclick = () => {
    bg._closeSilent();
    openSignaturePad({
      title: 'Unterschrift · ' + p.name, noPush: true,
      onSave: data => {
        p.signature = data; p.status = '';
        if (rueck) p.rueckAnwesend = true; else p.anwesend = true;
        save(); render(); toast(p.name + (rueck ? ' – Rückfahrt ✓' : ' eingecheckt ✓'));
      },
    });
  };
  n.querySelector('#ciAbg').onclick = () => { p.status = 'abgemeldet'; p.anwesend = false; p.rueckAnwesend = false; save(); bg._close(); render(); toast(p.name + ' als abgemeldet markiert'); };
  n.querySelector('#ciNa').onclick = () => { p.status = 'nicht_angetreten'; p.anwesend = false; p.rueckAnwesend = false; save(); bg._close(); render(); toast(p.name + ' als nicht angetreten markiert'); };
}
