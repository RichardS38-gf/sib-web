// js/produkt-modal.js
// Geteiltes Produkt-Modal für Händler- und Admin-Dashboard.
// Unterstützt Anlegen + Bearbeiten inkl. Multi-Foto-Upload, Features, Angebotspreis.

import { supabase } from './supabase.js'
import { UNTERKATEGORIEN, MODE_KATEGORIE_NAME, ermittleGroessenSet } from './groessen-config.js'

let onSaveCallback = null
let aktuellesProduktId = null
let bildUrls = []
let featuresList = []
let aktuelleVarianten = []
let aktuelleFarben = []
const MAX_FEATURES = 5

// ── Modal-HTML einmalig in den DOM injizieren ──
export function initProduktModal () {
  if (document.getElementById('produkt-modal')) return

  const el = document.createElement('div')
  el.id = 'produkt-modal'
  el.hidden = true
  el.innerHTML = `
    <div class="pmodal-backdrop"></div>
    <div class="pmodal-box" role="dialog" aria-modal="true" aria-labelledby="pmodal-title">
      <div class="pmodal-header">
        <h2 class="pmodal-title" id="pmodal-title">Produkt anlegen</h2>
        <button class="pmodal-close" type="button" aria-label="Schließen">&#x2715;</button>
      </div>

      <div class="pmodal-body">

        <!-- Fotos -->
        <div class="pmodal-section">
          <p class="pmodal-label">Fotos</p>
          <div class="pmodal-thumbs" id="pmodal-thumbs"></div>
          <label class="pmodal-upload-area">
            <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
            <span>Fotos hochladen</span>
            <input type="file" id="pmodal-file-input" accept="image/*" multiple style="display:none">
          </label>
          <p class="pmodal-upload-hint" id="pmodal-upload-status"></p>
        </div>

        <form id="pmodal-form" novalidate>

          <!-- Händler-Auswahl (nur im Admin-Kontext sichtbar) -->
          <div class="pmodal-field" id="pmodal-shop-group" hidden>
            <label class="pmodal-label" for="pmodal-shop">Händler *</label>
            <select class="form-select" id="pmodal-shop" name="shop_id">
              <option value="">— Händler wählen —</option>
            </select>
          </div>

          <!-- Titel + Preis -->
          <div class="pmodal-row">
            <div class="pmodal-field">
              <label class="pmodal-label" for="pmodal-titel">Titel *</label>
              <input class="form-input" id="pmodal-titel" name="titel" type="text" autocomplete="off" required>
            </div>
            <div class="pmodal-field pmodal-field--sm">
              <label class="pmodal-label" for="pmodal-preis">Preis (€) *</label>
              <input class="form-input" id="pmodal-preis" name="preis" type="number" min="0" step="0.01">
            </div>
          </div>

          <!-- Kategorie + Geschlecht -->
          <div class="pmodal-row">
            <div class="pmodal-field">
              <label class="pmodal-label" for="pmodal-kategorie">Kategorie *</label>
              <select class="form-select" id="pmodal-kategorie" name="kategorie_id" required>
                <option value="">— Bitte wählen —</option>
              </select>
            </div>
            <div class="pmodal-field">
              <label class="pmodal-label" for="pmodal-geschlecht">Geschlecht <span class="pmodal-hint-inline">(optional)</span></label>
              <select class="form-select" id="pmodal-geschlecht" name="geschlecht">
                <option value="">— Kein Geschlecht —</option>
                <option value="Herren">Herren</option>
                <option value="Damen">Damen</option>
                <option value="Unisex">Unisex</option>
              </select>
            </div>
          </div>

          <!-- Unterkategorie (nur bei Mode & Accessoires) -->
          <div class="pmodal-field" id="pmodal-unterkategorie-group" hidden>
            <label class="pmodal-label" for="pmodal-unterkategorie">Unterkategorie *</label>
            <select class="form-select" id="pmodal-unterkategorie" name="unterkategorie">
              <option value="">— Bitte wählen —</option>
              ${UNTERKATEGORIEN.map((u) => `<option value="${u.value}">${u.label}</option>`).join('')}
            </select>
          </div>

          <!-- Größen & Stück -->
          <div class="pmodal-field">
            <label class="pmodal-label">Größen &amp; Stück</label>
            <div class="dash-groessen" id="pmodal-groessen-list"></div>
          </div>

          <!-- EAN -->
          <div class="pmodal-field">
            <label class="pmodal-label" for="pmodal-ean">EAN <span class="pmodal-hint-inline">(optional)</span></label>
            <input class="form-input" id="pmodal-ean" name="ean" type="text" inputmode="numeric" autocomplete="off" placeholder="z.B. 4006381333931">
          </div>

          <!-- Angebotspreis + Zeitraum -->
          <div class="pmodal-section pmodal-angebot-section">
            <p class="pmodal-label pmodal-label--muted">Angebot (optional)</p>
            <div class="pmodal-row pmodal-row--3">
              <div class="pmodal-field pmodal-field--sm">
                <label class="pmodal-label" for="pmodal-angebotspreis">Angebotspreis (€)</label>
                <input class="form-input" id="pmodal-angebotspreis" name="angebotspreis" type="number" min="0" step="0.01" placeholder="z.B. 59.99">
              </div>
              <div class="pmodal-field">
                <label class="pmodal-label" for="pmodal-angebot-von">Gültig ab</label>
                <input class="form-input" id="pmodal-angebot-von" name="angebot_von" type="date">
              </div>
              <div class="pmodal-field">
                <label class="pmodal-label" for="pmodal-angebot-bis">Gültig bis</label>
                <div class="pmodal-angebot-bis-wrap">
                  <input class="form-input" id="pmodal-angebot-bis" name="angebot_bis" type="date">
                  <button type="button" class="pmodal-angebot-remove" id="pmodal-angebot-remove" title="Angebot entfernen">&#x2715;</button>
                </div>
              </div>
            </div>
            <p class="pmodal-hint">Wird im Shop als Streichpreis angezeigt, solange der Zeitraum aktiv ist.</p>
          </div>

          <!-- Beschreibung -->
          <div class="pmodal-field">
            <label class="pmodal-label" for="pmodal-beschreibung">Beschreibung</label>
            <textarea class="form-input pmodal-textarea" id="pmodal-beschreibung" name="beschreibung" rows="3"></textarea>
          </div>

          <!-- Features / Highlights -->
          <div class="pmodal-field">
            <label class="pmodal-label">Features / Highlights</label>
            <div class="pmodal-features" id="pmodal-features-list"></div>
            <button type="button" class="pmodal-add-btn" id="pmodal-add-feature">+ Feature hinzufügen</button>
          </div>

          <!-- Details-Bild -->
          <div class="pmodal-field">
            <label class="pmodal-label">Details-Bild <span class="pmodal-hint-inline">(wird neben den Features angezeigt)</span></label>
            <div class="pmodal-details-bild-preview" id="pmodal-details-bild-preview"></div>
            <label class="pmodal-upload-area pmodal-upload-area--sm">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
              <span>Bild hochladen</span>
              <input type="file" id="pmodal-details-bild-input" accept="image/*" style="display:none">
            </label>
            <button type="button" class="pmodal-details-bild-remove" id="pmodal-details-bild-remove" hidden>Bild entfernen</button>
            <span class="pmodal-upload-hint" id="pmodal-details-bild-status"></span>
          </div>

          <!-- Farbvarianten -->
          <div class="pmodal-field">
            <label class="pmodal-check">
              <input type="checkbox" id="pmodal-hat-farbvarianten">
              <span>Dieses Produkt hat mehrere Farbvarianten (mit eigenem Foto je Farbe)</span>
            </label>
            <div id="pmodal-farben-wrap" hidden>
              <div class="pmodal-farbe-header"><span>Farbe</span><span>Foto</span><span>Stück</span><span></span></div>
              <div class="pmodal-farben" id="pmodal-farben-list"></div>
              <button type="button" class="pmodal-add-btn" id="pmodal-add-farbe">+ Farbvariante hinzufügen</button>
              <p class="pmodal-hint">Die Fotos oben werden in der Galerie zuerst gezeigt, die Farb-Fotos danach. Wählt jemand auf der Produktseite eine Farbe, springt die Galerie automatisch zum passenden Foto.</p>
            </div>
          </div>

          <!-- Farbe -->
          <div class="pmodal-field">
            <label class="pmodal-label" for="pmodal-farbe">Farbe <span class="pmodal-hint-inline">(optional, Freitext — nur ohne Farbvarianten)</span></label>
            <input class="form-input" id="pmodal-farbe" name="farbe" type="text" autocomplete="off" placeholder="z.B. Oliv, Schwarz/Weiß">
          </div>

          <!-- Kategorie + Verfügbarkeit -->
          <div class="pmodal-row">
            <div class="pmodal-field">
              <label class="pmodal-label">Verfügbarkeit</label>
              <label class="pmodal-check">
                <input type="checkbox" id="pmodal-verfuegbar" name="verfuegbar" checked>
                <span>Verfügbar</span>
              </label>
            </div>
          </div>

          <div id="pmodal-feedback" aria-live="polite"></div>

          <div class="pmodal-actions">
            <button type="button" class="btn btn--outline" id="pmodal-cancel">Abbrechen</button>
            <button type="submit" class="btn btn--primary" id="pmodal-submit">Speichern</button>
          </div>
        </form>
      </div>
    </div>`

  document.body.appendChild(el)

  el.querySelector('.pmodal-backdrop').addEventListener('click', schliesseProduktModal)
  el.querySelector('.pmodal-close').addEventListener('click', schliesseProduktModal)
  document.getElementById('pmodal-cancel').addEventListener('click', schliesseProduktModal)
  document.getElementById('pmodal-file-input').addEventListener('change', handleDateiUpload)
  document.getElementById('pmodal-details-bild-input').addEventListener('change', handleDetailsBildUpload)
  document.getElementById('pmodal-details-bild-remove').addEventListener('click', () => {
    setzeDetailsBildPreview(null)
  })
  document.getElementById('pmodal-angebot-remove').addEventListener('click', () => {
    document.getElementById('pmodal-angebotspreis').value = ''
    document.getElementById('pmodal-angebot-von').value = ''
    document.getElementById('pmodal-angebot-bis').value = ''
  })
  document.getElementById('pmodal-add-feature').addEventListener('click', () => {
    if (featuresList.length >= MAX_FEATURES) return
    featuresList.push('')
    renderFeatures()
    // Fokus auf das neue Feld
    const inputs = document.querySelectorAll('.pmodal-feature-input')
    inputs[inputs.length - 1]?.focus()
  })
  document.getElementById('pmodal-add-farbe').addEventListener('click', () => {
    aktuelleFarben.push({ farbe: '', bild_url: null, stueckzahl: 1 })
    renderFarben()
    const inputs = document.querySelectorAll('.pmodal-farbe-name')
    inputs[inputs.length - 1]?.focus()
  })
  document.getElementById('pmodal-hat-farbvarianten').addEventListener('change', (e) => {
    const checked = e.target.checked
    document.getElementById('pmodal-farben-wrap').hidden = !checked
    const farbeInput = document.getElementById('pmodal-farbe')
    farbeInput.disabled = checked
    if (checked) {
      farbeInput.value = ''
      if (aktuelleFarben.length === 0) {
        aktuelleFarben.push({ farbe: '', bild_url: null, stueckzahl: 1 })
        renderFarben()
      }
    }
  })
  document.getElementById('pmodal-form').addEventListener('submit', handleSpeichern)

  document.getElementById('pmodal-kategorie').addEventListener('change', () => {
    aktualisiereUnterkategorieSichtbarkeit()
    renderGroessenGrid()
  })
  document.getElementById('pmodal-unterkategorie').addEventListener('change', renderGroessenGrid)

  // Enter in einem einzeiligen Feld (Titel, Preis, Angebot, Features, ...) darf
  // das Formular NICHT automatisch abschicken -- sonst schließt/speichert das
  // Modal ungewollt mitten in der Eingabe (Browser-Standardverhalten bei Enter
  // in einem Textfeld). Nur die Textarea (Beschreibung) darf Enter normal
  // verarbeiten (Zeilenumbruch).
  document.getElementById('pmodal-form').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.tagName !== 'TEXTAREA') {
      e.preventDefault()
    }
  })

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') schliesseProduktModal()
  })

  ladeKategorien()
}

