// js/produkt-import.js — SIB Händler-Dashboard: CSV-Massenimport für Produkte
// ============================================================
// CSV-Layout ist TRANSPONIERT (übersichtlicher für Händler in Excel):
// Spalte A = Feldname (Produktname, Beschreibung, Preis, ...) von oben nach
// unten, jede weitere Spalte (B, C, D, ...) ist EIN Produkt.
//
// Bewusst schlank gehalten: nur die Basisdaten (Name, EAN, Beschreibung,
// Preis, Highlights) kommen aus der CSV. Kategorie, Geschlecht, Farbe,
// Fotos, Größen und Farbvarianten sind zu variantenreich für ein starres
// Tabellenformat und werden nach dem Import direkt am Produkt über
// "Bearbeiten" gepflegt.
//
// Ablauf: Händler lädt eine CSV hoch → Klick auf "Datei prüfen" parst alles
// clientseitig und zeigt eine Vorschau mit Status pro Produkt-Spalte
// (OK / Fehler) → erst nach Bestätigung werden die Produkte wirklich angelegt.

import { supabase } from './supabase.js'
import ExcelJS from 'https://cdn.jsdelivr.net/npm/exceljs@4/+esm'

const MAX_HIGHLIGHTS = 5
const VORLAGE_SPALTEN = 15 // leere Produkt-Spalten in der herunterladbaren Vorlage

// Reihenfolge der Felder von oben nach unten -- gilt für Vorlage UND Einlesen
const FELD_REIHENFOLGE = [
  'Produktname', 'EAN', 'Beschreibung', 'Preis',
  'Highlight 1', 'Highlight 2', 'Highlight 3', 'Highlight 4', 'Highlight 5'
]

function esc (value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// ── CSV-Parsing (unterstützt Komma- und Semikolon-Trennung, Anführungszeichen) ──
function parseCsv (text) {
  if (text.charCodeAt(0) === 0xFEFF) text = text.slice(1) // BOM entfernen

  const ersteZeile = text.split(/\r?\n/)[0] || ''
  const semikolons = (ersteZeile.match(/;/g) || []).length
  const kommas = (ersteZeile.match(/,/g) || []).length
  const delim = semikolons > kommas ? ';' : ','

  const rows = []
  let row = []
  let feld = ''
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') { feld += '"'; i++ } else { inQuotes = false }
      } else {
        feld += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === delim) {
      row.push(feld); feld = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(feld); feld = ''
      rows.push(row); row = []
    } else {
      feld += c
    }
  }
  if (feld.length || row.length) { row.push(feld); rows.push(row) }

  return rows.filter((r) => r.some((v) => v.trim() !== ''))
}

// Transponiertes Layout auflösen: Spalte A = Feldname, jede weitere Spalte
// = ein Produkt. Ergebnis: ein Array von Maps (feldname-lowercase -> Wert),
// ein Eintrag pro Produkt-Spalte.
function loeseTransponiertAuf (rows) {
  // Erste Zeile ist die Kopfzeile ("Feld, Produkt 1, Produkt 2, ...") und
  // KEINE Datenzeile -- sonst würde "Produkt 2" selbst als Wert im Feld
  // "feld" landen und jede Spalte fälschlich als "nicht leer" gelten.
  const datenZeilen = rows.slice(1)
  const anzahlProdukte = Math.max(0, ...rows.map((r) => r.length - 1))
  const produkte = []
  for (let p = 0; p < anzahlProdukte; p++) {
    const feldMap = {}
    datenZeilen.forEach((r) => {
      const feldName = (r[0] || '').trim().toLowerCase()
      if (!feldName) return
      feldMap[feldName] = (r[p + 1] ?? '').trim()
    })
    produkte.push(feldMap)
  }
  return produkte
}

function getFeld (feldMap, name) {
  return feldMap[name.toLowerCase()] || ''
}

function parseDezimal (str) {
  const s = String(str ?? '').trim()
  if (!s) return null
  let bereinigt = s
  if (bereinigt.includes(',') && !bereinigt.includes('.')) {
    bereinigt = bereinigt.replace(',', '.')
  } else {
    bereinigt = bereinigt.replace(/,/g, '')
  }
  const n = parseFloat(bereinigt)
  return isNaN(n) ? null : n
}

