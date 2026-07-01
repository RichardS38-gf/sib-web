# SIB Design Guide
## Shoppen in Braunschweig — Referenz-Design

Abgeleitet aus den drei fertigen Referenzseiten:
- **Startseite** (`index.html`)
- **Produktdetailseite** (`produkt.html`)
- **Händlerseite** (`shop.html`)

---

## 1. Design-Prinzipien

- **Minimal & sauber** — viel Weißraum, keine visuellen Ablenkungen
- **Schwarz-Weiß-Basis** — kein buntes Design, nur Tintenschwarz (`#0F0F0F`) und Weiß
- **Headlines immer Bold-Sans** — Inter 800, nie Serif für Überschriften
- **Serif nur dekorativ** — Playfair Display ausschließlich für Eyebrow-Badges und Logo-Fallback
- **Pill-Formen** — Buttons und Badges haben immer `border-radius: 999px`
- **Hover = opacity** — Hover-Effekte über `opacity: 0.7` statt Farbwechsel

---

## 2. Design-Tokens (`tokens.css`)

### Farben
| Variable | Wert | Verwendung |
|---|---|---|
| `--color-bg` | `#FFFFFF` | Seiten-Hintergrund |
| `--color-bg-soft` | `#FAFAF8` | Sanfte Sektionshintergründe |
| `--color-ink` | `#0F0F0F` | Texte, Headlines, Buttons |
| `--color-muted` | `#777777` | Subtexte, Labels, sekundäre Info |
| `--color-line` | `#E8E8E8` | Trennlinien, Borders |
| `--color-dark` | `#0F0F0F` | Dunkle Sektionen (Header, Footer, CTA) |
| `--color-on-dark` | `#FAFAF8` | Text auf dunklem Hintergrund |
| `#F5A623` | — | Sterne / Ratings (kein Token) |
| `#ECEEF0` | — | Eyebrow-Badge-Hintergrund (kein Token) |

### Typografie-Skala
| Variable | Wert |
|---|---|
| `--text-xs` | `0.75rem` |
| `--text-sm` | `0.875rem` |
| `--text-base` | `1rem` |
| `--text-lg` | `1.125rem` |
| `--text-xl` | `1.25rem` |
| `--text-2xl` | `1.5rem` |
| `--text-3xl` | `2rem` |
| `--text-4xl` | `2.75rem` |
| `--text-5xl` | `3.75rem` |

### Spacing
| Variable | Wert |
|---|---|
| `--space-1` | `0.5rem` |
| `--space-2` | `1rem` |
| `--space-3` | `1.5rem` |
| `--space-4` | `2rem` |
| `--space-5` | `3rem` |
| `--space-6` | `5rem` |
| `--space-7` | `8rem` |

### Radius
| Variable | Wert |
|---|---|
| `--radius-sm` | `8px` |
| `--radius-md` | `14px` |
| `--radius-lg` | `24px` |
| `--radius-pill` | `999px` |

---

## 3. Typografie-Regeln (`base.css`)

```css
/* Body */
font-family: Inter, font-weight: 400, line-height: 1.6

/* Headlines — alle Größen */
font-family: Inter, font-weight: 800, letter-spacing: -0.02em, line-height: 1.15
h1: 3rem | h2: 2.5rem | h3: 1.75rem | h4: 1.25rem

/* Fließtext */
font-weight: 300, line-height: 1.7

/* Labels (Oberkategorie, Meta) */
font-size: 0.75rem, font-weight: 400, text-transform: uppercase, letter-spacing: 0.08em, color: --color-muted
```

### Serif-Einsatz (Playfair Display)
Nur für:
- Eyebrow-Badges über Headlines (kursiv, groß)
- Logo-Text-Fallback im Header

---

## 4. Seitenstruktur

Jede Seite folgt diesem Grundmuster:

```
<header class="site-header">        ← sticky, dunkel (#0F0F0F), 60px hoch
<main>
  <section class="section">         ← weißer Hintergrund
  <section class="section--soft">   ← sanfter Hintergrund (#FAFAF8)
  <section class="section--dark">   ← dunkler Hintergrund (#0F0F0F)
</main>
<footer class="site-footer">        ← dunkel (#0F0F0F)
```

