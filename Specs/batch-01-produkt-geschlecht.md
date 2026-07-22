# SIB Batch 01 — Produktfeld "Geschlecht" (Herren / Damen / Unisex)

## Kontext

Projekt: Shoppen in Braunschweig (SIB) — Repo-Root ist der Ordner `SIB/`.
Alle Pfade in diesem Batch sind relativ zum Repo-Root.

Produkte bekommen ein neues Feld **Geschlecht** mit genau drei erlaubten Werten:
`Herren`, `Damen`, `Unisex`.

Betroffen sind 4 Bereiche:
1. Supabase-Datenbank (neue Spalte + Migration)
2. Produktseite (`produkt.html` / `js/produkt.js`) — Anzeige
3. Produkt-Modal im Händler- & Admin-Dashboard (`js/produkt-modal.js`) — Pflichtauswahl
4. CSV/xlsx-Import inkl. herunterladbarer Vorlage (`js/produkt-import.js`) — neue Zeile "Geschlecht" mit Dropdown

**Wichtig:** Immer die vollständige Datei lesen, bevor etwas geändert wird.
Nach Abschluss: `git add -A && git commit -m "Batch 01: Produktfeld Geschlecht" && git push`

---

## 1. Supabase-Migration

Neue Datei anlegen: `supabase/migration-geschlecht.sql`

```sql
-- Produktfeld "Geschlecht": Herren / Damen / Unisex
ALTER TABLE produkte
  ADD COLUMN IF NOT EXISTS geschlecht text
  CHECK (geschlecht IN ('Herren', 'Damen', 'Unisex'));

COMMENT ON COLUMN produkte.geschlecht IS 'Zielgruppe des Produkts: Herren, Damen oder Unisex';
```

Hinweise:
- Spalte ist auf DB-Ebene **nullable** (Bestandsprodukte haben noch keinen Wert). Die Pflicht gilt nur in der UI beim Anlegen/Bearbeiten (siehe Abschnitt 3).
- Kein DEFAULT setzen — Händler sollen bewusst wählen.
- Die Migration muss (wie die anderen Migrationen im Projekt) manuell im Supabase SQL-Editor ausgeführt werden. Am Ende der Umsetzung explizit darauf hinweisen, dass dieser Schritt noch aussteht.

---

## 2. Produktseite — Anzeige (`js/produkt.js`)

In `renderDetail()` gibt es bereits Meta-Zeilen für Kategorie und EAN
(`.pdp-meta-row` mit `.pdp-meta-label` / `.pdp-meta-value`).

Neue Meta-Zeile **zwischen Kategorie und EAN** einfügen:

```javascript
const geschlechtHtml = produkt.geschlecht
  ? `<div class="pdp-meta-row"><span class="pdp-meta-label">Geschlecht</span><span class="pdp-meta-value">${esc(produkt.geschlecht)}</span></div>`
  : ''
```

- Nur anzeigen, wenn `geschlecht` gesetzt ist (Bestandsprodukte ohne Wert → Zeile weglassen, kein "—").
- Kein zusätzliches CSS nötig — bestehende `.pdp-meta-row`-Styles wiederverwenden.
- Der Produkt-Query lädt bereits `select('*')`, die Spalte kommt also automatisch mit.

---

## 3. Produkt-Modal — Pflichtauswahl (`js/produkt-modal.js`)

Das Modal wird von Händler-Dashboard UND Admin geteilt — eine Änderung deckt beide ab.

### 3a. Neues Feld im Modal-HTML

In der Row "Kategorie + Verfügbarkeit" (`.pmodal-row` mit `#pmodal-kategorie`)
ein drittes Feld **zwischen Kategorie und Verfügbarkeit** einfügen:

```html
<div class="pmodal-field">
  <label class="pmodal-label" for="pmodal-geschlecht">Geschlecht *</label>
  <select class="form-select" id="pmodal-geschlecht" name="geschlecht" required>
    <option value="">— Bitte wählen —</option>
    <option value="Herren">Herren</option>
    <option value="Damen">Damen</option>
    <option value="Unisex">Unisex</option>
  </select>
</div>
```

Falls die Row dadurch auf Desktop zu eng wird: Row auf 3 Spalten stellen
(analog `pmodal-row--3`, existiert bereits für die Angebots-Row). Mobile-Verhalten prüfen.

### 3b. Validierung in `handleSpeichern()`

Nach der Titel/Preis-Prüfung ergänzen:

