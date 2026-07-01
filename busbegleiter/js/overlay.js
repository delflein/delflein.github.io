/* =============================================================================
   overlay.js – Overlays (Sheets & Vollbild-Seiten) + Zurück-Taste
   -----------------------------------------------------------------------------
   Overlays liegen auf einem Stapel. Das GANZE Overlay-Erlebnis belegt genau
   EINEN Browser-History-Eintrag: Das erste geöffnete Overlay legt ihn an, das
   Schließen des letzten räumt ihn wieder ab. So schließt die Hardware-/Wisch-
   Zurück-Taste die Overlays, statt die App zu verlassen.

   Zwei Schließ-Wege pro Overlay:
     el._close()        – normal: entfernt das Overlay; ist es das letzte,
                          wird der History-Eintrag via history.back() abgeräumt.
     el._closeSilent()  – für Übergänge (z. B. Sheet → Unterschrift-Pad): entfernt
                          das Overlay OHNE History-Manipulation, damit das direkt
                          danach geöffnete Overlay denselben Eintrag weiternutzt.
   ============================================================================= */

import { elFromHTML } from './dom.js';
import { render } from './app.js';

/** Stapel offener Overlays (unterstes zuerst). */
let _ovStack = [];

/** Overlay entfernen + optionale Aufräum-/After-Callbacks ausführen. */
function _doClose(el) {
  if (el._cleanup) el._cleanup();
  el.remove();
  if (el._after) el._after();
}

// System-Zurück (popstate): ALLE offenen Overlays schließen und in der App bleiben.
window.addEventListener('popstate', () => {
  if (_ovStack.length) {
    const all = _ovStack.splice(0);
    all.reverse().forEach(_doClose);
  }
});

/**
 * Overlay-Element in den Stapel aufnehmen und anzeigen.
 * @param {HTMLElement} el
 * @param {Function} [after]   nach dem Schließen ausführen (z. B. render)
 * @param {Function} [cleanup] beim Schließen ausführen (Listener entfernen …)
 * @param {boolean} [noPush]   keinen History-Eintrag anlegen (für Übergänge)
 */
export function _openOverlay(el, after, cleanup, noPush) {
  el._after = after;
  el._cleanup = cleanup;
  document.body.appendChild(el);
  const first = _ovStack.length === 0;
  _ovStack.push(el);
  if (first && !noPush) { try { history.pushState({ ov: 1 }, ''); } catch (e) {} }

  el._close = () => {
    const i = _ovStack.indexOf(el);
    if (i < 0) return;
    _ovStack.splice(i, 1);
    _doClose(el);
    if (_ovStack.length === 0) { try { history.back(); } catch (e) {} }
  };
  el._closeSilent = () => {
    const i = _ovStack.indexOf(el);
    if (i < 0) return;
    _ovStack.splice(i, 1);
    _doClose(el);
  };
  return el;
}

/** Bottom-Sheet öffnen (Klick auf den Hintergrund schließt es). */
export function openSheet(innerNode, after) {
  const bg = elFromHTML('<div class="sheet-bg"></div>');
  const sheet = elFromHTML('<div class="sheet"></div>');
  sheet.appendChild(elFromHTML('<div class="grab"></div>'));
  sheet.appendChild(innerNode);
  bg.appendChild(sheet);
  _openOverlay(bg, after);
  bg.onclick = e => { if (e.target === bg) bg._close(); };
  return bg;
}

/**
 * Auswahl-Sheet: Frage + eigene Buttons + „Abbrechen".
 * Ersetzt window.confirm(), das in der installierten iOS-PWA unzuverlässig ist.
 * @param {{title?:string, text?:string, buttons:Array<{label:string, cls?:string, onTap?:Function}>}} opts
 */
export function askSheet(opts) {
  const n = elFromHTML('<div></div>');
  if (opts.title) { const h = document.createElement('h2'); h.textContent = opts.title; n.appendChild(h); }
  if (opts.text) { const p = document.createElement('p'); p.className = 'muted'; p.style.margin = '0 2px 14px'; p.textContent = opts.text; n.appendChild(p); }
  const bg = openSheet(n);
  opts.buttons.concat([{ label: 'Abbrechen', cls: 'sec' }]).forEach(b => {
    const btn = document.createElement('button');
    btn.className = 'btn' + (b.cls ? ' ' + b.cls : '');
    btn.style.marginTop = '8px';
    btn.textContent = b.label;
    btn.onclick = () => { bg._close(); if (b.onTap) b.onTap(); };
    n.appendChild(btn);
  });
  return bg;
}

/** Ja/Nein-Bestätigung als Sheet. */
export function confirmSheet({ title, text, okLabel, danger, onOk }) {
  return askSheet({ title, text, buttons: [{ label: okLabel || 'OK', cls: danger ? 'danger' : '', onTap: onOk }] });
}

/** Vollbild-Seite mit Titelleiste + „‹ Zurück" öffnen. Schließen → render(). */
export function openPage(title, innerNode) {
  const pg = elFromHTML('<div class="page"></div>');
  pg.innerHTML = '<div class="page-bar"><button class="pback">‹ Zurück</button><span class="ptitle">' + title + '</span></div><div class="page-body"></div>';
  pg.querySelector('.page-body').appendChild(innerNode);
  _openOverlay(pg, render);
  pg.querySelector('.pback').onclick = () => pg._close();
  pg.scrollTop = 0;
  return pg;
}