async function ladeKategorien () {
  const select = document.getElementById('pmodal-kategorie')
  if (!select || select.options.length > 1) return
  try {
    const { data } = await supabase.from('kategorien').select('id, name').order('name')
    ;(data || []).forEach((k) => {
      const opt = document.createElement('option')
      opt.value = k.id
      opt.textContent = k.name
      select.appendChild(opt)
    })
  } catch {}
}

// ── Kategorie/Unterkategorie -> passendes Größenset ──
function aktuelleKategorieName () {
  const select = document.getElementById('pmodal-kategorie')
  return select.options[select.selectedIndex]?.textContent || ''
}

function aktualisiereUnterkategorieSichtbarkeit () {
  const group = document.getElementById('pmodal-unterkategorie-group')
  const istMode = aktuelleKategorieName() === MODE_KATEGORIE_NAME
  group.hidden = !istMode
  if (!istMode) document.getElementById('pmodal-unterkategorie').value = ''
}

function renderGroessenGrid () {
  const unterkategorie = document.getElementById('pmodal-unterkategorie').value
  const set = ermittleGroessenSet(aktuelleKategorieName(), unterkategorie)
  const container = document.getElementById('pmodal-groessen-list')
  container.innerHTML = set.map((g) => {
    const vorhanden = aktuelleVarianten.find((v) => v.groesse === g)
    const checked = !!vorhanden
    const stk = vorhanden ? (vorhanden.stueckzahl ?? 0) : 1
    return `
      <label class="dash-groesse-row">
        <input type="checkbox" class="pmodal-groesse-check" value="${escAttr(g)}" ${checked ? 'checked' : ''}>
        <span class="dash-groesse-name">${escAttr(g)}</span>
        <input type="number" class="form-input pmodal-groesse-stk" min="0" value="${stk}" ${checked ? '' : 'disabled'}>
      </label>`
  }).join('')

  container.querySelectorAll('.dash-groesse-row').forEach((row) => {
    const cb = row.querySelector('.pmodal-groesse-check')
    const stk = row.querySelector('.pmodal-groesse-stk')
    cb.addEventListener('change', () => {
      stk.disabled = !cb.checked
      if (cb.checked) stk.focus()
    })
  })
}

