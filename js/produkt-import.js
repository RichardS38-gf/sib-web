// js/produkt-import.js — SIB Händler-Dashboard: CSV-Massenimport für Produkte
// ============================================================
// Ablauf: Händler lädt eine CSV (+ optional ein ZIP mit Fotos) hoch → Klick auf
// "Datei prüfen" parst alles clientseitig und zeigt eine Vorschau mit Status
// pro Zeile (OK / Fehler) → erst nach Bestätigung werden Fotos hochgeladen und
// die Produkte + Größen-Varianten wirklich in der Datenbank angelegt.

import { supabase } from './supabase.js'
import JSZip from 'https://cdn.jsdelivr.net/npm/jszip@3/+esm'

const GROESSEN = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Einheitsgröße']
const MAX_HIGHLIGHTS = 5

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

function parseDatum (str) {
  const s = String(str ?? '').trim()
  const m = s.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/)
  if (!m) return null
  const [, t, mo, j] = m
  return `${j}-${mo.padStart(2, '0')}-${t.padStart(2, '0')}`
}

// Header-Zeile in ein Lookup verwandeln: normalisierter Name -> Spalten-Index
function baueHeaderIndex (headerRow) {
  const index = {}
  headerRow.forEach((h, i) => {
    index[h.trim().toLowerCase()] = i
  })
  return index
}

