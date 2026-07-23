// js/admin.js — SIB Admin-Bereich (Florian)
// Sicherer Zugang über Supabase Auth + is_admin()-Prüfung (kein service_role im Frontend).
// Vollzugriff wird serverseitig per RLS-Policy gewährt (siehe supabase/admin-setup.sql).

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'
import { initProduktModal, oeffneProduktModal } from './produkt-modal.js?v=7'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

function esc (value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDatum (value) {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function jaNein (v) { return v ? 'ja' : 'nein' }

function statusBadge (status) {
  const map = {
    offen: ['badge--outline', 'offen'],
    bestaetigt: ['badge', 'bestätigt'],
    abgelaufen: ['badge--muted', 'abgelaufen']
  }
  const [cls, label] = map[status] || ['badge--muted', status || '—']
  return `<span class="badge ${cls}">${esc(label)}</span>`
}

// ── Mobile-Menü ──
function initMobileMenu () {
  const burger = document.querySelector('.site-header__burger')
  const menu = document.getElementById('mobile-menu')
  if (!burger || !menu) return
  burger.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') === 'true'
    burger.setAttribute('aria-expanded', String(!open))
    burger.setAttribute('aria-label', open ? 'Menü öffnen' : 'Menü schließen')
    menu.hidden = open
  })
}

// ── Zugangskontrolle ──
async function istAdmin () {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return false
  const { data, error } = await supabase.rpc('is_admin')
  if (error) {
    console.error('is_admin-Prüfung fehlgeschlagen:', error)
    return false
  }
  return data === true
}

function zeigeGate (msg) {
  document.getElementById('admin-loading').style.display = 'none'
  document.getElementById('admin').hidden = true
  const gate = document.getElementById('admin-gate')
  gate.hidden = false
  if (msg) {
    document.getElementById('admin-gate-feedback').innerHTML = `<div class="error-msg">${esc(msg)}</div>`
  }
}

function zeigeAdmin () {
  document.getElementById('admin-gate').hidden = true
  document.getElementById('admin-loading').style.display = 'none'
  document.getElementById('admin').hidden = false

  initTabs()
  initLogout()
  initProduktModal()
  initShopCreateForm()
  initProduktCreateForm()

  ladeHaendler()
  ladeProdukte()
  ladeReservierungen()
  ladeNewsletter()
  ladeBewertungen()
  ladeShopsFuerAuswahl()
}

function initGateForm () {
  const form = document.getElementById('admin-gate-form')
  const feedback = document.getElementById('admin-gate-feedback')

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    feedback.innerHTML = ''

    const email = form.email.value.trim()
    const password = form.password.value
    if (!email || !password) {
      feedback.innerHTML = '<div class="error-msg">Bitte E-Mail und Passwort eingeben.</div>'
      return
    }

    const submitBtn = form.querySelector('button[type="submit"]')
    submitBtn.disabled = true
    submitBtn.textContent = 'Wird angemeldet…'

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      if (await istAdmin()) {
        zeigeAdmin()
      } else {
        await supabase.auth.signOut()
        feedback.innerHTML = '<div class="error-msg">Dieses Konto hat keine Admin-Rechte.</div>'
      }
    } catch (err) {
      console.error('Admin-Login fehlgeschlagen:', err)
      feedback.innerHTML = '<div class="error-msg">Anmeldung fehlgeschlagen. Bitte prüfe E-Mail und Passwort.</div>'
    } finally {
      submitBtn.disabled = false
      submitBtn.textContent = 'Anmelden'
    }
  })
}

function initLogout () {
  document.getElementById('admin-logout').addEventListener('click', async () => {
    await supabase.auth.signOut()
    window.location.reload()
  })
}

// ── Tabs ──
function initTabs () {
  const tabs = document.querySelectorAll('.admin-tab')
  const panels = document.querySelectorAll('.admin-panel')
  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const name = tab.dataset.tab
      tabs.forEach((t) => t.classList.toggle('is-active', t === tab))
      panels.forEach((p) => {
        const active = p.dataset.panel === name
        p.classList.toggle('is-active', active)
        p.hidden = !active
      })
    })
  })
}

