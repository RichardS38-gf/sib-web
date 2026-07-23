// js/produkt-import.js — SIB Händler-Dashboard: CSV-Massenimport für Produkte
// ============================================================
// CSV-Layout ist TRANSPONIERT (übersichtlicher für Händler in Excel):
// Spalte A = Feldname (Produktname, Beschreibung, Preis, ...) von oben nach
// unten, jede weitere Spalte (B, C, D, ...) ist EIN Produkt.
//
// Ablauf: Händler lädt eine CSV (+ optional ein ZIP mit Fotos) hoch → Klick auf
// "Datei prüfen" parst alles clientseitig und zeigt eine Vorschau mit Status
// pro Produkt-Spalte (OK / Fehler) → erst nach Bestätigung werden Fotos
// hochgeladen und die Produkte + Größen-Varianten wirklich angelegt.

import { supabase } from './supabase.js'
import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3/+esm'
import ExcelJS from 'https://cdn.jsdelivr.net/npm/exceljs@4/+esm'
import { MODE_KATEGORIE_NAME, UNTERKATEGORIEN, ALLE_GROESSEN_LABELS, ermittleGroessenSet, unterkategorieLabel } from './groessen-config.js'

const GESCHLECHTER = ['Herren', 'Damen', 'Unisex']
const MAX_HIGHLIGHTS = 5
const MAX_FARBEN = 5
const VORLAGE_SPALTEN = 15 // leere Produkt-Spalten in der herunterladbaren Vorlage

// Reihenfolge der Felder von oben nach unten -- gilt für Vorlage UND Einlesen
// Größen-Zeilen decken ALLE möglichen Unterkategorien ab (Oberteile, Hosen,
// Kinderkleidung, Schuhe, Taschen) -- pro Produkt sind nur die Zeilen relevant,
// die zur jeweils gewählten Unterkategorie passen, siehe verarbeiteProdukt().
// Farbvarianten-Zeilen ("Farbe 1 Name/Bild/Stück" ...) beziehen sich mit
// "Bild" auf einen der Dateinamen aus der "Bilder"-Zeile weiter unten.
const FARBEN_FELDER = Array.from({ length: MAX_FARBEN }, (_, i) => i + 1)
  .flatMap((n) => [`Farbe ${n} Name`, `Farbe ${n} Bild`, `Farbe ${n} Stück`])
