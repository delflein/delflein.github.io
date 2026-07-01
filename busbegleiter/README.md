# Feierreisen Busbegleiter

Ein digitaler Helfer für Busbegleiter auf Feierreisen-Fahrten – als installierbare
**Progressive Web App (PWA)**, die **komplett offline auf dem Gerät** läuft. Keine
Server, keine externen Requests mit Daten, DSGVO-freundlich: alles bleibt lokal
(IndexedDB + geräteinterner Cache).

Live: `https://delflein.github.io/busbegleiter/`

---

## Was die App kann

- **Teilnehmerliste importieren** – die PDF von Feierreisen wird automatisch
  eingelesen (Gäste, Buchungen, Bezahlt-Status), auch bei wechselnden
  Spaltenlayouts.
- **Einchecken mit Unterschrift** – Fingerunterschrift im Querformat, direkt auf
  dem Handy.
- **Sitzplätze erfassen** (versicherungsrelevant) inkl. Warnung bei
  doppelt vergebenen Plätzen.
- **Anrufen / WhatsApp** ohne Kontakt speichern; Gruppenlink an alle teilen.
- **Formulare ausfüllen** – Auslagen, Einnahmen, No-Shows, Bus-Checkliste,
  Namensänderungen.
- **Export**: erzeugt **3 PDFs**, in die **Original-Formulare gestempelt**
  (Teilnehmerliste + Checkliste, Auslagen, Einnahmen), und teilt sie gemeinsam
  (z. B. an WeTransfer).
- **Tourbericht** als Notizfeld (per Copy & Paste, bewusst nicht im PDF).

---

## Architektur

Reine statische Seite aus HTML, CSS und **ES-Modulen** – **kein Build-Schritt**
nötig. GitHub Pages liefert die Dateien direkt aus; der Browser lädt die Module
über `<script type="module">`.

```
index.html              Grundgerüst (Kopf, Tabs, lädt Styles + Module + Libs)
styles.css              gesamtes Styling (Design-Tokens, Light/Dark)
manifest.webmanifest    PWA-Manifest (Name, Icons, Standalone)
sw.js                   Service Worker – cache-first, macht die App offline-fähig

js/
  config.js             Konstanten (Speicher-Schlüssel, Checklisten-Texte, Pfade)
  util.js               reine Helfer (Format, Telefon, Base64) – ohne DOM/Zustand
  dom.js                DOM-Helfer ($, Element bauen, Toast, Datei lesen)
  state.js              Zustand + Persistenz (IndexedDB, localStorage-Fallback)
  parser.js             Teilnehmerliste-PDF → Daten (layout-robust) + Nr-Vorschläge
  overlay.js            Overlays (Sheets/Seiten) + Zurück-Taste (History)
  signature.js          Unterschrift-Pad + Check-in
  pdf.js                PDF lesen (Import) & schreiben (Formulare stempeln / Export)
  views-trips.js        Fahrtenliste, „Neue Fahrt", Import-Start, Einstellungen
  views-teilnehmer.js   Teilnehmerliste, Detailseite, Sitzplan
  views-formulare.js    Formulare, Checkliste, Namensänderungen, Bericht, Abschluss
  pwa.js                Service-Worker-Registrierung + „Zum Home-Bildschirm"-Hinweis
  app.js                Einstieg: render()-Dispatcher, Tab-Leiste, Verdrahtung, Boot

assets/
  vendor/               lokal gebündelte Bibliotheken (offline!)
                        pdf.js, jsPDF (+autotable), pdf-lib
  vorlage-formulare.pdf Original-Feierreisen-Formulare (werden bestempelt)
  icons/                App-Icons (Homescreen / Manifest)
```

### Datenfluss in einem Satz

Jede Aktion ändert `state` → ruft `save()` (entprellt in IndexedDB) und
`render()` (baut die aktive Ansicht in `#main` neu auf).

### Wie die Module zusammenhängen

`app.js` ist der Einstieg und ruft die `view*`-Funktionen auf. Der Zustand lebt in
`state.js` und wird als „live binding" importiert – alle Module sehen denselben
aktuellen `state`. Zyklische Importe (z. B. `views` ↔ `app`) sind unkritisch, weil
die Funktionen erst zur Laufzeit aufgerufen werden, nicht beim Laden.

---

## Der Parser (Herzstück)

Feierreisen-Listen haben **unterschiedliche Spaltenlayouts**. Statt feste Spalten
anzunehmen, erkennt der Parser die Spaltengrenzen **pro PDF aus der Kopfzeile**
(`detectHeaderBounds`) und tolerentiert Namensvarianten (`AbfahrtOrt` vs.
`Abfahrtsort`, `Beutel`/`Extras` vs. `Sondergepäck`, …).

Buchungsmodell: dunkle **Bucher-Zeilen** (ohne Nummer, mit „Bezahlt"/Handy) starten
eine Buchung; die nummerierten weißen **Mitfahrer-Zeilen** darunter gehören dazu
und erben den Bezahlt-Status. „Bezahlt" wird **zeilenweit** gesucht, damit es auch
bei verschobenen Spalten erkannt wird.

Zusätzlich: `nrSuggestions()` erkennt Tippfehler in laufenden Nummern (eine
doppelte Nummer, die laut Reihenfolge exakt in einer Lücke sitzt → Vorschlag).

---

## PDF-Export (Stempeln)

`pdf.js` lädt die Original-Formulare aus `assets/vorlage-formulare.pdf` und stempelt
mit **pdf-lib** an kalibrierten Koordinaten Text/Unterschriften auf die Linien.
Die Unterschriften der Teilnehmer werden in die **importierte Original-Liste**
gestempelt (Position kommt aus dem Parser: Seite, y, Spaltenbereich). Liegt keine
Original-PDF vor, gibt es einen **Tabellen-Fallback** über jsPDF.

---

## Offline / Installation

Beim ersten Aufruf lädt der Service Worker die komplette App (HTML, CSS, Module,
Bibliotheken, Formular-Vorlage, Icons) in den Cache. Danach startet alles aus dem
Cache – **funktioniert ohne Netz** (Flugmodus, kein Empfang im Bus).

„Zum Home-Bildschirm" hinzufügen macht es zur echten App und hebt auf iOS die
7-Tage-Löschregel für Website-Speicher auf. Ein dezenter Hinweis in der App führt
durch die Installation (iOS: Teilen → „Zum Home-Bildschirm"; Android: Install-Knopf).

Update: In `sw.js` `CACHE_VERSION` erhöhen → beim nächsten Online-Start werden nur
die geänderten Dateien neu geladen.

---

## Lokal ausführen

ES-Module brauchen einen HTTP-Server (nicht `file://`):

```bash
cd busbegleiter
python3 -m http.server 8000
# → http://localhost:8000
```

Deploy = Dateien in den Unterordner `busbegleiter/` der GitHub-Pages-Seite legen.
Kein Build, kein Bundler.

---

## Datenschutz

100 % auf dem Gerät. Keine Analytics, keine Tracker, keine externen Requests mit
Nutzerdaten. Die Bibliotheken liegen lokal im Repo (kein CDN zur Laufzeit).
