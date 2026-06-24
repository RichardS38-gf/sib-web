# Shoppen in Braunschweig (SIB) — Projektplan

**Stand:** Juni 2026
**Ziel:** Lokaler Marktplatz für Braunschweiger Innenstadthändler — Phase 1 "Newsletter-Marktplatz" (Reservierung + Abholung, kein Versand)
**Domain:** shoppeninbraunschweig.de (vorerst Vercel-Subdomain, WordPress bleibt vorerst aktiv)
**Vercel-URL:** https://sib-web.vercel.app/
**GitHub:** https://github.com/RichardS38-gf/sib-web
**Tech-Stack:** Reines HTML/CSS/Vanilla-JS + Supabase (Datenbank, Auth, Storage, E-Mail-Trigger)
**Hosting:** Vercel
**Erste Händler:** Amelie Fair Fashion, CrossoverDesign (Phase 10+)

---

## Produktvision in einem Satz

Ein schwarzweißer, hochwertiger Marktplatz, der Braunschweiger Innenstadthändlern eine digitale Schaufensterfront gibt — Kunden entdecken, reservieren, holen ab.

---

## Designsprache

**Farbschema:** Reines Schwarz/Weiß. Kein Blau, kein Farbakzent.
- `--color-bg:       #FFFFFF`
- `--color-bg-soft:  #FAFAF8`
- `--color-ink:      #0F0F0F`
- `--color-muted:    #777777`
- `--color-line:     #E8E8E8`
- `--color-dark:     #0F0F0F`
- `--color-on-dark:  #FAFAF8`

**Typografie** (abgeleitet aus den Entwürfen):
- Headlines: `Playfair Display`, weight 400/700 (Google Fonts)
- Body/UI: `Inter`, weight 300/400/500 (Google Fonts)
- Labels/Tags: Inter 400, uppercase, letter-spacing 0.08em

**Keine Border-Radius** auf Buttons und Karten -- eckig, editorial.
**Bilder dominieren** -- große, ehrliche Produktfotos, kein Stock.

---

## CSS-Architektur

Jede HTML-Seite bindet ein:

```html
<link rel="stylesheet" href="css/reset.css">
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/base.css">
<link rel="stylesheet" href="css/layout.css">
<link rel="stylesheet" href="css/components.css">
<link rel="stylesheet" href="css/[seitenname].css?v=1">
```

---

## Ordnerstruktur

```
SIB/  (Git-Repo)
├── css/
│   ├── reset.css
│   ├── tokens.css
│   ├── base.css
│   ├── layout.css
│   ├── components.css
│   ├── index.css
│   ├── kategorie.css
│   ├── produkt.css
│   ├── shop.css
│   ├── newsletter.css
│   ├── login.css
│   ├── dashboard.css
│   └── admin.css
├── js/
│   ├── supabase.js
│   ├── auth.js
│   ├── produkte.js
│   ├── reservierung.js
│   └── dashboard.js
├── Bilder/         (gitignore)
├── Händler/        (gitignore)
├── Infos/          (gitignore)
├── Vorlagen/       (gitignore)
├── Specs/
├── index.html
├── kategorie.html
├── produkt.html
├── shop.html
├── newsletter.html
├── login.html
├── dashboard.html
├── admin.html
├── impressum.html
└── datenschutz.html
```

---

## Seitenstruktur Phase 1

| Seite | Datei | Inhalt |
|-------|-------|--------|
| Startseite | `index.html` | Hero, Kategorien, Featured Produkte, Händler-CTA, Newsletter-CTA, Footer |
| Kategorieseite | `kategorie.html` | Produktgrid gefiltert nach Kategorie |
| Produktseite | `produkt.html` | Bildergalerie, Details, Reservierungsformular, Weitere Artikel |
| Shopseite | `shop.html` | Händler-Header, Banner, Produkte, Beschreibung, Infos |
| Newsletter | `newsletter.html` | Anmeldeformular, Erklärung, Bestätigung |
| Händler-Login | `login.html` | E-Mail + Passwort |
| Händler-Dashboard | `dashboard.html` | Reservierungen, Produkte, Shop-Einstellungen |
| Admin | `admin.html` | Händler, Produkte, Reservierungen, Newsletter-Abonnenten |
| Impressum | `impressum.html` | Standard |
| Datenschutz | `datenschutz.html` | Standard |

---

## Funktionen Phase 1

### Kunden (ohne Account)
- Produkte durchstöbern
- Produkt reservieren: Name + E-Mail, kein Account nötig
- Bestätigungsmail nach Reservierung
- Benachrichtigung "Abholbereit" sobald Händler bestätigt
- Reservierung läuft nach 7 Tagen automatisch ab
- Newsletter abonnieren via CTA

### Händler (Supabase Auth)
- Login, Dashboard mit Reservierungen
- Reservierung bestätigen (löst Kundenmail aus)
- Produkte anlegen/bearbeiten/löschen
- Shopseite pflegen
- Produkte gehen sofort live

### Admin (Florian)
- Händler anlegen/deaktivieren
- Alle Reservierungen und Produkte einsehen
- Newsletter-Abonnenten verwalten
- Kategorien verwalten

### Newsletter
- Monatlicher Auto-Versand neuer Produkte
- Versand via Supabase Edge Functions + Resend.com (gratis)

---

## Supabase Datenbankstruktur

```sql
shops                 — id, name, slug, beschreibung, adresse, oeffnungszeiten, logo_url, banner_url, aktiv
produkte              — id, shop_id, titel, beschreibung, preis, kategorie_id, bilder[], verfuegbar
kategorien            — id, name, slug, bild_url
reservierungen        — id, produkt_id, kunde_name, kunde_email, status, erstellt_am, ablauf_am
newsletter_abonnenten — id, email, aktiv, erstellt_am
```

---

## Phasenübersicht

| Phase | Inhalt | Status |
|-------|--------|--------|
| 1 | GitHub-Repo, Vercel, Ordnerstruktur, CSS-Grunddateien | erledigt |
| 2 | Supabase Setup: DB-Schema, Auth, Storage | als nächstes |
| 3 | Startseite index.html | offen |
| 4 | Kategorieseite + Produktseite + Reservierung + E-Mail-Flow | offen |
| 5 | Shopseite | offen |
| 6 | Newsletter-Anmeldeseite + Auto-Versand | offen |
| 7 | Händler-Login + Dashboard | offen |
| 8 | Admin-Bereich | offen |
| 9 | Amelie Fair Fashion live eintragen | offen |
| 10 | CrossoverDesign + Konfigurator | Zukunft |
| 11 | Weitere Städte | Zukunft |
| 12 | Vollständiger Versand-Marktplatz | Zukunft |

---

## Arbeitskonventionen

- Immer vollständige Datei lesen bevor etwas geändert wird
- Bei jedem CSS-Change Versionsnummer hochzählen (`?v=N`)
- Gebrochenes Verhalten zuerst als Cache-Problem behandeln
- Git nach jeder abgeschlossenen Änderung:

```bash
git add -A && git commit -m "beschreibung" && git push
```