async function speichereVarianten (produktId) {
  const neu = []
  document.querySelectorAll('#pmodal-groessen-list .dash-groesse-row').forEach((row) => {
    const cb = row.querySelector('.pmodal-groesse-check')
    if (!cb.checked) return
    let stk = parseInt(row.querySelector('.pmodal-groesse-stk').value, 10)
    if (isNaN(stk) || stk < 0) stk = 0
    neu.push({ produkt_id: produktId, groesse: cb.value, stueckzahl: stk })
  })
  await supabase.from('produkt_varianten').delete().eq('produkt_id', produktId)
  if (neu.length) await supabase.from('produkt_varianten').insert(neu)
}

// ── Farbvarianten ──
function renderFarben () {
  const container = document.getElementById('pmodal-farben-list')
  if (!container) return
  container.innerHTML = aktuelleFarben.map((f, i) => `
    <div class="pmodal-farbe-row">
      <input class="form-input pmodal-farbe-name" type="text" value="${escAttr(f.farbe || '')}" data-fidx="${i}" placeholder="z.B. Blau">
      <div class="pmodal-farbe-foto">
        ${f.bild_url
          ? `<img class="pmodal-farbe-foto-img" src="${escAttr(f.bild_url)}" alt="">`
          : '<span class="pmodal-farbe-foto-platzhalter">Kein Foto</span>'}
        <label class="pmodal-farbe-foto-upload">
          ${f.bild_url ? 'Ändern' : 'Foto wählen'}
          <input type="file" accept="image/*" class="pmodal-farbe-file" data-fidx="${i}" style="display:none">
        </label>
      </div>
      <input class="form-input pmodal-farbe-stk" type="number" min="0" value="${f.stueckzahl ?? 1}" data-fidx="${i}" placeholder="Stück">
      <button type="button" class="pmodal-farbe-del" data-fidx="${i}" title="Entfernen">&#x2715;</button>
    </div>`).join('')

  container.querySelectorAll('.pmodal-farbe-name').forEach((inp) => {
    inp.addEventListener('input', () => { aktuelleFarben[parseInt(inp.dataset.fidx)].farbe = inp.value })
  })
  container.querySelectorAll('.pmodal-farbe-stk').forEach((inp) => {
    inp.addEventListener('input', () => { aktuelleFarben[parseInt(inp.dataset.fidx)].stueckzahl = parseInt(inp.value, 10) || 0 })
  })
  container.querySelectorAll('.pmodal-farbe-del').forEach((btn) => {
    btn.addEventListener('click', () => {
      aktuelleFarben.splice(parseInt(btn.dataset.fidx), 1)
      renderFarben()
    })
  })
  container.querySelectorAll('.pmodal-farbe-file').forEach((input) => {
    input.addEventListener('change', (e) => handleFarbeFotoUpload(e, parseInt(input.dataset.fidx)))
  })
}

