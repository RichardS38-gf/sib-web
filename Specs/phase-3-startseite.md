# SIB Phase 3 — Startseite (index.html)

## Kontext

Projekt: Shoppen in Braunschweig (SIB) — lokaler Marktplatz für Braunschweiger Innenstadthändler.
Arbeitsordner: `C:\Users\richa\OneDrive - MANERI UG\General\Firmen\Unsortiert\Richie unsortiert\ClaudeCode Workspace\SIB`
GitHub: https://github.com/RichardS38-gf/sib-web
Live-URL: https://sib-web.vercel.app/

Die CSS-Grunddateien (reset, tokens, base, layout, components) existieren bereits unter `css/`.
Die Supabase-Anbindung liegt unter `js/supabase.js`.
Nach jeder abgeschlossenen Änderung: `git add -A && git commit -m "beschreibung" && git push`

---

## Aufgabe

Baue die vollständige Startseite `index.html` mit Live-Daten aus Supabase.

---

## Designsprache

**Farbschema:** Reines Schwarz/Weiß -- keine Farben, kein Blau.
- Hintergrund: `#FFFFFF`
- Hintergrund soft: `#FAFAF8`
- Text: `#0F0F0F`
- Gemuted: `#777777`
- Linien: `#E8E8E8`
- Dark (Header, Footer, CTAs): `#0F0F0F`
- Text auf Dark: `#FAFAF8`

**Fonts (Google Fonts):**
- Headlines: `Playfair Display`, weight 400/700
- Body/UI: `Inter`, weight 300/400/500
- Labels: Inter uppercase, letter-spacing 0.08em

**Stil:** Eckig (kein border-radius auf Buttons/Karten), editorial, Bilder dominieren.

---

## CSS-Einbindung

```html
<link rel="stylesheet" href="css/reset.css">
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/base.css">
<link rel="stylesheet" href="css/layout.css">
<link rel="stylesheet" href="css/components.css">
<link rel="stylesheet" href="css/index.css?v=1">
```

Seitenspezifisches CSS kommt in `css/index.css`.
Bei jeder CSS-Änderung Versionsnummer hochzählen (`?v=2`, `?v=3` usw.).

---

## Seitenaufbau (von oben nach unten)

### 1. Header (sticky, dunkel)
- Logo links: Bild `Bilder/Group 635898.-fotor-enhance-2026031913012.jpg` -- Höhe 36px
- Suchfeld Mitte: Placeholder "Produkte oder Geschäfte suchen..."
- Navigation rechts: "Geschäfte" | "Produkte" -- nur auf Desktop sichtbar
- Buttons rechts: "Anmelden" (outline) + "Händler werden" (primary, schwarz)
- Auf Mobile: nur Logo + Hamburger-Icon (Menü klappt auf)

### 2. Hero-Sektion (hell)
- Links: Eyebrow-Label "lokal kaufen" (kleines Badge, outline)
- Große Headline (Playfair Display, ~3rem): "Entdecke lokale Geschäfte in Braunschweig"
- Subtext (Inter 300): "Unterstütze lokale Händler und finde einzigartige Produkte aus deiner Nachbarschaft -- ohne das Haus zu verlassen."
- Suchfeld groß mit Button "Suchen"
- Rechts: 2x2 Bild-Collage (Platzhalter-Bilder aus `Bilder/` oder soft-graue Boxen)
- Auf Mobile: Bilder unter dem Text

### 3. Kategorien-Sektion (hell)
- Section-Header: "Kategorien" links, "Alle ansehen →" rechts (Link zu kategorie.html)
- Grid mit 5 Kategorien (Kreis-Bild + Name darunter)
- Daten live aus Supabase: `kategorien`-Tabelle
- Wenn kein Bild vorhanden: graue Kreis-Platzhalter
- Kategorien sind anklickbar (Link zu `kategorie.html?slug=XXX`)

### 4. Beliebte Produkte (soft-grauer Hintergrund)
- Section-Header: "Neue Produkte" links, "Alle ansehen →" rechts
- Grid: 4 Produkt-Karten nebeneinander (auf Mobile 2, auf kleinem Mobile 1)
- Produkt-Karte: Bild (3:4), Shop-Name (klein, gemuted), Produkttitel, Preis
- Daten live aus Supabase: `produkte` JOIN `shops`, neueste zuerst, limit 8
- Karte anklickbar: Link zu `produkt.html?id=XXX`
- Wenn keine Produkte: Text "Noch keine Produkte verfügbar."

### 5. Händler-CTA (dunkel, schwarz)
- Vollbreite dunkle Sektion
- Headline: "Du hast ein Einzelhandelsgeschäft?"
- Subtext: "Registriere dich jetzt und erreiche neue Kunden in Braunschweig."
- Button: "Händler werden" (outline-light) -- Link zu `login.html`

### 6. Newsletter-CTA (hell)
- Headline: "Verpasse keine neuen Produkte"
- Subtext: "Erhalte einmal im Monat die neuesten Produkte lokaler Braunschweiger Händler direkt in dein Postfach."
- Button: "Zum Newsletter anmelden" (primary, schwarz) -- Link zu `newsletter.html`

### 7. Footer (dunkel)
- Logo oben links + Slogan: "Lokale Händler. Einzigartige Produkte."
- 3 Spalten:
  - "Für Käufer": Alle Produkte, Geschäfte entdecken, Newsletter
  - "Für Verkäufer": Händler werden, Anmelden
  - "Kontakt": support@shoppeninbraunschweig.de
- Trennlinie
- Unterzeile: "© 2026 Shoppen in Braunschweig" links, "Datenschutz | Impressum" rechts

---

## Supabase-Anbindung

```javascript
// Import am Anfang jeder JS-Datei die Supabase nutzt:
import { supabase } from './js/supabase.js'

// Kategorien laden:
const { data: kategorien } = await supabase
  .from('kategorien')
  .select('*')
  .order('name')

// Produkte laden (mit Shop-Name):
const { data: produkte } = await supabase
  .from('produkte')
  .select('*, shops(name, slug)')
  .eq('verfuegbar', true)
  .order('erstellt_am', { ascending: false })
  .limit(8)
```

JS als ES-Modul einbinden: `<script type="module" src="js/index.js"></script>`
Separate Datei `js/index.js` für die Startseiten-Logik.

---

## Wichtige Konventionen

- Immer vollständige Datei lesen bevor etwas geändert wird
- Kein Lorem Ipsum -- sinnvolle deutsche Platzhaltentexte
- Bilder die nicht existieren: soft-graue Hintergrundbox (`background: #FAFAF8`)
- Mobile First -- Breakpoints: 640px (tablet), 1024px (desktop)
- Fehlerbehandlung: wenn Supabase-Daten nicht laden, stumm scheitern und Platzhalter zeigen
- Git nach Abschluss: `git add -A && git commit -m "Phase 3: Startseite" && git push`

---

## Erwartetes Ergebnis

Eine vollständige, live deployete Startseite auf https://sib-web.vercel.app/ die:
- Kategorien und Produkte live aus Supabase lädt
- Auf Mobile, Tablet und Desktop funktioniert
- Dem Schwarz/Weiß-Design der Entwürfe entspricht
- Alle Links zu den Unterseiten hat (auch wenn die noch nicht existieren)
