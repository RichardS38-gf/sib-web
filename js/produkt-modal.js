// js/produkt-modal.js
// Geteiltes Produkt-Modal für Händler- und Admin-Dashboard.
// Unterstützt Anlegen + Bearbeiten inkl. Multi-Foto-Upload zu Supabase Storage.

import { supabase } from './supabase.js'

let onSaveCallback = null
let aktuellesProduktId = null
let bildUrls = []

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

          <!-- Beschreibung -->
          <div class="pmodal-field">
            <label class="pmodal-label" for="pmodal-beschreibung">Beschreibung</label>
            <textarea class="form-input pmodal-textarea" id="pmodal-beschreibung" name="beschreibung" rows="3"></textarea>
          </div>

          <!-- Kategorie + Verfügbar -->
          <div class="pmodal-row">
            <div class="pmodal-field">
              <label class="pmodal-label" for="pmodal-kategorie">Kategorie</label>
              <select class="form-select" id="pmodal-kategorie" name="kategorie_id">
                <option value="">Keine Kategorie</option>
              </select>
            </div>
            <div class="pmodal-field pmodal-field--check">
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

  // Events
  el.querySelector('.pmodal-backdrop').addEventListener('click', schliesseProduktModal)
  el.querySelector('.pmodal-close').addEventListener('click', schliesseProduktModal)
  document.getElementById('pmodal-cancel').addEventListener('click', schliesseProduktModal)
  document.getElementById('pmodal-file-input').addEventListener('change', handleDateiUpload)
  document.getElementById('pmodal-form').addEventListener('submit', handleSpeichern)

  // Escape-Taste
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') schliesseProduktModal()
  })

  ladeKategorien()
}

async function ladeKategorien () {
  const select = document.getElementById('pmodal-kategorie')
  if (!select) return
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

  const submitBtn = document.getElementById('pmodal-submit')
  submitBtn.disabled = true
  submitBtn.textContent = 'Wird gespeichert…'

  const daten = {
    titel,
    preis: parseFloat(preisRaw),
    beschreibung: document.getElementById('pmodal-beschreibung').value.trim() || null,
    kategorie_id: document.getElementById('pmodal-kategorie').value || null,
    verfuegbar: document.getElementById('pmodal-verfuegbar').checked,
    bilder: [...bildUrls]
  }

  try {
    if (aktuellesProduktId) {
      const { error } = await supabase.from('produkte').update(daten).eq('id', aktuellesProduktId)
      if (error) throw error
      schliesseProduktModal()
      if (onSaveCallback) onSaveCallback(null)
    } else {
      // Neu anlegen — Callback ergänzt shop_id + freigegeben
      await onSaveCallback(daten)
      schliesseProduktModal()
    }
  } catch (err) {
    console.error('Speichern fehlgeschlagen:', err)
    feedback.innerHTML = '<div class="error-msg">Das Produkt konnte nicht gespeichert werden.</div>'
    submitBtn.disabled = false
    submitBtn.textContent = 'Speichern'
  }
}

// ── Öffentliche API ──
export function oeffneProduktModal ({ produkt = null, onSave } = {}) {
  const modal = document.getElementById('produkt-modal')
  if (!modal) return

  onSaveCallback = onSave || null
  aktuellesProduktId = produkt?.id || null
  bildUrls = Array.isArray(produkt?.bilder) ? [...produkt.bilder.filter(Boolean)] : []

  document.getElementById('pmodal-title').textContent = produkt ? 'Produkt bearbeiten' : 'Produkt anlegen'
  document.getElementById('pmodal-titel').value = produkt?.titel || ''
  document.getElementById('pmodal-preis').value = produkt?.preis ?? ''
  document.getElementById('pmodal-beschreibung').value = produkt?.beschreibung || ''
  document.getElementById('pmodal-kategorie').value = produkt?.kategorie_id || ''
  document.getElementById('pmodal-verfuegbar').checked = produkt?.verfuegbar !== false
  document.getElementById('pmodal-feedback').innerHTML = ''
  document.getElementById('pmodal-upload-status').textContent = ''

  renderThumbs()
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
  onSaveCallback = null
}