Sektionen wechseln sich ab: hell → soft → dunkel. CTA-Banner immer dunkel.

### Sektions-Abstände
- Jede `.section` hat `padding-top: 5rem` und `padding-bottom: 5rem`
- Container: max-width 1200px, responsives Padding (1.25rem → 2rem → 3rem)

---

## 5. Header (`components.css`)

```html
<header class="site-header">
  <div class="container">
    <div class="site-header__inner">
      <a class="site-header__logo">          ← Logo-Bild
      <form class="site-header__search">     ← Suchfeld (ab 640px)
      <nav class="site-header__nav">         ← Artikel, Geschäfte
      <div class="site-header__actions">
        <a class="site-header__textlink">    ← "Mein Konto"
        <a class="btn btn--light">           ← "Registrieren"
        <button class="site-header__burger"> ← Mobile
    <div class="site-header__mobile">        ← Mobile-Menü
```

**Regeln:**
- Hintergrund: `#0F0F0F`
- Höhe: 60px
- Sticky (bleibt oben)
- Header-Text immer: `color: var(--color-on-dark)`
- Suchfeld verschwindet unter 640px

---

## 6. Buttons

```css
.btn              ← Basis: border-radius: 999px, padding: 0.75rem 1.5rem
.btn--primary     ← Hintergrund: #0F0F0F, Text: #FAFAF8
.btn--light       ← Hintergrund: #FAFAF8, Text: #0F0F0F
.btn--outline     ← transparent, Border: #0F0F0F
.btn--full        ← width: 100%
```

---

## 7. Badges

```css
.badge            ← Basis-Badge: schwarzer Hintergrund, weißer Text
.badge--outline   ← transparent, schwarzer Border und Text
```

**Eyebrow-Badge** (über Seitenheadlines):
```css
font-family: Playfair Display, italic
background: #ECEEF0
border: none, border-radius: 999px
font-size: 1.125rem
```

---

## 8. Seitenheader-Pattern (Inhaltsseiten)

Für Seiten ohne Hero (FAQ, Über uns, Newsletter etc.):

```html
<section class="section">
  <div class="container">
    <div class="page-head">
      <h1 class="page-head__title">Seitentitel</h1>
      <p class="page-head__subtext">Kurze Beschreibung</p>
    </div>
    <!-- Inhalt -->
  </div>
</section>
```

```css
.page-head {
  max-width: 48rem;
  margin-bottom: var(--space-5);
}
.page-head__title {
  font-family: Inter;
  font-weight: 800;
  font-size: 3rem;
  letter-spacing: -0.02em;
  margin-bottom: var(--space-2);
}
.page-head__subtext {
  font-size: 1.125rem;
  font-weight: 300;
  color: var(--color-muted);
}
```

---

## 9. CTA-Banner (dunkel, mit Glaseffekt)

Für alle Conversion-Sektionen (z. B. "Händler werden"):

```html
<section class="section section--dark">
  <div class="container">
    <div class="glass-card">
      <h2>Headline</h2>
      <p>Subtext</p>
      <a class="btn btn--light">Call to Action</a>
    </div>
  </div>
</section>
```

```css
.glass-card {
  max-width: 660px;
  margin: 0 auto;
  padding: 3rem 2rem;
  background: rgba(255,255,255,0.10);
  border: 1px solid rgba(255,255,255,0.22);
  border-radius: 24px;
  backdrop-filter: blur(14px);
  text-align: center;
}
```

---

## 10. Formulare

```css
.form-group          ← display:flex, flex-direction:column, gap:0.5rem
.form-label          ← font-size: 0.875rem, font-weight: 500
.form-input          ← padding: 0.75rem 1rem, border: 1px solid #E8E8E8,
                        font-size: 1rem, outline:none
.form-input:focus    ← border-color: #0F0F0F
```

---

## 11. Produktkarten (`components.css`)