async function handleFarbeFotoUpload (e, idx) {
  const datei = e.target.files[0]
  if (!datei) return
  try {
    const ext = datei.name.split('.').pop().toLowerCase()
    const pfad = `farbvariante/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { data, error } = await supabase.storage
      .from('produkt-bilder')
      .upload(pfad, datei, { cacheControl: '3600', upsert: false })
    if (error) throw error
    const { data: { publicUrl } } = supabase.storage.from('produkt-bilder').getPublicUrl(data.path)
    aktuelleFarben[idx].bild_url = publicUrl
    renderFarben()
  } catch (err) {
    console.error('Farb-Foto-Upload fehlgeschlagen:', err)
  }
  e.target.value = ''
}

async function speichereFarben (produktId) {
  const hatFarbvarianten = document.getElementById('pmodal-hat-farbvarianten').checked
  await supabase.from('produkt_farben').delete().eq('produkt_id', produktId)
  if (!hatFarbvarianten) return
  const neu = aktuelleFarben
    .filter((f) => f.farbe && f.farbe.trim())
    .map((f) => ({
      produkt_id: produktId,
      farbe: f.farbe.trim(),
      bild_url: f.bild_url || null,
      stueckzahl: isNaN(parseInt(f.stueckzahl, 10)) ? 0 : parseInt(f.stueckzahl, 10)
    }))
  if (neu.length) await supabase.from('produkt_farben').insert(neu)
}

// ── Thumbnails ──
function renderThumbs () {
  const container = document.getElementById('pmodal-thumbs')
  if (!container) return
  container.innerHTML = bildUrls.map((url, i) => `
    <div class="pmodal-thumb">
      <img src="${url}" alt="Foto ${i + 1}">
      <button type="button" class="pmodal-thumb-del" data-idx="${i}" title="Entfernen">&#x2715;</button>
    </div>`).join('')

  container.querySelectorAll('.pmodal-thumb-del').forEach((btn) => {
    btn.addEventListener('click', () => {
      bildUrls.splice(parseInt(btn.dataset.idx), 1)
      renderThumbs()
    })
  })
}

// ── Features ──
function renderFeatures () {
  const container = document.getElementById('pmodal-features-list')
  const addBtn = document.getElementById('pmodal-add-feature')
  if (!container) return
  container.innerHTML = featuresList.map((text, i) => `
    <div class="pmodal-feature-row">
      <input class="form-input pmodal-feature-input" type="text" value="${escAttr(text)}" data-fidx="${i}" placeholder="z.B. Weiche Baumwolle – ideal für kühle Tage">
      <button type="button" class="pmodal-feature-del" data-fidx="${i}" title="Entfernen">&#x2715;</button>
    </div>`).join('')

  container.querySelectorAll('.pmodal-feature-input').forEach((inp) => {
    inp.addEventListener('input', () => {
      featuresList[parseInt(inp.dataset.fidx)] = inp.value
    })
  })
  container.querySelectorAll('.pmodal-feature-del').forEach((btn) => {
    btn.addEventListener('click', () => {
      featuresList.splice(parseInt(btn.dataset.fidx), 1)
      renderFeatures()
    })
  })

  if (addBtn) {
    const erreicht = featuresList.length >= MAX_FEATURES
    addBtn.hidden = erreicht
    addBtn.disabled = erreicht
  }
}

function escAttr (v) {
  return String(v ?? '').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Details-Bild ──
function setzeDetailsBildPreview (url) {
  const preview = document.getElementById('pmodal-details-bild-preview')
  const removeBtn = document.getElementById('pmodal-details-bild-remove')
  if (!preview) return
  if (url) {
    preview.innerHTML = `<img src="${escAttr(url)}" alt="Details-Bild" style="max-height:120px;border-radius:6px;object-fit:cover;">`
    preview.dataset.url = url
    if (removeBtn) removeBtn.hidden = false
  } else {
    preview.innerHTML = ''
    preview.dataset.url = ''
    if (removeBtn) removeBtn.hidden = true
  }
}

async function handleDetailsBildUpload (e) {
  const datei = e.target.files[0]
  if (!datei) return
  const status = document.getElementById('pmodal-details-bild-status')
  status.textContent = 'Lädt hoch…'
  try {
    const ext = datei.name.split('.').pop().toLowerCase()
    const pfad = `details-bild/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
    const { data, error } = await supabase.storage
      .from('produkt-bilder')
      .upload(pfad, datei, { cacheControl: '3600', upsert: false })
    if (error) throw error
    const { data: { publicUrl } } = supabase.storage.from('produkt-bilder').getPublicUrl(data.path)
    setzeDetailsBildPreview(publicUrl)
    status.textContent = 'Hochgeladen.'
  } catch (err) {
    console.error('Details-Bild-Upload fehlgeschlagen:', err)
    status.textContent = 'Upload fehlgeschlagen.'
  }
  e.target.value = ''
}

