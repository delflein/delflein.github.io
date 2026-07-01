/* =============================================================================
   dom.js – DOM-Hilfen (berühren `document`)
   -----------------------------------------------------------------------------
   Kleine Bausteine, mit denen die Ansichten Elemente erzeugen, Toasts anzeigen
   und Dateien auswählen/lesen.
   ============================================================================= */

/** Kurzform für document.querySelector. */
export const $ = s => document.querySelector(s);

/** HTML-String → DOM-Element (erstes Kind). Bequem für kleine Templates. */
export const elFromHTML = h => {
  const t = document.createElement('template');
  t.innerHTML = h.trim();
  return t.content.firstChild;
};

/**
 * Kurze Rückmeldung unten am Bildschirm.
 * @param {string} msg  Text
 * @param {number} [dur=2400]  Anzeigedauer in ms
 */
export function toast(msg, dur) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._t);
  t._t = setTimeout(() => t.classList.remove('show'), dur || 2400);
}

/** Datei-Auswahldialog öffnen und die gewählte Datei an `cb` geben. */
export function pickFile(accept, cb) {
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = accept;
  inp.onchange = () => { const f = inp.files[0]; if (f) cb(f); };
  inp.click();
}

/**
 * Beleg-Datei einlesen. Bilder werden auf max. 1400 px herunterskaliert und als
 * JPEG (Data-URL) gespeichert, PDFs unverändert als Data-URL.
 * @param {File} f
 * @param {(beleg:{name:string,type:'image'|'pdf',data:string})=>void} cb
 */
export function fileToBeleg(f, cb) {
  if (f.type && f.type.indexOf('image') === 0) {
    const rd = new FileReader();
    rd.onload = () => {
      const img = new Image();
      img.onload = () => {
        let w = img.width, h = img.height;
        const max = 1400;
        const r = Math.min(max / w, max / h, 1);
        w = Math.round(w * r); h = Math.round(h * r);
        const cv = document.createElement('canvas');
        cv.width = w; cv.height = h;
        cv.getContext('2d').drawImage(img, 0, 0, w, h);
        cb({ name: f.name, type: 'image', data: cv.toDataURL('image/jpeg', 0.82) });
      };
      img.src = rd.result;
    };
    rd.readAsDataURL(f);
  } else {
    const rd = new FileReader();
    rd.onload = () => cb({ name: f.name, type: 'pdf', data: rd.result });
    rd.readAsDataURL(f);
  }
}