```html
<div class="product-card">
  <a class="product-card__img-link">
    <div class="product-card__img-wrap">   ← position:relative, aspect-ratio: 3/4
      [NEU/SALE Badge]
      [Herz-Button .product-card__wish]
      <img class="product-card__image">
    </div>
  </a>
  <div class="product-card__body">
    <a class="product-card__content">
      <span class="product-card__shop">   ← Shop-Name (uppercase, muted)
      <span class="product-card__title">  ← Produkttitel
      <div class="product-card__rating">  ← Sterne + Anzahl
    </a>
    <div class="product-card__prices">   ← Preis (+ Streichpreis)
  </div>
</div>
```

Produktkarten-Grid: `.grid-5` (2 Spalten mobil → 3 ab 640px → 5 ab 1024px)

---

## 12. Bewertungskarten

```html
<div class="bw-karte">
  <div class="bw-karte__kopf">
    <span class="bw-karte__autor-datum">Name <span class="bw-karte__datum">am DD.MM.YYYY</span></span>
  </div>
  <div class="bw-karte__sterne">★★★★★ <span class="bw-karte__sterne-text">5 von 5</span></div>
  <p class="bw-karte__text">Bewertungstext</p>
</div>
```

Bewertungs-Grid: `.bewertungen-grid` (1 Spalte → 2 → 3 ab 1024px)

---

## 13. Footer (`components.css`)

```html
<footer class="site-footer">
  <div class="container">
    <div class="site-footer__brand">
      <img class="site-footer__logo-img">   ← Logo-Bild
    </div>
    <div class="site-footer__grid">          ← 4 Spalten ab 900px
      <div class="site-footer__col">Seiten</div>
      <div class="site-footer__col">Für Käufer</div>
      <div class="site-footer__col">Für Händler</div>
      <div class="site-footer__col">Kontakt</div>
    </div>
    <div class="site-footer__bottom">       ← Copyright + Links
  </div>
</footer>
```

**Inhalt der Spalten:**
- **Seiten**: Produkte, Geschäfte entdecken, Newsletter, Über uns, FAQ
- **Für Käufer**: Käufer Konto, Käufer Account erstellen
- **Für Händler**: Händler werden, Händler Dashboard
- **Kontakt**: support@shoppeninbraunschweig.de

---

## 14. CSS-Datei-Übersicht

| Datei | Zuständig für |
|---|---|
| `reset.css` | Box-sizing, Margin-Reset |
| `tokens.css` | Design-Tokens (Farben, Spacing, Radius) |
| `base.css` | Body, Headlines, Links, Labels |
| `layout.css` | Container, Sections, Grids |
| `components.css` | Header, Footer, Buttons, Badges, Cards, Formulare |
| `index.css` | Startseite-spezifisch (Hero, Kategorien) |
| `produkt.css` | Produktdetailseite |
| `shop.css` | Händlerseite |
| `dashboard.css` | Händler-Dashboard |
| `konto.css` | Käufer-Konto |
| `login.css` | Login + Registrieren (Toggle) |

---

## 15. CSS einbinden (Standard-Reihenfolge)

```html
<link rel="stylesheet" href="css/reset.css">
<link rel="stylesheet" href="css/tokens.css">
<link rel="stylesheet" href="css/base.css?v=3">
<link rel="stylesheet" href="css/layout.css?v=4">
<link rel="stylesheet" href="css/components.css?v=12">
<link rel="stylesheet" href="css/[seite].css?v=X">
```

---

## 16. Anwendungs-Checklist pro Seite

Bevor eine Seite als "fertig" gilt:

- [ ] Korrekte CSS-Dateien eingebunden (Reihenfolge beachten)
- [ ] Header identisch mit Referenz (Logo, Suche, Nav, Aktionen, Mobile-Menü)
- [ ] Eyebrow-Badge + h1 mit `.page-head`-Pattern (außer Hero-Seiten)
- [ ] Sektionen wechseln: `.section` → `.section--soft` → `.section--dark`
- [ ] CTA-Sektion mit `.glass-card` und `.btn--light`
- [ ] Footer identisch mit Referenz (4 Spalten, Logo-Bild)
- [ ] Mobile-Menü funktional
- [ ] Alle Links korrekt (Mein Konto, Registrieren)