// ── Datei-Upload ──
async function handleDateiUpload (e) {
  const dateien = Array.from(e.target.files)
  if (!dateien.length) return

  const status = document.getElementById('pmodal-upload-status')
  status.textContent = `Lädt hoch (0/${dateien.length})…`

  let ok = 0
  for (const datei of dateien) {
    try {
      const ext = datei.name.split('.').pop().toLowerCase()
      const pfad = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { data, error } = await supabase.storage
        .from('produkt-bilder')
        .upload(pfad, datei, { cacheControl: '3600', upsert: false })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage
        .from('produkt-bilder')
        .getPublicUrl(data.path)
      bildUrls.push(publicUrl)
      ok++
      status.textContent = `Lädt hoch (${ok}/${dateien.length})…`
      renderThumbs()
    } catch (err) {
      console.error('Bild-Upload fehlgeschlagen:', err)
    }
  }

  status.textContent = ok === dateien.length
    ? `${ok} Foto${ok === 1 ? '' : 's'} hochgeladen.`
    : `${ok} von ${dateien.length} erfolgreich.`
  e.target.value = ''
}

// ── Speichern ──
async function handleSpeichern (e) {
  e.preventDefault()
  const feedback = document.getElementById('pmodal-feedback')
  feedback.innerHTML = ''

  const titel = document.getElementById('pmodal-titel').value.trim()
  const preisRaw = document.getElementById('pmodal-preis').value
  if (!titel || preisRaw === '') {
    feedback.innerHTML = '<div class="error-msg">Bitte Titel und Preis ausfüllen.</div>'
    return
  }

  const kategorieId = document.getElementById('pmodal-kategorie').value
  if (!kategorieId) {
    feedback.innerHTML = '<div class="error-msg">Bitte eine Kategorie auswählen.</div>'
    return
  }

  const geschlecht = document.getElementById('pmodal-geschlecht').value || null

  const shopGroup = document.getElementById('pmodal-shop-group')
  let gewaehlteShopId = null
  if (shopGroup && !shopGroup.hidden) {
    gewaehlteShopId = document.getElementById('pmodal-shop').value
    if (!gewaehlteShopId) {
      feedback.innerHTML = '<div class="error-msg">Bitte einen Händler auswählen.</div>'
      return
    }
  }

  const submitBtn = document.getElementById('pmodal-submit')
  submitBtn.disabled = true
  submitBtn.textContent = 'Wird gespeichert…'

  const angebotpreisRaw = document.getElementById('pmodal-angebotspreis').value
  const angebotVon = document.getElementById('pmodal-angebot-von').value || null
  const angebotBis = document.getElementById('pmodal-angebot-bis').value || null

  // Features: direkt aus DOM-Feldern lesen statt aus featuresList
  const highlightInputs = document.querySelectorAll('.pmodal-feature-input')
  const highlights = Array.from(highlightInputs).map((inp) => inp.value.trim()).filter(Boolean)

  // Farbvarianten-Fotos werden nach den allgemeinen Fotos angehängt, damit die
  // Reihenfolge in der Galerie "allgemeine Fotos zuerst, dann Farb-Fotos" ist.
  const hatFarbvariantenChecked = document.getElementById('pmodal-hat-farbvarianten').checked
  const farbBilder = hatFarbvariantenChecked
    ? aktuelleFarben.map((f) => f.bild_url).filter(Boolean)
    : []

  const daten = {
    titel,
    ean: document.getElementById('pmodal-ean').value.trim() || null,
    preis: parseFloat(preisRaw),
    beschreibung: document.getElementById('pmodal-beschreibung').value.trim() || null,
    kategorie_id: kategorieId,
    unterkategorie: document.getElementById('pmodal-unterkategorie-group').hidden ? null : (document.getElementById('pmodal-unterkategorie').value || null),
    geschlecht,
    farbe: hatFarbvariantenChecked ? null : (document.getElementById('pmodal-farbe').value.trim() || null),
    verfuegbar: document.getElementById('pmodal-verfuegbar').checked,
    bilder: [...bildUrls, ...farbBilder],
    highlights: highlights.length ? highlights : null,
    angebotspreis: angebotpreisRaw ? parseFloat(angebotpreisRaw) : null,
    angebot_von: angebotVon,
    angebot_bis: angebotBis
    // details_bild_url wird separat gespeichert -- Spalte muss in Supabase existieren
    // details_bild_url: document.getElementById('pmodal-details-bild-preview')?.dataset.url || null
  }
  if (gewaehlteShopId) daten.shop_id = gewaehlteShopId

  try {
    if (aktuellesProduktId) {
      const { data: upd, error } = await supabase
        .from('produkte')
        .update(daten)
        .eq('id', aktuellesProduktId)
        .select('id')
      if (error) {
        console.error('Supabase Update Fehler:', error)
        throw error
      }
      if (!upd || upd.length === 0) {
        throw new Error('Keine Zeile aktualisiert — Produkt nicht gefunden oder keine Berechtigung.')
      }
      await speichereVarianten(aktuellesProduktId)
      await speichereFarben(aktuellesProduktId)
      // Callback VOR dem Schließen sichern -- schliesseProduktModal() setzt ihn auf null
      const cb = onSaveCallback
      schliesseProduktModal()
      if (cb) cb(null)
    } else {
      const neueId = await onSaveCallback(daten)
      if (neueId) {
        await speichereVarianten(neueId)
        await speichereFarben(neueId)
      }
      schliesseProduktModal()
    }
  } catch (err) {
    console.error('Speichern fehlgeschlagen:', err)
    const msg = err?.message || ''
    const spalteFehlt = err?.code === 'PGRST204' || (/column/i.test(msg) && /geschlecht/i.test(msg))
    feedback.innerHTML = `<div class="error-msg">${spalteFehlt
      ? 'Die Datenbank kennt das Feld „Geschlecht" noch nicht — bitte die Migration supabase/migration-geschlecht.sql in Supabase ausführen.'
      : `Speichern fehlgeschlagen: ${msg || JSON.stringify(err)}`}</div>`
    feedback.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  } finally {
    // Button IMMER zurücksetzen -- verhindert dauerhaft hängendes "Wird gespeichert…"
    submitBtn.disabled = false
    submitBtn.textContent = 'Speichern'
  }
}