// ── TAB 1: Händler ──
async function ladeHaendler () {
  const el = document.getElementById('haendler-content')
  try {
    const { data, error } = await supabase.from('shops').select('*').order('name')
    if (error) throw error
    const shops = data || []

    if (shops.length === 0) {
      el.innerHTML = '<p class="admin-empty">Noch keine Händler angelegt.</p>'
      return
    }

    const rows = shops.map((s) => {
      const aktiv = s.aktiv !== false
      const toggleLabel = aktiv ? 'Deaktivieren' : 'Aktivieren'
      return `
        <tr>
          <td class="is-wrap">${esc(s.name)}</td>
          <td>${esc(s.slug || '—')}</td>
          <td class="is-wrap">${esc(s.adresse || '—')}</td>
          <td>${aktiv ? '<span class="badge">aktiv</span>' : '<span class="badge badge--muted">inaktiv</span>'}</td>
          <td><button class="admin-link-btn" data-edit-shop="${esc(s.id)}">Bearbeiten</button> <button class="admin-link-btn" data-toggle-shop="${esc(s.id)}" data-aktiv="${aktiv}">${toggleLabel}</button> <button class="admin-link-btn admin-link-btn--danger" data-delete-shop="${esc(s.id)}" data-name="${esc(s.name)}">Löschen</button></td>
        </tr>`
    }).join('')

    el.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Name</th><th>Slug</th><th>Adresse</th><th>Aktiv</th><th>Aktion</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`

    el.querySelectorAll('[data-toggle-shop]').forEach((btn) => {
      btn.addEventListener('click', () => toggleShop(btn.dataset.toggleShop, btn.dataset.aktiv === 'true'))
    })
    el.querySelectorAll('[data-delete-shop]').forEach((btn) => {
      btn.addEventListener('click', () => loescheShop(btn.dataset.deleteShop, btn.dataset.name))
    })
    el.querySelectorAll('[data-edit-shop]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const s = shops.find((x) => x.id === btn.dataset.editShop)
        if (!s) return
        setzeShopFormModus(s)
        const form = document.getElementById('shop-create-form')
        form.hidden = false
        form.scrollIntoView({ behavior: 'smooth', block: 'start' })
      })
    })
  } catch (err) {
    console.error('Händler konnten nicht geladen werden:', err)
    el.innerHTML = '<p class="admin-empty">Händler konnten nicht geladen werden.</p>'
  }
}

async function toggleShop (id, aktivJetzt) {
  try {
    const { error } = await supabase.from('shops').update({ aktiv: !aktivJetzt }).eq('id', id)
    if (error) throw error
    ladeHaendler()
  } catch (err) {
    console.error('Status ändern fehlgeschlagen:', err)
    window.alert('Der Status konnte nicht geändert werden.')
  }
}

async function loescheShop (id, name) {
  if (!window.confirm(`Händler „${name}“ wirklich komplett löschen? Das entfernt auch alle zugehörigen Produkte, Bewertungen und Reservierungen unwiderruflich.`)) return
  try {
    const { error } = await supabase.from('shops').delete().eq('id', id)
    if (error) throw error
    ladeHaendler()
    ladeProdukte()
  } catch (err) {
    console.error('Händler löschen fehlgeschlagen:', err)
    window.alert('Der Händler konnte nicht gelöscht werden. Möglicherweise verhindern verknüpfte Daten (z.B. Reservierungen) das Löschen.')
  }
}

function initShopCreateForm () {
  const toggleBtn = document.getElementById('toggle-shop-form')
  const cancelBtn = document.getElementById('cancel-shop-form')
  const form = document.getElementById('shop-create-form')
  const feedback = document.getElementById('shop-create-feedback')
  const submitBtn = document.getElementById('shop-form-submit')

  initShopFormDateiUploads()

  toggleBtn.addEventListener('click', () => {
    setzeShopFormModus(null) // leeres Formular = Anlegen-Modus
    form.hidden = !form.hidden
    if (!form.hidden) form.name.focus()
  })
  cancelBtn.addEventListener('click', () => {
    form.reset()
    feedback.innerHTML = ''
    form.hidden = true
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    feedback.innerHTML = ''

    const name = form.name.value.trim()
    const shopId = document.getElementById('cs-id').value || null

    if (!name) {
      feedback.innerHTML = '<div class="error-msg">Bitte mindestens den Shop-Namen ausfüllen.</div>'
      return
    }

    const logoUrl = document.getElementById('cs-logo-preview')?.dataset.url || null
    const bannerUrl = document.getElementById('cs-banner-preview')?.dataset.url || null
    const titelbildUrl = document.getElementById('cs-titelbild-preview')?.dataset.url || null
    const agbUrl = document.getElementById('cs-agb-current')?.dataset.url || null

    const daten = {
      name,
      slug: form.slug.value.trim() || null,
      adresse: form.adresse.value.trim() || null,
      email: form.email.value.trim() || null,
      about_headline: form.about_headline.value.trim() || null,
      beschreibung: form.beschreibung.value.trim() || null,
      oeffnungszeiten: sammleShopFormOeffnungszeiten(),
      zahlungsmethoden: form.zahlungsmethoden.value.trim() || null,
      rueckgaben: form.rueckgaben.value.trim() || null,
      logo_url: logoUrl,
      banner_url: bannerUrl,
      bild_url: titelbildUrl,
      agb_url: agbUrl,
      messaging_enabled: document.getElementById('cs-messaging')?.checked ?? false
    }

    submitBtn.disabled = true
    submitBtn.textContent = shopId ? 'Wird gespeichert…' : 'Wird angelegt…'

    try {
      if (shopId) {
        const { error } = await supabase.from('shops').update(daten).eq('id', shopId)
        if (error) throw error
      } else {
        daten.aktiv = true
        const { error } = await supabase.from('shops').insert(daten)
        if (error) {
          if (error.code === '23505') {
            feedback.innerHTML = '<div class="error-msg">Dieser Slug ist bereits vergeben.</div>'
            return
          }
          throw error
        }
      }
      form.reset()
      form.hidden = true
      ladeHaendler()
    } catch (err) {
      console.error('Händler speichern fehlgeschlagen:', err)
      feedback.innerHTML = '<div class="error-msg">Der Händler konnte nicht gespeichert werden.</div>'
    } finally {
      submitBtn.disabled = false
      submitBtn.textContent = shopId ? 'Speichern' : 'Anlegen'
    }
  })
}

// — Formular in Anlegen- oder Bearbeiten-Modus versetzen und ggf. mit Shop-Daten füllen —
function setzeShopFormModus (shop) {
  const form = document.getElementById('shop-create-form')
  const submitBtn = document.getElementById('shop-form-submit')
  const heading = document.querySelector('#toggle-shop-form')

  document.getElementById('cs-id').value = shop?.id || ''
  form.name.value = shop?.name || ''
  form.slug.value = shop?.slug || ''
  form.adresse.value = shop?.adresse || ''
  form.email.value = shop?.email || ''
  form.about_headline.value = shop?.about_headline || ''
  form.beschreibung.value = shop?.beschreibung || ''
  form.zahlungsmethoden.value = shop?.zahlungsmethoden || ''
  form.rueckgaben.value = shop?.rueckgaben || ''

  fuelleShopFormOeffnungszeiten(shop?.oeffnungszeiten)
  setzeShopFormBildPreview('cs-logo-preview', shop?.logo_url)
  setzeShopFormBildPreview('cs-banner-preview', shop?.banner_url)
  setzeShopFormBildPreview('cs-titelbild-preview', shop?.bild_url)
  setzeShopFormAgbAnzeige(shop?.agb_url)

  const msgToggle = document.getElementById('cs-messaging')
  if (msgToggle) msgToggle.checked = !!shop?.messaging_enabled

  submitBtn.textContent = shop ? 'Speichern' : 'Anlegen'
}

const SHOP_FORM_TAGE = ['Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag', 'Sonntag']

function fuelleShopFormOeffnungszeiten (rohWert) {
  let eintraege = []
  if (Array.isArray(rohWert)) {
    eintraege = rohWert
  } else if (typeof rohWert === 'string' && rohWert.trim().startsWith('[')) {
    try { eintraege = JSON.parse(rohWert) } catch { eintraege = [] }
  }
  const byTag = {}
  eintraege.forEach((e) => { if (e?.tag) byTag[e.tag] = Array.isArray(e.zeiten) ? e.zeiten.join(', ') : (e.zeiten || '') })

  document.querySelectorAll('#cs-oz-grid .dash-oz-row').forEach((row) => {
    const tag = row.dataset.tag
    const input = row.querySelector('input')
    input.value = byTag[tag] || ''
  })
}

function sammleShopFormOeffnungszeiten () {
  const eintraege = []
  document.querySelectorAll('#cs-oz-grid .dash-oz-row').forEach((row) => {
    const tag = row.dataset.tag
    const wert = row.querySelector('input').value.trim()
    if (!wert) return
    eintraege.push({ tag, zeiten: [wert] })
  })
  return eintraege.length ? eintraege : null
}

function setzeShopFormBildPreview (containerId, url) {
  const el = document.getElementById(containerId)
  if (!el) return
  el.innerHTML = url ? `<img src="${esc(url)}" alt="Vorschau">` : '<span class="dash-file-preview__empty">Kein Bild</span>'
  el.dataset.url = url || ''
}

function setzeShopFormAgbAnzeige (url) {
  const wrap = document.getElementById('cs-agb-current')
  const link = document.getElementById('cs-agb-link')
  if (!wrap || !link) return
  if (url) {
    link.href = url
    wrap.hidden = false
    wrap.dataset.url = url
  } else {
    wrap.hidden = true
    wrap.dataset.url = ''
  }
}

async function ladeShopFormDateiHoch (datei, ordner = '') {
  const ext = datei.name.split('.').pop().toLowerCase()
  const pfad = `${ordner}${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { data, error } = await supabase.storage
    .from('produkt-bilder')
    .upload(pfad, datei, { cacheControl: '3600', upsert: false })
  if (error) throw error
  const { data: { publicUrl } } = supabase.storage.from('produkt-bilder').getPublicUrl(data.path)
  return publicUrl
}

function initShopFormDateiUploads () {
  document.getElementById('cs-logo-input')?.addEventListener('change', async (e) => {
    const datei = e.target.files[0]
    if (!datei) return
    const status = document.getElementById('cs-logo-status')
    status.textContent = 'Lädt hoch…'
    try {
      const url = await ladeShopFormDateiHoch(datei, 'shop-logos/')
      setzeShopFormBildPreview('cs-logo-preview', url)
      status.textContent = 'Hochgeladen.'
    } catch (err) {
      console.error('Logo-Upload fehlgeschlagen:', err)
      status.textContent = 'Upload fehlgeschlagen.'
    }
    e.target.value = ''
  })

  document.getElementById('cs-banner-input')?.addEventListener('change', async (e) => {
    const datei = e.target.files[0]
    if (!datei) return
    const status = document.getElementById('cs-banner-status')
    status.textContent = 'Lädt hoch…'
    try {
      const url = await ladeShopFormDateiHoch(datei, 'shop-banner/')
      setzeShopFormBildPreview('cs-banner-preview', url)
      status.textContent = 'Hochgeladen.'
    } catch (err) {
      console.error('Banner-Upload fehlgeschlagen:', err)
      status.textContent = 'Upload fehlgeschlagen.'
    }
    e.target.value = ''
  })

  document.getElementById('cs-titelbild-input')?.addEventListener('change', async (e) => {
    const datei = e.target.files[0]
    if (!datei) return
    const status = document.getElementById('cs-titelbild-status')
    status.textContent = 'Lädt hoch…'
    try {
      const url = await ladeShopFormDateiHoch(datei, 'shop-titelbild/')
      setzeShopFormBildPreview('cs-titelbild-preview', url)
      status.textContent = 'Hochgeladen.'
    } catch (err) {
      console.error('Titelbild-Upload fehlgeschlagen:', err)
      status.textContent = 'Upload fehlgeschlagen.'
    }
    e.target.value = ''
  })

  document.getElementById('cs-agb-input')?.addEventListener('change', async (e) => {
    const datei = e.target.files[0]
    if (!datei) return
    const status = document.getElementById('cs-agb-status')
    status.textContent = 'Lädt hoch…'
    try {
      const url = await ladeShopFormDateiHoch(datei, 'shop-agb/')
      setzeShopFormAgbAnzeige(url)
      status.textContent = 'Hochgeladen.'
    } catch (err) {
      console.error('AGB-Upload fehlgeschlagen:', err)
      status.textContent = 'Upload fehlgeschlagen.'
    }
    e.target.value = ''
  })

  document.getElementById('cs-agb-remove')?.addEventListener('click', () => {
    setzeShopFormAgbAnzeige(null)
  })
}

// ── TAB 2: Produkte ──
async function ladeProdukte () {
  const el = document.getElementById('produkte-content')
  try {
    const { data, error } = await supabase
      .from('produkte')
      .select('*, shops(name)')
      .order('erstellt_am', { ascending: false })
    if (error) throw error
    const produkte = data || []

    if (produkte.length === 0) {
      el.innerHTML = '<p class="admin-empty">Noch keine Produkte vorhanden.</p>'
      return
    }

    const rows = produkte.map((p) => {
      const verfuegbar = p.verfuegbar !== false
      const freigegeben = p.freigegeben === true
      const preis = (p.preis !== null && p.preis !== undefined) ? euro.format(p.preis) : '—'
      const toggleLabel = verfuegbar ? 'Auf nicht verfügbar' : 'Auf verfügbar'
      const freigabeZelle = freigegeben
        ? '<span class="badge badge--muted">freigegeben</span>'
        : '<span class="badge badge--outline">ausstehend</span>'
      const freigebenBtn = freigegeben
        ? ''
        : `<button class="admin-link-btn" data-freigeben-produkt="${esc(p.id)}">Freigeben</button>`
      return `
        <tr>
          <td class="is-wrap">${esc(p.titel)}</td>
          <td>${p.ean ? esc(p.ean) : '—'}</td>
          <td class="is-wrap">${esc(p.shops?.name || '—')}</td>
          <td>${esc(preis)}</td>
          <td>${jaNein(verfuegbar)}</td>
          <td>${freigabeZelle}</td>
          <td>
            ${freigebenBtn}
            <button class="admin-link-btn" data-edit-produkt="${esc(p.id)}">Bearbeiten</button>
            <button class="admin-link-btn" data-toggle-produkt="${esc(p.id)}" data-verf="${verfuegbar}">${toggleLabel}</button>
            <button class="admin-link-btn" data-delete-produkt="${esc(p.id)}" data-titel="${esc(p.titel)}">Löschen</button>
          </td>
        </tr>`
    }).join('')

    el.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Titel</th><th>EAN</th><th>Shop</th><th>Preis</th><th>Verfügbar</th><th>Freigabe</th><th>Aktion</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`

    el.querySelectorAll('[data-freigeben-produkt]').forEach((btn) => {
      btn.addEventListener('click', () => freigebenProdukt(btn.dataset.freigebenProdukt))
    })
    el.querySelectorAll('[data-edit-produkt]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const p = produkte.find((x) => x.id === btn.dataset.editProdukt)
        if (!p) return
        const shops = cachedShops.length ? cachedShops : await ladeShopsFuerAuswahl()
        oeffneProduktModal({
          produkt: p,
          shops,
          onSave: () => ladeProdukte()
        })
      })
    })
    el.querySelectorAll('[data-toggle-produkt]').forEach((btn) => {
      btn.addEventListener('click', () => toggleProdukt(btn.dataset.toggleProdukt, btn.dataset.verf === 'true'))
    })
    el.querySelectorAll('[data-delete-produkt]').forEach((btn) => {
      btn.addEventListener('click', () => loescheProdukt(btn.dataset.deleteProdukt, btn.dataset.titel))
    })
  } catch (err) {
    console.error('Produkte konnten nicht geladen werden:', err)
    el.innerHTML = '<p class="admin-empty">Produkte konnten nicht geladen werden.</p>'
  }
}

async function toggleProdukt (id, verfJetzt) {
  try {
    const { error } = await supabase.from('produkte').update({ verfuegbar: !verfJetzt }).eq('id', id)
    if (error) throw error
    ladeProdukte()
  } catch (err) {
    console.error('Verfügbarkeit ändern fehlgeschlagen:', err)
    window.alert('Die Verfügbarkeit konnte nicht geändert werden.')
  }
}

async function loescheProdukt (id, titel) {
  if (!window.confirm(`Produkt „${titel}" wirklich löschen?`)) return
  try {
    const { error } = await supabase.from('produkte').delete().eq('id', id)
    if (error) throw error
    ladeProdukte()
  } catch (err) {
    console.error('Löschen fehlgeschlagen:', err)
    window.alert('Das Produkt konnte nicht gelöscht werden.')
  }
}

async function freigebenProdukt (id) {
  try {
    const { error } = await supabase.from('produkte').update({ freigegeben: true }).eq('id', id)
    if (error) throw error
    ladeProdukte()
  } catch (err) {
    console.error('Freigeben fehlgeschlagen:', err)
    window.alert('Das Produkt konnte nicht freigegeben werden.')
  }
}

let cachedShops = [] // fuer die Haendler-Auswahl im Produkt-Modal

async function ladeShopsFuerAuswahl () {
  const { data, error } = await supabase.from('shops').select('id, name').order('name')
  if (!error) cachedShops = data || []
  return cachedShops
}

function initProduktCreateForm () {
  const toggleBtn = document.getElementById('toggle-produkt-form')
  if (!toggleBtn) return
  toggleBtn.addEventListener('click', async () => {
    const shops = cachedShops.length ? cachedShops : await ladeShopsFuerAuswahl()
    oeffneProduktModal({
      shops,
      onSave: async (daten) => {
        const { shop_id, ...rest } = daten
        const { error } = await supabase.from('produkte').insert({
          ...rest,
          shop_id,
          freigegeben: true // Admin-Produkte gehen sofort live
        })
        if (error) throw error
        ladeProdukte()
      }
    })
  })
}

// ── TAB 3: Reservierungen ──
async function ladeReservierungen () {
  const el = document.getElementById('reservierungen-content')
  try {
    const { data, error } = await supabase
      .from('reservierungen')
      .select('*, produkte(titel, shops(name))')
      .order('erstellt_am', { ascending: false })
    if (error) throw error
    const reservierungen = data || []

    if (reservierungen.length === 0) {
      el.innerHTML = '<p class="admin-empty">Noch keine Reservierungen.</p>'
      return
    }

    const rows = reservierungen.map((r) => `
      <tr>
        <td>${formatDatum(r.erstellt_am)}</td>
        <td class="is-wrap">${esc(r.produkte?.titel || '—')}</td>
        <td class="is-wrap">${esc(r.produkte?.shops?.name || '—')}</td>
        <td>${esc(r.kunde_name)}</td>
        <td>${esc(r.kunde_email)}</td>
        <td>${statusBadge(r.status)}</td>
      </tr>`).join('')

    el.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Datum</th><th>Produkt</th><th>Shop</th><th>Kunde</th><th>E-Mail</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
  } catch (err) {
    console.error('Reservierungen konnten nicht geladen werden:', err)
    el.innerHTML = '<p class="admin-empty">Reservierungen konnten nicht geladen werden.</p>'
  }
}

// ── TAB 4: Newsletter ──
async function ladeNewsletter () {
  const el = document.getElementById('newsletter-content')
  const countEl = document.getElementById('newsletter-count')
  try {
    const { data, error } = await supabase
      .from('newsletter_abonnenten')
      .select('*')
      .order('erstellt_am', { ascending: false })
    if (error) throw error
    const abos = data || []

    const aktivAnzahl = abos.filter((a) => a.aktiv !== false).length
    countEl.textContent = `${aktivAnzahl} aktiv · ${abos.length} gesamt`

    if (abos.length === 0) {
      el.innerHTML = '<p class="admin-empty">Noch keine Abonnenten.</p>'
      return
    }

    const rows = abos.map((a) => {
      const aktiv = a.aktiv !== false
      const toggleLabel = aktiv ? 'Deaktivieren' : 'Aktivieren'
      return `
        <tr>
          <td class="is-wrap">${esc(a.email)}</td>
          <td>${formatDatum(a.erstellt_am)}</td>
          <td>${jaNein(aktiv)}</td>
          <td><button class="admin-link-btn" data-toggle-abo="${esc(a.id)}" data-aktiv="${aktiv}">${toggleLabel}</button></td>
        </tr>`
    }).join('')

    el.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>E-Mail</th><th>Datum</th><th>Aktiv</th><th>Aktion</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`

    el.querySelectorAll('[data-toggle-abo]').forEach((btn) => {
      btn.addEventListener('click', () => toggleAbo(btn.dataset.toggleAbo, btn.dataset.aktiv === 'true'))
    })
  } catch (err) {
    console.error('Abonnenten konnten nicht geladen werden:', err)
    el.innerHTML = '<p class="admin-empty">Abonnenten konnten nicht geladen werden.</p>'
  }
}

async function toggleAbo (id, aktivJetzt) {
  try {
    const { error } = await supabase.from('newsletter_abonnenten').update({ aktiv: !aktivJetzt }).eq('id', id)
    if (error) throw error
    ladeNewsletter()
  } catch (err) {
    console.error('Status ändern fehlgeschlagen:', err)
    window.alert('Der Status konnte nicht geändert werden.')
  }
}

// ── TAB 5: Bewertungen ──
function sterne (n) {
  const v = Math.max(0, Math.min(5, parseInt(n, 10) || 0))
  return '★★★★★☆☆☆☆☆'.slice(5 - v, 10 - v)
}

async function ladeBewertungen () {
  const el = document.getElementById('bewertungen-content')
  try {
    const { data, error } = await supabase
      .from('bewertungen')
      .select('*, shops(name)')
      .order('erstellt_am', { ascending: false })
    if (error) throw error
    const bewertungen = data || []

    if (bewertungen.length === 0) {
      el.innerHTML = '<p class="admin-empty">Noch keine Bewertungen.</p>'
      return
    }

    const rows = bewertungen.map((b) => `
      <tr>
        <td class="is-wrap">${esc(b.shops?.name || '—')}</td>
        <td class="is-wrap">${esc(b.autor_name)}</td>
        <td>${sterne(b.sterne)}</td>
        <td class="is-wrap">${esc(b.text || '—')}</td>
        <td>${formatDatum(b.erstellt_am)}</td>
        <td><button class="admin-link-btn" data-delete-bewertung="${esc(b.id)}">Löschen</button></td>
      </tr>`).join('')

    el.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Shop</th><th>Autor</th><th>Sterne</th><th>Text</th><th>Datum</th><th>Aktion</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`

    el.querySelectorAll('[data-delete-bewertung]').forEach((btn) => {
      btn.addEventListener('click', () => loescheBewertung(btn.dataset.deleteBewertung))
    })
  } catch (err) {
    console.error('Bewertungen konnten nicht geladen werden:', err)
    el.innerHTML = '<p class="admin-empty">Bewertungen konnten nicht geladen werden.</p>'
  }
}

async function loescheBewertung (id) {
  if (!window.confirm('Diese Bewertung wirklich löschen?')) return
  try {
    const { error } = await supabase.from('bewertungen').delete().eq('id', id)
    if (error) throw error
    ladeBewertungen()
  } catch (err) {
    console.error('Löschen fehlgeschlagen:', err)
    window.alert('Die Bewertung konnte nicht gelöscht werden.')
  }
}

// ── Init ──
async function init () {
  initMobileMenu()
  initHeaderSearch()
  initGateForm()

  if (await istAdmin()) {
    zeigeAdmin()
  } else {
    zeigeGate()
  }
}

init()