// ── Eine Produkt-Spalte in ein Produkt-Objekt + Fehlerliste verwandeln ──
function verarbeiteProdukt (feldMap, produktNr) {
  // Komplett leere Spalte (z.B. ungenutzte Vorlagen-Spalte) still überspringen
  const alleLeer = Object.values(feldMap).every((v) => !v)
  if (alleLeer) return null

  const fehler = []
  const warnungen = []

  const titel = getFeld(feldMap, 'Produktname')
  const ean = getFeld(feldMap, 'EAN') || null
  const preisRaw = getFeld(feldMap, 'Preis')
  const preis = parseDezimal(preisRaw)

  if (!titel) fehler.push('Produktname fehlt')
  if (preis === null || preis < 0) fehler.push('Preis fehlt oder ungültig')
  if (ean && !/^\d{8,14}$/.test(ean)) warnungen.push(`EAN "${ean}" sieht ungültig aus (8-14 Ziffern erwartet) -- wird trotzdem gespeichert`)

  const highlights = []
  for (let i = 1; i <= MAX_HIGHLIGHTS; i++) {
    const val = getFeld(feldMap, `Highlight ${i}`)
    if (val) highlights.push(val)
  }

  return {
    produktNr,
    titel,
    ean,
    preis,
    beschreibung: getFeld(feldMap, 'Beschreibung') || null,
    highlights,
    fehler,
    warnungen,
    ok: fehler.length === 0
  }
}

// ── xlsx als Zeilen-Array einlesen (gleiche Struktur wie parseCsv liefert) ──
async function leseXlsxAlsRows (datei) {
  const buffer = await datei.arrayBuffer()
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(buffer)
  const sheet = workbook.worksheets[0]
  const rows = []
  sheet.eachRow({ includeEmpty: true }, (row) => {
    const werte = []
    row.eachCell({ includeEmpty: true }, (cell) => {
      const wert = cell.value === null || cell.value === undefined ? '' : String(cell.text ?? cell.value)
      werte.push(wert)
    })
    rows.push(werte)
  })
  return rows.filter((r) => r.some((v) => v.trim() !== ''))
}