function getFeld (row, headerIndex, name) {
  const i = headerIndex[name.toLowerCase()]
  return i === undefined ? '' : (row[i] ?? '').trim()
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

// ── Eine CSV-Zeile in ein Produkt-Objekt + Fehlerliste verwandeln ──
function verarbeiteZeile (row, headerIndex, zeilenNr, kategorienByName, fotoDateien) {
  const fehler = []
  const warnungen = []

  const titel = getFeld(row, headerIndex, 'Titel')
  const preisRaw = getFeld(row, headerIndex, 'Preis')
  const preis = parseDezimal(preisRaw)

  if (!titel) fehler.push('Titel fehlt')
  if (preis === null || preis < 0) fehler.push('Preis fehlt oder ungültig')

  let kategorieId = null
  const kategorieName = getFeld(row, headerIndex, 'Kategorie')
  if (kategorieName) {
    const gefunden = kategorienByName.get(kategorieName.toLowerCase())
    if (gefunden) {
      kategorieId = gefunden
    } else {
      fehler.push(`Kategorie "${kategorieName}" nicht gefunden`)
    }
  }

  const verfuegbarRaw = getFeld(row, headerIndex, 'Verfügbar').toLowerCase()
  const verfuegbar = verfuegbarRaw === 'nein' ? false : true

  const angebotspreis = parseDezimal(getFeld(row, headerIndex, 'Angebotspreis'))
  const angebotVonRaw = getFeld(row, headerIndex, 'Angebot gültig ab')
  const angebotBisRaw = getFeld(row, headerIndex, 'Angebot gültig bis')
  let angebotVon = null
  let angebotBis = null
  if (angebotVonRaw) {
    angebotVon = parseDatum(angebotVonRaw)
    if (!angebotVon) warnungen.push(`Datum "Angebot gültig ab" ungültig (erwartet TT.MM.JJJJ) — ignoriert`)
  }
  if (angebotBisRaw) {
    angebotBis = parseDatum(angebotBisRaw)
    if (!angebotBis) warnungen.push(`Datum "Angebot gültig bis" ungültig (erwartet TT.MM.JJJJ) — ignoriert`)
  }

  const highlights = []
  for (let i = 1; i <= MAX_HIGHLIGHTS; i++) {
    const val = getFeld(row, headerIndex, `Highlight ${i}`)
    if (val) highlights.push(val)
  }

  const varianten = []
  GROESSEN.forEach((g) => {
    const raw = getFeld(row, headerIndex, `Größe ${g} Stück`)
    if (!raw) return
    const stk = parseGanzzahl(raw)
    if (stk === null) {
      warnungen.push(`Stückzahl für Größe ${g} ungültig — Größe wird übersprungen`)
      return
    }
    varianten.push({ groesse: g, stueckzahl: stk })
  })

  const bilderNamen = getFeld(row, headerIndex, 'Bilder')
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

  return {
    zeilenNr,
    titel,
    preis,
    beschreibung: getFeld(row, headerIndex, 'Beschreibung') || null,
    kategorieId,
    kategorieName,
    verfuegbar,
    angebotspreis,
    angebotVon,
    angebotBis,
    highlights,
    varianten,
    bildEintraege,
    fehler,
    warnungen,
    ok: fehler.length === 0
  }
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
  if (!toggleBtn || !panel) return

  let verarbeiteteZeilen = []

  toggleBtn.addEventListener('click', () => {
    panel.hidden = !panel.hidden
  })

  pruefenBtn.addEventListener('click', async () => {
    const csvDatei = csvInput.files[0]
    if (!csvDatei) {
      statusEl.innerHTML = '<span class="error-msg">Bitte zuerst eine CSV-Datei auswählen.</span>'
      return
    }

    pruefenBtn.disabled = true
    statusEl.textContent = 'Datei wird geprüft…'
    bestaetigenBtn.hidden = true
    vorschauEl.innerHTML = ''

    try {
      const [text, { data: kategorien }] = await Promise.all([
        csvDatei.text(),
        supabase.from('kategorien').select('id, name')
      ])

      const kategorienByName = new Map()
      ;(kategorien || []).forEach((k) => kategorienByName.set(k.name.toLowerCase(), k.id))

      const rows = parseCsv(text)
      if (rows.length < 2) {
        statusEl.innerHTML = '<span class="error-msg">Die CSV-Datei enthält keine Produktzeilen.</span>'
        return
      }
      const headerIndex = baueHeaderIndex(rows[0])
      const datenZeilen = rows.slice(1)

      let fotoDateien = null
      const zipDatei = zipInput.files[0]
      if (zipDatei) {
        statusEl.textContent = 'ZIP wird entpackt…'
        fotoDateien = await extrahiereFotos(zipDatei)
      }

      verarbeiteteZeilen = datenZeilen.map((row, i) =>
        verarbeiteZeile(row, headerIndex, i + 2, kategorienByName, fotoDateien))

      const okAnzahl = verarbeiteteZeilen.filter((z) => z.ok).length
      const fehlerAnzahl = verarbeiteteZeilen.length - okAnzahl

      vorschauEl.innerHTML = `
        <div class="dash-table-wrap">
          <table class="dash-table">
            <thead>
              <tr><th>Zeile</th><th>Titel</th><th>Preis</th><th>Kategorie</th><th>Fotos</th><th>Status</th></tr>
            </thead>
            <tbody>
              ${verarbeiteteZeilen.map((z) => `
                <tr${z.ok ? '' : ' class="dash-csv-row--fehler"'}>
                  <td>${z.zeilenNr}</td>
                  <td class="is-wrap">${esc(z.titel || '—')}</td>
                  <td>${z.preis !== null ? z.preis.toFixed(2) + ' €' : '—'}</td>
                  <td>${z.kategorieName ? esc(z.kategorieName) : '—'}</td>
                  <td>${z.bildEintraege.length}/${z.bildEintraege.length + z.warnungen.filter(w => w.includes('nicht im ZIP') || w.includes('kein ZIP')).length}</td>
                  <td>${z.ok
                    ? `<span class="badge">OK</span>${z.warnungen.length ? `<div class="dash-csv-warnung">${z.warnungen.map(esc).join('<br>')}</div>` : ''}`
                    : `<span class="badge badge--outline">Fehler</span><div class="dash-csv-fehler">${z.fehler.map(esc).join('<br>')}</div>`}
                  </td>
                </tr>`).join('')}
            </tbody>
          </table>
        </div>`

      statusEl.innerHTML = `${okAnzahl} von ${verarbeiteteZeilen.length} Zeilen bereit zum Import` +
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
    const gueltigeZeilen = verarbeiteteZeilen.filter((z) => z.ok)
    if (!shop || gueltigeZeilen.length === 0) return

    bestaetigenBtn.disabled = true
    let importiert = 0

    for (const z of gueltigeZeilen) {
      statusEl.textContent = `Importiere ${importiert + 1} von ${gueltigeZeilen.length}…`
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
          preis: z.preis,
          beschreibung: z.beschreibung,
          kategorie_id: z.kategorieId,
          verfuegbar: z.verfuegbar,
          bilder: bildUrls,
          highlights: z.highlights.length ? z.highlights : null,
          angebotspreis: z.angebotspreis,
          angebot_von: z.angebotVon,
          angebot_bis: z.angebotBis,
          freigegeben: false
        }).select('id').single()
        if (insErr) throw insErr

        if (z.varianten.length) {
          await supabase.from('produkt_varianten').insert(
            z.varianten.map((v) => ({ produkt_id: neuesProdukt.id, groesse: v.groesse, stueckzahl: v.stueckzahl }))
          )
        }

        importiert++
      } catch (err) {
        console.error(`Zeile ${z.zeilenNr} konnte nicht importiert werden:`, err)
      }
    }

    statusEl.innerHTML = `<span class="success-msg">${importiert} von ${gueltigeZeilen.length} Produkten importiert.</span> Neue Produkte sind wie gewohnt erst nach Freigabe sichtbar.`
    bestaetigenBtn.hidden = true
    bestaetigenBtn.disabled = false
    csvInput.value = ''
    zipInput.value = ''
    verarbeiteteZeilen = []

    if (onImportiert) onImportiert()
  })
}