// ── Öffentliche API ──
export async function oeffneProduktModal ({ produkt = null, onSave, shops = null } = {}) {
  const modal = document.getElementById('produkt-modal')
  if (!modal) return

  onSaveCallback = onSave || null
  aktuellesProduktId = produkt?.id || null
  featuresList = Array.isArray(produkt?.highlights) ? [...produkt.highlights].slice(0, MAX_FEATURES) : []
  aktuelleVarianten = []
  aktuelleFarben = []
  if (produkt?.id) {
    const [{ data: vData }, { data: fData }] = await Promise.all([
      supabase.from('produkt_varianten').select('*').eq('produkt_id', produkt.id),
      supabase.from('produkt_farben').select('*').eq('produkt_id', produkt.id)
    ])
    aktuelleVarianten = vData || []
    aktuelleFarben = fData || []
  }
  // Fotos, die bereits einer Farbvariante zugeordnet sind, gehoeren NICHT in
  // die allgemeine Fotos-Liste -- sonst wuerden sie doppelt auftauchen (einmal
  // im Fotos-Bereich, einmal in der Farbvariante).
  const farbUrls = new Set(aktuelleFarben.map((f) => f.bild_url).filter(Boolean))
  bildUrls = Array.isArray(produkt?.bilder)
    ? produkt.bilder.filter(Boolean).filter((u) => !farbUrls.has(u))
    : []

  const shopGroup = document.getElementById('pmodal-shop-group')
  const shopSelect = document.getElementById('pmodal-shop')
  if (shops && shopGroup && shopSelect) {
    shopGroup.hidden = false
    shopSelect.innerHTML = '<option value="">— Händler wählen —</option>' +
      shops.map((s) => `<option value="${escAttr(s.id)}">${escAttr(s.name)}</option>`).join('')
    shopSelect.value = produkt?.shop_id || ''
  } else if (shopGroup) {
    shopGroup.hidden = true
  }

  document.getElementById('pmodal-title').textContent = produkt ? 'Produkt bearbeiten' : 'Produkt anlegen'
  document.getElementById('pmodal-titel').value = produkt?.titel || ''
  document.getElementById('pmodal-ean').value = produkt?.ean || ''
  document.getElementById('pmodal-preis').value = produkt?.preis ?? ''
  document.getElementById('pmodal-beschreibung').value = produkt?.beschreibung || ''
  document.getElementById('pmodal-kategorie').value = produkt?.kategorie_id || ''
  aktualisiereUnterkategorieSichtbarkeit()
  document.getElementById('pmodal-unterkategorie').value = produkt?.unterkategorie || ''
  document.getElementById('pmodal-geschlecht').value = produkt?.geschlecht || ''
  const hatFarbvariantenInit = aktuelleFarben.length > 0
  document.getElementById('pmodal-hat-farbvarianten').checked = hatFarbvariantenInit
  document.getElementById('pmodal-farben-wrap').hidden = !hatFarbvariantenInit
  const farbeInput = document.getElementById('pmodal-farbe')
  farbeInput.disabled = hatFarbvariantenInit
  farbeInput.value = hatFarbvariantenInit ? '' : (produkt?.farbe || '')
  document.getElementById('pmodal-verfuegbar').checked = produkt?.verfuegbar !== false
  document.getElementById('pmodal-angebotspreis').value = produkt?.angebotspreis ?? ''
  document.getElementById('pmodal-angebot-von').value = produkt?.angebot_von || ''
  document.getElementById('pmodal-angebot-bis').value = produkt?.angebot_bis || ''
  document.getElementById('pmodal-feedback').innerHTML = ''
  document.getElementById('pmodal-upload-status').textContent = ''

  renderThumbs()
  renderFeatures()
  renderGroessenGrid()
  renderFarben()
  setzeDetailsBildPreview(produkt?.details_bild_url || null)
  modal.hidden = false
  document.body.style.overflow = 'hidden'
  setTimeout(() => document.getElementById('pmodal-titel').focus(), 50)
}

export function schliesseProduktModal () {
  const modal = document.getElementById('produkt-modal')
  if (modal) modal.hidden = true
  document.body.style.overflow = ''
  aktuellesProduktId = null
  bildUrls = []
  featuresList = []
  aktuelleFarben = []
  onSaveCallback = null
}