```javascript
const geschlecht = document.getElementById('pmodal-geschlecht').value
if (!geschlecht) {
  feedback.innerHTML = '<div class="error-msg">Bitte ein Geschlecht auswählen (Herren, Damen oder Unisex).</div>'
  return
}
```

Und im `daten`-Objekt ergänzen: `geschlecht,`

### 3c. Vorbefüllen in `oeffneProduktModal()`

Bei den anderen Feld-Zuweisungen ergänzen:

```javascript
document.getElementById('pmodal-geschlecht').value = produkt?.geschlecht || ''
```

Damit ist das Feld beim **Bearbeiten** eines Bestandsprodukts leer und muss
vor dem Speichern gewählt werden — genau so gewollt: Bestandsprodukte werden
beim nächsten Bearbeiten nachgepflegt.

---

## 4. Import & Vorlage (`js/produkt-import.js`)

### 4a. Feld-Reihenfolge

In `FELD_REIHENFOLGE` die neue Zeile **nach `'Kategorie'` und vor `'Verfügbar'`** einfügen:

```javascript
'Produktname', 'EAN', 'Beschreibung', 'Preis', 'Kategorie', 'Geschlecht', 'Verfügbar', …
```

(Das Layout ist transponiert — "Geschlecht" wird damit automatisch eine neue **Zeile** in der Vorlage.)

### 4b. Dropdown in der xlsx-Vorlage (`erzeugeUndLadeVorlage`)

Analog zum Verfügbar-Dropdown eine Datenvalidierung für die Geschlecht-Zeile ergänzen:

```javascript
const geschlechtZeile = zeileVon('Geschlecht')
for (let c = 2; c <= VORLAGE_SPALTEN + 1; c++) {
  sheet.getCell(geschlechtZeile, c).dataValidation = {
    type: 'list',
    allowBlank: false,
    formulae: ['"Herren,Damen,Unisex"'],
    showErrorMessage: true,
    errorStyle: 'stop',
    errorTitle: 'Ungültiges Geschlecht',
    error: 'Bitte Herren, Damen oder Unisex auswählen.'
  }
}
```

### 4c. Parsing & Validierung (`verarbeiteProdukt`)

```javascript
const GESCHLECHTER = ['Herren', 'Damen', 'Unisex']

const geschlechtRaw = getFeld(feldMap, 'Geschlecht')
const geschlecht = GESCHLECHTER.find((g) => g.toLowerCase() === geschlechtRaw.toLowerCase()) || null
if (!geschlechtRaw) {
  fehler.push('Geschlecht fehlt (Herren, Damen oder Unisex)')
} else if (!geschlecht) {
  fehler.push(`Geschlecht "${geschlechtRaw}" ungültig — erlaubt: Herren, Damen, Unisex`)
}
```

- `geschlecht` ins Rückgabe-Objekt aufnehmen.
- Case-insensitive matchen, aber immer den korrekt geschriebenen Wert speichern.
- Fehlendes/ungültiges Geschlecht ist ein **Fehler** (Spalte wird übersprungen), keine Warnung.

### 4d. Insert & Vorschau

- Beim `supabase.from('produkte').insert({...})` das Feld `geschlecht: z.geschlecht` ergänzen.
- In der Vorschau-Tabelle eine Spalte "Geschlecht" zwischen "Kategorie" und "Fotos" ergänzen.

---

## Nicht Teil dieses Batches

- Filter nach Geschlecht auf Kategorie-/Suchseiten (späterer Batch)
- Anzeige auf Produktkarten (`product-card.js`)
- Nachpflegen der Bestandsprodukte (passiert organisch beim Bearbeiten)

---

## Erwartetes Ergebnis / Abnahme

1. Migration-Datei existiert unter `supabase/migration-geschlecht.sql` (Hinweis ausgeben: manuell in Supabase ausführen).
2. Händler/Admin können ein Produkt nicht mehr speichern, ohne Geschlecht zu wählen.
3. Produktseite zeigt "Geschlecht: Herren/Damen/Unisex" in den Meta-Zeilen, sofern gesetzt.
4. Heruntergeladene Import-Vorlage enthält die Zeile "Geschlecht" mit Excel-Dropdown (Herren/Damen/Unisex).
5. Import prüft das Feld und lehnt Spalten ohne gültiges Geschlecht mit klarer Fehlermeldung ab.
6. Git-Commit + Push erfolgt.