// ── Vorlage als .xlsx erzeugen ──
async function erzeugeUndLadeVorlage () {
  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Produkte')

  sheet.addRow(['Feld', ...Array.from({ length: VORLAGE_SPALTEN }, (_, i) => `Produkt ${i + 1}`)])
  FELD_REIHENFOLGE.forEach((feld) => sheet.addRow([feld]))

  sheet.getColumn(1).width = 26
  for (let c = 2; c <= VORLAGE_SPALTEN + 1; c++) sheet.getColumn(c).width = 22
  sheet.getRow(1).font = { bold: true }
  sheet.getColumn(1).font = { bold: true }

  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'produkt-import-vorlage.xlsx'
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

// ── Öffentliche API ──
export function initProduktImport ({ getShop, onImportiert }) {
  const toggleBtn = document.getElementById('toggle-csv-import')
  const panel = document.getElementById('csv-import-panel')
  const csvInput = document.getElementById('csv-import-file')
  const pruefenBtn = document.getElementById('csv-import-pruefen')
  const bestaetigenBtn = document.getElementById('csv-import-bestaetigen')
  const statusEl = document.getElementById('csv-import-status')
  const vorschauEl = document.getElementById('csv-import-vorschau')
  const vorlageBtn = document.getElementById('csv-vorlage-download')
  if (!toggleBtn || !panel) return

  let verarbeiteteProdukte = []

  toggleBtn.addEventListener('click', () => {
    panel.hidden = !panel.hidden
  })

  vorlageBtn?.addEventListener('click', async () => {
    vorlageBtn.disabled = true
    const alterText = vorlageBtn.textContent
    vorlageBtn.textContent = 'Vorlage wird erstellt…'
    try {
      await erzeugeUndLadeVorlage()
    } catch (err) {
      console.error('Vorlage konnte nicht erstellt werden:', err)
      statusEl.innerHTML = '<span class="error-msg">Vorlage konnte nicht erstellt werden.</span>'
    } finally {
      vorlageBtn.disabled = false
      vorlageBtn.textContent = alterText
    }
  })

  pruefenBtn.addEventListener('click', async () => {
    const datei = csvInput.files[0]
    if (!datei) {
      statusEl.innerHTML = '<span class="error-msg">Bitte zuerst eine Datei auswählen.</span>'
      return
    }

    pruefenBtn.disabled = true
    statusEl.textContent = 'Datei wird geprüft…'
    bestaetigenBtn.hidden = true
    vorschauEl.innerHTML = ''

    try {
      const istXlsx = datei.name.toLowerCase().endsWith('.xlsx')
      const rows = istXlsx ? await leseXlsxAlsRows(datei) : parseCsv(await datei.text())

      if (rows.length < 2) {
        statusEl.innerHTML = '<span class="error-msg">Die Datei enthält keine Feld- oder Produktspalten.</span>'
        return
      }

      const produktSpalten = loeseTransponiertAuf(rows)
      verarbeiteteProdukte = produktSpalten
        .map((feldMap, i) => verarbeiteProdukt(feldMap, i + 1))
        .filter(Boolean) // komplett leere Spalten raus

      if (verarbeiteteProdukte.length === 0) {
        statusEl.innerHTML = '<span class="error-msg">Keine ausgefüllten Produkt-Spalten gefunden.</span>'
        return
      }

      const okAnzahl = verarbeiteteProdukte.filter((z) => z.ok).length
      const fehlerAnzahl = verarbeiteteProdukte.length - okAnzahl

      vorschauEl.innerHTML = `
        <div class="dash-table-wrap">
          <table class="dash-table">
            <thead>
              <tr><th>Produkt</th><th>Name</th><th>EAN</th><th>Preis</th><th>Highlights</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${verarbeiteteProdukte.map((z) => `
                <tr${z.ok ? '' : ' class="dash-csv-row--fehler"'}>
                  <td>${z.produktNr}</td>
                  <td class="is-wrap">${esc(z.titel || '—')}</td>
                  <td>${z.ean ? esc(z.ean) : '—'}</td>
                  <td>${z.preis !== null ? z.preis.toFixed(2) + ' €' : '—'}</td>
                  <td>${z.highlights.length || '—'}</td>
                  <td>${z.ok
                    ? `<span class="badge">OK</span>${z.warnungen.length ? `<div class="dash-csv-warnung">${z.warnungen.map(esc).join('<br>')}</div>` : ''}`
                    : `<span class="badge badge--outline">Fehler</span><div class="dash-csv-fehler">${z.fehler.map(esc).join('<br>')}</div>`}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`

      statusEl.innerHTML = `${okAnzahl} von ${verarbeiteteProdukte.length} Produkten bereit zum Import` +
        (fehlerAnzahl ? `, <span class="error-msg">${fehlerAnzahl} mit Fehlern (werden übersprungen)</span>` : '.') +
        ' Kategorie, Fotos, Größen und Farbvarianten pflegst du danach direkt am Produkt über „Bearbeiten".'

      bestaetigenBtn.hidden = okAnzahl === 0
      bestaetigenBtn.textContent = `${okAnzahl} Produkt${okAnzahl === 1 ? '' : 'e'} importieren`
    } catch (err) {
      console.error('CSV-Prüfung fehlgeschlagen:', err)
      statusEl.innerHTML = `<span class="error-msg">Datei konnte nicht gelesen werden: ${esc(err?.message || 'Unbekannter Fehler')}</span>`
    } finally {
      pruefenBtn.disabled = false
    }
  })

  bestaetigenBtn.addEventListener('click', async () => {
    const shop = getShop()
    const gueltigeProdukte = verarbeiteteProdukte.filter((z) => z.ok)
    if (!shop || gueltigeProdukte.length === 0) return

    bestaetigenBtn.disabled = true
    let importiert = 0

    for (const z of gueltigeProdukte) {
      statusEl.textContent = `Importiere ${importiert + 1} von ${gueltigeProdukte.length}…`
      try {
        const { error: insErr } = await supabase.from('produkte').insert({
          shop_id: shop.id,
          titel: z.titel,
          ean: z.ean,
          preis: z.preis,
          beschreibung: z.beschreibung,
          verfuegbar: true,
          highlights: z.highlights.length ? z.highlights : null,
          freigegeben: false
        })
        if (insErr) throw insErr
        importiert++
      } catch (err) {
        console.error(`Produkt ${z.produktNr} konnte nicht importiert werden:`, err)
      }
    }

    statusEl.innerHTML = `<span class="success-msg">${importiert} von ${gueltigeProdukte.length} Produkten importiert.</span> Bitte Kategorie, Fotos, Größen und ggf. Farbvarianten jetzt über „Bearbeiten" ergänzen -- neue Produkte sind wie gewohnt erst nach Freigabe sichtbar.`
    bestaetigenBtn.hidden = true
    bestaetigenBtn.disabled = false
    csvInput.value = ''
    verarbeiteteProdukte = []

    if (onImportiert) onImportiert()
  })
}
