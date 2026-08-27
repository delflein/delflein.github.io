/* =============================================================================
   scrolltop.js – „Nach oben"-Pfeil + iOS-Geste (Kopfleiste antippen)
   -----------------------------------------------------------------------------
   Die App scrollt nie im Body, sondern in #main bzw. in .page-Overlays.
   Das native iOS-„Statusbar antippen" greift deshalb nicht – dieser Modul
   liefert Ersatz: ein schwebender Pfeil erscheint ab einer Scrolltiefe von
   SHOW_AT und scrollt den jeweils obersten Scroll-Container sanft nach oben;
   zusätzlich tut ein Tipp auf die Kopfleiste (außerhalb der Buttons) dasselbe.
   ============================================================================= */

import { $ } from './dom.js';

const SHOW_AT = 400; // px Scrolltiefe, ab der der Pfeil erscheint

let btn = null;

/** Der gerade sichtbare Scroll-Container: oberste .page, sonst #main. */
function topScroller() {
  const pages = document.querySelectorAll('.page');
  return pages.length ? pages[pages.length - 1] : $('#main');
}

/** Sichtbarkeit des Pfeils an die aktuelle Scrolltiefe anpassen. */
export function updateToTop() {
  if (!btn) return;
  const el = topScroller();
  btn.classList.toggle('show', !!el && el.scrollTop > SHOW_AT);
}

function scrollUp() {
  const el = topScroller();
  if (el) el.scrollTo({ top: 0, behavior: 'smooth' });
}

/** Container beobachten (#main einmalig, jede neue .page beim Öffnen). */
export function watchScroll(el) {
  el.addEventListener('scroll', updateToTop, { passive: true });
}

/** Einmalig beim Boot: Pfeil anlegen + Gesten verdrahten. */
export function initToTop() {
  btn = document.createElement('button');
  btn.id = 'toTop';
  btn.setAttribute('aria-label', 'Nach oben scrollen');
  btn.textContent = '↑';
  btn.onclick = scrollUp;
  document.body.appendChild(btn);
  watchScroll($('#main'));
  // iOS-Gewohnheit: Tipp „ganz oben" scrollt hoch – hier auf die Kopfleiste,
  // sofern kein Button (Fahrt wechseln / Einstellungen) getroffen wurde.
  document.querySelector('.app-bar').addEventListener('click', e => {
    if (!e.target.closest('button')) scrollUp();
  });
}
