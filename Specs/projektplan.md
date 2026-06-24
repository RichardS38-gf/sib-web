# Shoppen in Braunschweig (SIB) — Projektplan

**Stand:** Juni 2026
**Ziel:** Lokaler Marktplatz für Braunschweiger Innenstadthändler — Phase 1 "Newsletter-Marktplatz" (Reservierung + Abholung, kein Versand)
**Domain:** shoppeninbraunschweig.de (vorerst Vercel-Subdomain, WordPress bleibt vorerst aktiv)
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

**Keine Border-Radius** auf Buttons und Karten — eckig, editorial.
**Bilder dominieren** — große, ehrliche Produktfotos, kein Stock.

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
SIB/
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
│   ├── supabase.js        ← Supabase Client Initialisierung
│   ├── auth.js            ← Login/Logout Logik
│   ├── produkte.js        ← Produkte laden und rendern
│   ├── reservierung.js    ← Reservierungsformular + API-Calls
│   └── dashboard.js       ← Händler-Dashboard Logik
├── Bilder/                ← Logo + statische Assets
├── Händler/               ← Rohmaterial (nicht deployed)
├── Infos/                 ← Rohmaterial
├── Vorlagen/              ← Design-Entwürfe (nicht deployed)
├── Specs/                 ← Projekt-Dokumentation (nicht deployed)
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
| Kategorieseite | `kategorie.html` | Produktgrid gefiltert nach Kategorie, Sidebar-Filter |
| Produktseite | `produkt.html` | Bildergalerie, Details, Reservierungsformular, Weitere Artikel des Händlers |
| Shopseite | `shop.html` | Händler-Header, Banner, Alle Produkte des Händlers, Beschreibung, Infos |
| Newsletter | `newsletter.html` | Anmeldeformular, Erklärung, Bestätigung |
| Händler-Login | `login.html` | E-Mail + Passwort, Passwort vergessen |
| Händler-Dashboard | `dashboard.html` | Reservierungen, Produkte, Shop-Einstellungen |
| Admin | `admin.html` | Händler, alle Produkte, alle Reservierungen, Newsletter-Abonnenten |
| Impressum | `impressum.html` | Standard |
| Datenschutz | `datenschutz.html` | Standard |

---

## Funktionen Phase 1

### Kunden (ohne Account)
- Produkte durchstöbern (Startseite, Kategorien, Shopseiten)
- Produkt reservieren: Name + E-Mail eingeben, kein Account nötig
- Bestätigungsmail nach Reservierung erhalten
- Benachrichtigung "Abholbereit" erhalten, sobald Händler bestätigt
- Reservierung läuft nach 7 Tagen automatisch ab
- Newsletter abonnieren via CTA -> newsletter.html

### Händler (Account via Supabase Auth)
- Login über E-Mail + Passwort
- Dashboard: offene / bestätigte / abgelaufene Reservierungen
- Reservierung bestätigen -> Kunde erhält automatisch Abholbereit-Mail
- Produkte anlegen (Titel, Beschreibung, Preis, Kategorie, bis zu 5 Bilder)
- Produkte bearbeiten und löschen
- Shopseite pflegen: Banner-Bild, Profilbild, Beschreibung, Öffnungszeiten, Adresse
- Produkte gehen sofort live

### Admin (Florian, über admin.html)
- Neue Händler anlegen (Name, E-Mail, Passwort, Shopname, Slug)
- Händler deaktivieren/aktivieren
- Alle Reservierungen einsehen
- Alle Produkte einsehen und bei Bedarf löschen
- Newsletter-Abonnenten einsehen und exportieren
- Kategorien anlegen und verwalten

### Newsletter
- Monatlicher automatischer Versand mit neuen Produkten
- Abonnenten tragen sich auf newsletter.html ein
- Versand über Supabase Edge Functions + Resend.com (gratis bis 3.000 Mails/Monat)

---

## Supabase Datenbankstruktur

```sql
-- Händler
shops (
  id uuid PRIMARY KEY,
  name text,
  slug text UNIQUE,
  beschreibung text,
  adresse text,
  oeffnungszeiten text,
  logo_url text,
  banner_url text,
  aktiv boolean DEFAULT true,
  erstellt_am timestamptz DEFAULT now()
)

-- Produkte
produkte (
  id uuid PRIMARY KEY,
  shop_id uuid REFERENCES shops(id),
  titel text,
  beschreibung text,
  preis numeric,
  kategorie_id uuid REFERENCES kategorien(id),
  bilder text[],
  verfuegbar boolean DEFAULT true,
  erstellt_am timestamptz DEFAULT now()
)

-- Kategorien
kategorien (
  id uuid PRIMARY KEY,
  name text,
  slug text UNIQUE,
  bild_url text
)

-- Reservierungen
reservierungen (
  id uuid PRIMARY KEY,
  produkt_id uuid REFERENCES produkte(id),
  kunde_name text,
  kunde_email text,
  status text DEFAULT 'offen',   -- offen | bestaetigt | abgeholt | abgelaufen
  erstellt_am timestamptz DEFAULT now(),
  ablauf_am timestamptz
)

-- Newsletter-Abonnenten
newsletter_abonnenten (
  id uuid PRIMARY KEY,
  email text UNIQUE,
  aktiv boolean DEFAULT true,
  erstellt_am timestamptz DEFAULT now()
)
```

---

## Phasenübersicht

| Phase | Inhalt | Status |
|-------|--------|--------|
| 1 | GitHub-Repo, Vercel, Ordnerstruktur, CSS-Grunddateien | **als nächstes** |
| 2 | Supabase Setup: DB-Schema, Auth, Storage-Bucket | offen |
| 3 | Startseite `index.html` (Daten live aus Supabase) | offen |
| 4 | Kategorieseite + Produktseite + Reservierungsformular + E-Mail-Flow | offen |
| 5 | Shopseite (öffentliches Händlerprofil) | offen |
| 6 | Newsletter-Anmeldeseite + monatlicher Auto-Versand | offen |
| 7 | Händler-Login + Dashboard (Reservierungen + Produkte verwalten) | offen |
| 8 | Admin-Bereich | offen |
| 9 | Amelie Fair Fashion eintragen (echte Daten, echte Bilder) | offen |
| 10 | CrossoverDesign + Produkt-Konfigurator (Custom-Print, Bild-Upload) | Zukunft |
| 11 | Weitere Städte / Multi-City | Zukunft |
| 12 | Vollständiger Versand-Marktplatz (Kundenaccounts, Zahlung) | Zukunft |

---

## Arbeitskonventionen

- Immer vollständige Datei lesen bevor etwas geändert wird
- Bei jedem CSS-Change Versionsnummer hochzählen (`?v=N`)
- Gebrochenes Verhalten zuerst als Cache-Problem behandeln
- Seitenspezifische Fixes im `<style>`-Tag direkt in der HTML-Datei
- Geteiltes CSS nur für Elemente die mehrere Seiten teilen
- Git nach jeder abgeschlossenen Änderung:

```bash
git add -A && git commit -m "beschreibung" && git push
```

---

## Nächster Schritt

Phase 1 starten: Spec-Datei `Specs/phase-1-setup.md` schreiben und an Claude Code übergeben.
Inhalt: GitHub-Repo anlegen, Vercel verbinden, Ordnerstruktur, alle CSS-Grunddateien mit tokens.css befüllt.