const FELD_REIHENFOLGE = [
  'Produktname', 'EAN', 'Beschreibung', 'Preis', 'Kategorie', 'Unterkategorie', 'Geschlecht', 'Farbe', 'Verfügbar',
  'Highlight 1', 'Highlight 2', 'Highlight 3', 'Highlight 4', 'Highlight 5',
  ...ALLE_GROESSEN_LABELS.map((g) => `Größe ${g} Stück`),
  ...FARBEN_FELDER,
  'Bilder'
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

function parseGanzzahl (str) {
  const n = parseDezimal(str)
  if (n === null) return null
  return Math.max(0, Math.round(n))
}

// ── ZIP-Fotos extrahieren ──
async function extrahiereFotos (zipDatei) {
  const zip = await JSZip.loadAsync(zipDatei)
  const dateien = new Map() // dateiname (lowercase) -> JSZip-Eintrag
  for (const entry of Object.values(zip.files)) {
    if (entry.dir) continue
    const name = entry.name.split('/').pop()
    if (!/\.(jpe?g|png|webp|gif)$/i.test(name)) continue
    dateien.set(name.toLowerCase(), entry)
  }
  return dateien
}

// ── Eine Produkt-Spalte in ein Produkt-Objekt + Fehlerliste verwandeln ──
function verarbeiteProdukt (feldMap, produktNr, kategorienByName, fotoDateien) {
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

  let kategorieId = null
  const kategorieName = getFeld(feldMap, 'Kategorie')
  if (kategorieName) {
    const gefunden = kategorienByName.get(kategorieName.toLowerCase())
    if (gefunden) {
      kategorieId = gefunden
    } else {
      fehler.push(`Kategorie "${kategorieName}" nicht gefunden`)
    }
  } else {
    fehler.push('Kategorie fehlt')
  }

  // Unterkategorie: nur bei "Mode & Accessoires" relevant -- dort Pflichtfeld,
  // weil davon abhängt, welche Größenspalten überhaupt gültig sind.
  let unterkategorie = null
  const istModeKategorie = kategorieName.trim().toLowerCase() === MODE_KATEGORIE_NAME.toLowerCase()
  const unterkategorieRaw = getFeld(feldMap, 'Unterkategorie')
  if (istModeKategorie) {
    const gefunden = UNTERKATEGORIEN.find((u) =>
      u.value === unterkategorieRaw.toLowerCase() || u.label.toLowerCase() === unterkategorieRaw.toLowerCase())
    if (gefunden) {
      unterkategorie = gefunden.value
    } else {
      fehler.push(`Unterkategorie fehlt oder unbekannt (bei "Mode & Accessoires" erforderlich: ${UNTERKATEGORIEN.map((u) => u.label).join(', ')})`)
    }
  } else if (unterkategorieRaw) {
    warnungen.push('Unterkategorie wird ignoriert, da Kategorie nicht "Mode & Accessoires" ist')
  }

  const geschlechtRaw = getFeld(feldMap, 'Geschlecht')
  const geschlecht = geschlechtRaw ? (GESCHLECHTER.find((g) => g.toLowerCase() === geschlechtRaw.toLowerCase()) || null) : null
  if (geschlechtRaw && !geschlecht) {
    fehler.push(`Geschlecht "${geschlechtRaw}" ungültig — erlaubt: Herren, Damen, Unisex (oder leer lassen)`)
  }

  const verfuegbarRaw = getFeld(feldMap, 'Verfügbar').toLowerCase()
  const verfuegbar = verfuegbarRaw !== 'nein'

  // Farbe: Freitext, optional (z.B. "Oliv" oder "Schwarz/Weiß")
  const farbe = getFeld(feldMap, 'Farbe') || null

  const highlights = []
  for (let i = 1; i <= MAX_HIGHLIGHTS; i++) {
    const val = getFeld(feldMap, `Highlight ${i}`)
    if (val) highlights.push(val)
  }

  // Erlaubtes Größenset basierend auf Kategorie + Unterkategorie (bzw.
  // "Einheitsgröße" für alle Kategorien außer Mode & Accessoires). Nur
  // Größen aus diesem Set werden übernommen -- eine Größe, die nicht dazu
  // passt (z.B. eine Hosengröße bei "Schuhe"), wird als Fehler markiert statt
  // stillschweigend übernommen zu werden.
  const erlaubteGroessen = ermittleGroessenSet(kategorieName, unterkategorie)
  const varianten = []
  ALLE_GROESSEN_LABELS.forEach((g) => {
    const raw = getFeld(feldMap, `Größe ${g} Stück`)
    if (!raw) return
    if (!erlaubteGroessen.includes(g)) {
      fehler.push(`Größe "${g}" passt nicht zur Unterkategorie${unterkategorie ? ` "${unterkategorieLabel(unterkategorie)}"` : ''} und wird nicht übernommen`)
      return
    }
    const stk = parseGanzzahl(raw)
    if (stk === null) {
      warnungen.push(`Stückzahl für Größe ${g} ungültig — Größe wird übersprungen`)
      return
    }
    varianten.push({ groesse: g, stueckzahl: stk })
  })

  const bilderNamen = getFeld(feldMap, 'Bilder')
    .split(';').map((s) => s.trim()).filter(Boolean)
  const bildEintraege = [] // { name, zipEntry }
  bilderNamen.forEach((name) => {
    const eintrag = fotoDateien?.get(name.toLowerCase())
    if (eintrag) {
      bildEintraege.push({ name, zipEntry: eintrag })
    } else if (fotoDateien) {
      warnungen.push(`Foto "${name}" nicht im ZIP gefunden`)
    } else if (bilderNamen.length) {
      warnungen.push(`Foto "${name}" angegeben, aber kein ZIP hochgeladen`)
    }
  })

  // Farbvarianten: "Bild" verweist auf einen Dateinamen aus der Bilder-Zeile.
  // Der Index bezieht sich bewusst auf bildEintraege (nur tatsächlich im ZIP
  // gefundene Fotos), weil genau in dieser Reihenfolge die Fotos beim Import
  // hochgeladen und in produkte.bilder gespeichert werden.
  const farbvarianten = []
  for (let i = 1; i <= MAX_FARBEN; i++) {
    const farbname = getFeld(feldMap, `Farbe ${i} Name`)
    if (!farbname) continue
    const bildRaw = getFeld(feldMap, `Farbe ${i} Bild`)
    let bildIndex = null
    if (bildRaw) {
      const idx = bildEintraege.findIndex((e) => e.name.toLowerCase() === bildRaw.toLowerCase())
      if (idx === -1) {
        warnungen.push(`Farbe "${farbname}": Foto "${bildRaw}" nicht gefunden -- Farbe wird ohne Bild-Zuordnung angelegt`)
      } else {
        bildIndex = idx
      }
    }
    let stk = parseGanzzahl(getFeld(feldMap, `Farbe ${i} Stück`))
    if (stk === null) stk = 1
    farbvarianten.push({ farbe: farbname, bild_index: bildIndex, stueckzahl: stk })
  }

  return {
    produktNr,
    titel,
    ean,
    preis,
    beschreibung: getFeld(feldMap, 'Beschreibung') || null,
    kategorieId,
    kategorieName,
    unterkategorie,
    geschlecht,
    farbe,
    verfuegbar,
    highlights,
    varianten,
    farbvarianten,
    bildEintraege,
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

// ── Vorlage als .xlsx erzeugen -- Kategorie- und Verfügbar-Zeile bekommen ein
// echtes Dropdown (Datenvalidierung), Kategorien live aus der Datenbank. ──
async function erzeugeUndLadeVorlage () {
  const { data: kategorien } = await supabase.from('kategorien').select('name').order('name')
  const kategorienNamen = (kategorien || []).map((k) => k.name).filter(Boolean)

  const workbook = new ExcelJS.Workbook()
  const sheet = workbook.addWorksheet('Produkte')

  sheet.addRow(['Feld', ...Array.from({ length: VORLAGE_SPALTEN }, (_, i) => `Produkt ${i + 1}`)])
  FELD_REIHENFOLGE.forEach((feld) => sheet.addRow([feld]))

  sheet.getColumn(1).width = 26
  for (let c = 2; c <= VORLAGE_SPALTEN + 1; c++) sheet.getColumn(c).width = 22
  sheet.getRow(1).font = { bold: true }
  sheet.getColumn(1).font = { bold: true }

  const zeileVon = (feldName) => 2 + FELD_REIHENFOLGE.indexOf(feldName) // +2: Header-Zeile + 1-indexiert

  if (kategorienNamen.length) {
    const formel = `"${kategorienNamen.join(',')}"`
    const zeile = zeileVon('Kategorie')
    for (let c = 2; c <= VORLAGE_SPALTEN + 1; c++) {
      sheet.getCell(zeile, c).dataValidation = {
        type: 'list',
        allowBlank: false,
        formulae: [formel],
        showErrorMessage: true,
        errorStyle: 'stop',
        errorTitle: 'Ungültige Kategorie',
        error: 'Bitte eine Kategorie aus der Liste auswählen.'
      }
    }
  }

  const unterkategorieZeile = zeileVon('Unterkategorie')
  const unterkategorieFormel = `"${UNTERKATEGORIEN.map((u) => u.label).join(',')}"`
  for (let c = 2; c <= VORLAGE_SPALTEN + 1; c++) {
    sheet.getCell(unterkategorieZeile, c).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [unterkategorieFormel],
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Ungültige Unterkategorie',
      error: `Nur bei Kategorie "Mode & Accessoires" nötig: ${UNTERKATEGORIEN.map((u) => u.label).join(', ')}.`
    }
  }

  const geschlechtZeile = zeileVon('Geschlecht')
  for (let c = 2; c <= VORLAGE_SPALTEN + 1; c++) {
    sheet.getCell(geschlechtZeile, c).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"Herren,Damen,Unisex"'],
      showErrorMessage: true,
      errorStyle: 'stop',
      errorTitle: 'Ungültiges Geschlecht',
      error: 'Bitte Herren, Damen oder Unisex auswählen (oder leer lassen).'
    }
  }

  const verfuegbarZeile = zeileVon('Verfügbar')
  for (let c = 2; c <= VORLAGE_SPALTEN + 1; c++) {
    sheet.getCell(verfuegbarZeile, c).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: ['"ja,nein"']
    }
  }

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

// ── Foto in Supabase Storage hochladen (gleiches Bucket wie im Produkt-Modal) ──
async function ladeFotoHoch (zipEntry, originalName) {
  const blob = await zipEntry.async('blob')
  const ext = originalName.split('.').pop().toLowerCase()
  const pfad = `csv-import/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { data, error } = await supabase.storage
    .from('produkt-bilder')
    .upload(pfad, blob, { cacheControl: '3600', upsert: false })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from('produkt-bilder').getPublicUrl(data.path)
  return publicUrl
}

// ── Öffentliche API ──
export function initProduktImport ({ getShop, onImportiert }) {
  const toggleBtn = document.getElementById('toggle-csv-import')
  const panel = document.getElementById('csv-import-panel')
  const csvInput = document.getElementById('csv-import-file')
  const zipInput = document.getElementById('csv-import-zip')
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
      const { data: kategorien } = await supabase.from('kategorien').select('id, name')
      const kategorienByName = new Map()
      ;(kategorien || []).forEach((k) => kategorienByName.set(k.name.toLowerCase(), k.id))

      const istXlsx = datei.name.toLowerCase().endsWith('.xlsx')
      const rows = istXlsx ? await leseXlsxAlsRows(datei) : parseCsv(await datei.text())

      if (rows.length < 2) {
        statusEl.innerHTML = '<span class="error-msg">Die Datei enthält keine Feld- oder Produktspalten.</span>'
        return
      }

      let fotoDateien = null
      const zipDatei = zipInput.files[0]
      if (zipDatei) {
        statusEl.textContent = 'ZIP wird entpackt…'
        fotoDateien = await extrahiereFotos(zipDatei)
      }

      const produktSpalten = loeseTransponiertAuf(rows)
      verarbeiteteProdukte = produktSpalten
        .map((feldMap, i) => verarbeiteProdukt(feldMap, i + 1, kategorienByName, fotoDateien))
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
              <tr><th>Produkt</th><th>Name</th><th>EAN</th><th>Preis</th><th>Kategorie</th><th>Unterkategorie</th><th>Geschlecht</th><th>Farbe</th><th>Farbvarianten</th><th>Fotos</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${verarbeiteteProdukte.map((z) => `
                <tr${z.ok ? '' : ' class="dash-csv-row--fehler"'}>
                  <td>${z.produktNr}</td>
                  <td class="is-wrap">${esc(z.titel || '—')}</td>
                  <td>${z.ean ? esc(z.ean) : '—'}</td>
                  <td>${z.preis !== null ? z.preis.toFixed(2) + ' €' : '—'}</td>
                  <td>${z.kategorieName ? esc(z.kategorieName) : '—'}</td>
                  <td>${z.unterkategorie ? esc(unterkategorieLabel(z.unterkategorie)) : '—'}</td>
                  <td>${z.geschlecht ? esc(z.geschlecht) : '—'}</td>
                  <td>${z.farbe ? esc(z.farbe) : '—'}</td>
                  <td>${z.farbvarianten.length ? esc(z.farbvarianten.map(f => f.farbe).join(', ')) : '—'}</td>
                  <td>${z.bildEintraege.length}/${z.bildEintraege.length + z.warnungen.filter(w => w.includes('nicht im ZIP') || w.includes('kein ZIP')).length}</td>
                  <td>${z.ok
                    ? `<span class="badge">OK</span>${z.warnungen.length ? `<div class="dash-csv-warnung">${z.warnungen.map(esc).join('<br>')}</div>` : ''}`
                    : `<span class="badge badge--outline">Fehler</span><div class="dash-csv-fehler">${z.fehler.map(esc).join('<br>')}</div>`}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`

      statusEl.innerHTML = `${okAnzahl} von ${verarbeiteteProdukte.length} Produkten bereit zum Import` +
        (fehlerAnzahl ? `, <span class="error-msg">${fehlerAnzahl} mit Fehlern (werden übersprungen)</span>` : '.')

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
        const bildUrls = []
        for (const b of z.bildEintraege) {
          try {
            bildUrls.push(await ladeFotoHoch(b.zipEntry, b.name))
          } catch (fotoErr) {
            console.error(`Foto "${b.name}" konnte nicht hochgeladen werden:`, fotoErr)
          }
        }

        const { data: neuesProdukt, error: insErr } = await supabase.from('produkte').insert({
          shop_id: shop.id,
          titel: z.titel,
          ean: z.ean,
          preis: z.preis,
          beschreibung: z.beschreibung,
          kategorie_id: z.kategorieId,
          unterkategorie: z.unterkategorie,
          geschlecht: z.geschlecht,
          farbe: z.farbe,
          verfuegbar: z.verfuegbar,
          bilder: bildUrls,
          highlights: z.highlights.length ? z.highlights : null,
          freigegeben: false
        }).select('id').single()
        if (insErr) throw insErr

        if (z.varianten.length) {
          await supabase.from('produkt_varianten').insert(
            z.varianten.map((v) => ({ produkt_id: neuesProdukt.id, groesse: v.groesse, stueckzahl: v.stueckzahl }))
          )
        }

        if (z.farbvarianten.length) {
          await supabase.from('produkt_farben').insert(
            z.farbvarianten.map((f) => ({
              produkt_id: neuesProdukt.id,
              farbe: f.farbe,
              bild_url: (f.bild_index !== null && bildUrls[f.bild_index]) ? bildUrls[f.bild_index] : null,
              stueckzahl: f.stueckzahl
            }))
          )
        }

        importiert++
      } catch (err) {
        console.error(`Produkt ${z.produktNr} konnte nicht importiert werden:`, err)
      }
    }

    statusEl.innerHTML = `<span class="success-msg">${importiert} von ${gueltigeProdukte.length} Produkten importiert.</span> Neue Produkte sind wie gewohnt erst nach Freigabe sichtbar.`
    bestaetigenBtn.hidden = true
    bestaetigenBtn.disabled = false
    csvInput.value = ''
    zipInput.value = ''
    verarbeiteteProdukte = []

    if (onImportiert) onImportiert()
  })
}
