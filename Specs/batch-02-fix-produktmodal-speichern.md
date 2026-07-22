# SIB Batch 02 — Bugfix: Produkt-Modal Speichern hängt ("Wird gespeichert…")

## Kontext

Nach Batch 01 (Geschlecht-Feld) bleibt beim Bearbeiten eines Produkts im
Händler-Dashboard der Speichern-Button dauerhaft auf "Wird gespeichert…" und
deaktiviert. Das Modal schließt nicht, es erscheint keine Fehlermeldung.
Der Nutzer soll (wie bisher vorgesehen) **ausschließlich manuell** per
Speichern-Button speichern — ein Auto-Speichern existiert nicht und soll auch
nicht eingebaut werden.

Betroffene Datei: `js/produkt-modal.js` (geteilt von Händler- und Admin-Dashboard).

**Wichtig:** Immer die vollständige Datei lesen, bevor etwas geändert wird.
Nach Abschluss: `git add -A && git commit -m "Batch 02: Fix Produkt-Modal Speichern" && git push`

---

## Schritt 0 — Ursache live reproduzieren (Pflicht, vor jedem Fix)

1. Lokal `dashboard.html` öffnen (bzw. via `npx serve` o.ä.), als Händler einloggen,
   ein Produkt bearbeiten, Geschlecht wählen, Speichern klicken.
2. Browser-Konsole und Netzwerk-Tab beobachten:
   - Kommt der PATCH-Request an `…/rest/v1/produkte` zurück? Mit welchem Status/Body?
   - Typischer Kandidat: `PGRST204 — Could not find the 'geschlecht' column of 'produkte' in the schema cache`
     → Migration `supabase/migration-geschlecht.sql` wurde noch nicht ausgeführt
     ODER der PostgREST-Schema-Cache ist veraltet (in Supabase: Settings → API → "Reload schema cache",
     alternativ SQL: `NOTIFY pgrst, 'reload schema';`).
3. Befund kurz dokumentieren (Kommentar im Commit reicht), dann fixen.

---

## Fix 1 — Button-Zustand robust machen (`handleSpeichern`)

Der Button wird aktuell nur im `catch` wieder aktiviert. Umbauen auf `finally`,
sodass der Button in JEDEM Ausgang (Erfolg, Fehler, unerwartete Exception)
zurückgesetzt wird. Bei Erfolg schließt das Modal ohnehin — das Zurücksetzen
schadet dann nicht, verhindert aber jeden hängenden Zustand:

```javascript
const submitBtn = document.getElementById('pmodal-submit')
submitBtn.disabled = true
submitBtn.textContent = 'Wird gespeichert…'

try {
  // … bestehende Speicherlogik …
} catch (err) {
  console.error('Speichern fehlgeschlagen:', err)
  feedback.innerHTML = `<div class="error-msg">Speichern fehlgeschlagen: ${err?.message || JSON.stringify(err)}</div>`
} finally {
  submitBtn.disabled = false
  submitBtn.textContent = 'Speichern'
}
```

Zusätzlich beim Update `.select('id')` anhängen, damit PostgREST eine
auswertbare Antwort liefert und RLS-Sonderfälle (0 betroffene Zeilen) sichtbar werden:

```javascript
const { data: upd, error } = await supabase
  .from('produkte')
  .update(daten)
  .eq('id', aktuellesProduktId)
  .select('id')
if (error) throw error
if (!upd || upd.length === 0) {
  throw new Error('Keine Zeile aktualisiert — Produkt nicht gefunden oder keine Berechtigung (RLS).')
}
```

---

## Fix 2 — Callback-Bug: Produktliste wird nach Bearbeiten nie neu geladen

Aktueller Code (Update-Pfad):

```javascript
schliesseProduktModal()          // setzt onSaveCallback = null …
if (onSaveCallback) onSaveCallback(null)   // … deshalb läuft das hier NIE
```

Korrigieren, indem der Callback VOR dem Schließen gesichert wird:

```javascript
const cb = onSaveCallback
schliesseProduktModal()
if (cb) cb(null)
```

Denselben Blick auf den Anlegen-Pfad werfen (`await onSaveCallback(daten)` läuft
vor `schliesseProduktModal()` — der ist okay, nicht anfassen).

---

## Fix 3 — Fehlermeldung sichtbar machen

Wenn ein Fehler auftritt, soll die Meldung im `#pmodal-feedback` erscheinen UND
das Modal automatisch dorthin scrollen, damit sie bei langem Formular nicht
außerhalb des sichtbaren Bereichs liegt:

```javascript
feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
```

Speziell für den Fall "Spalte fehlt" eine verständliche Meldung ausgeben:
Wenn `err?.code === 'PGRST204'` oder die Message `geschlecht` + `column` enthält →
`"Die Datenbank kennt das Feld 'Geschlecht' noch nicht — bitte Migration supabase/migration-geschlecht.sql in Supabase ausführen."`

---

## Ausdrücklich NICHT ändern

- Kein Auto-Speichern bei Änderungen einbauen — gespeichert wird nur per Klick
  auf den Speichern-Button. (Das ist bereits so und bleibt so.)
- Keine Änderungen an Batch-01-Funktionalität (Pflichtfeld Geschlecht bleibt).

---

## Abschluss

1. Cache-Busting: Import-Version in `js/dashboard.js` hochzählen
   (`./produkt-modal.js?v=4`) und prüfen, ob `admin.js` das Modal ebenfalls
   versioniert importiert — falls ja, dort gleichziehen. `dashboard.html`
   Script-Version (`js/dashboard.js?v=…`) ebenfalls hochzählen; analog die
   Admin-Seite, falls betroffen.
2. Testablauf dokumentieren: Produkt bearbeiten → Geschlecht ändern → Speichern
   → Modal schließt → Produktliste aktualisiert sich → Produktseite zeigt Geschlecht.
3. `git add -A && git commit -m "Batch 02: Fix Produkt-Modal Speichern" && git push`
4. Falls in Schritt 0 festgestellt wurde, dass die Migration fehlt: am Ende
   deutlich darauf hinweisen, dass `supabase/migration-geschlecht.sql` manuell
   ausgeführt werden muss.
