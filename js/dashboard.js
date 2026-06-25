// js/dashboard.js — SIB Händler-Dashboard
// Geschützte Seite: nur eingeloggte Händler sehen ihre eigenen Daten.
// Verknüpfung Händler <-> Shop über shops.user_id = auth.uid().

import { supabase } from './supabase.js'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

let shop = null // aktueller Shop des eingeloggten Händlers

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

// ── Tabs ──
function initTabs () {
  const tabs = document.querySelectorAll('.dash-tab')
  const panels = document.querySelectorAll('.dash-panel')
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

// ── Logout ──
function initLogout () {
  const btn = document.getElementById('logout-btn')
  if (!btn) return
  btn.addEventListener('click', async () => {
    await supabase.auth.signOut()
    window.location.replace('login.html')
  })
}

// ── TAB 1: Reservierungen ──
function statusBadge (status) {
  const map = {
    offen: ['badge--outline', 'offen'],
    bestaetigt: ['badge', 'bestätigt'],
    abgelaufen: ['badge--muted', 'abgelaufen']
  }
  const [cls, label] = map[status] || ['badge--muted', status || '—']
  return `<span class="badge ${cls}">${esc(label)}</span>`
}

async function ladeReservierungen () {
  const el = document.getElementById('reservierungen-content')
  try {
    const { data, error } = await supabase
      .from('reservierungen')
      .select('*, produkte!inner(titel, shop_id)')
      .eq('produkte.shop_id', shop.id)
      .order('erstellt_am', { ascending: false })

    if (error) throw error
    const reservierungen = data || []

    if (reservierungen.length === 0) {
      el.innerHTML = '<p class="dash-empty">Noch keine Reservierungen.</p>'
      return
    }

    const rows = reservierungen.map((r) => {
      const aktion = r.status === 'offen'
        ? `<button class="btn btn--primary" data-confirm="${esc(r.id)}" style="padding:0.4rem 0.9rem;font-size:var(--text-xs)">Bestätigen</button>`
        : '—'
      return `
        <tr>
          <td>${formatDatum(r.erstellt_am)}</td>
          <td class="is-wrap">${esc(r.produkte?.titel || '—')}</td>
          <td>${esc(r.kunde_name)}</td>
          <td>${esc(r.kunde_email)}</td>
          <td>${statusBadge(r.status)}</td>
          <td>${aktion}</td>
        </tr>`
    }).join('')

    el.innerHTML = `
      <div class="dash-table-wrap">
        <table class="dash-table">
          <thead>
            <tr>
              <th>Datum</th><th>Produkt</th><th>Kunde</th>
              <th>E-Mail</th><th>Status</th><th>Aktion</th>
            </tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`

    el.querySelectorAll('[data-confirm]').forEach((btn) => {
      btn.addEventListener('click', () => bestaetige(btn.dataset.confirm, btn))
    })
  } catch (err) {
    console.error('Reservierungen konnten nicht geladen werden:', err)
    el.innerHTML = '<p class="dash-empty">Reservierungen konnten nicht geladen werden.</p>'
  }
}

async function bestaetige (id, btn) {
  btn.disabled = true
  btn.textContent = '…'
  try {
    const { error } = await supabase
      .from('reservierungen')
      .update({ status: 'bestaetigt' })
      .eq('id', id)
    if (error) throw error
    ladeReservierungen()
  } catch (err) {
    console.error('Bestätigen fehlgeschlagen:', err)
    btn.disabled = false
    btn.textContent = 'Bestätigen'
  }
}

// ── TAB 2: Produkte ──
async function ladeProdukte () {
  const el = document.getElementById('produkte-content')
  try {
    const { data, error } = await supabase
      .from('produkte')
      .select('*')
      .eq('shop_id', shop.id)
      .order('erstellt_am', { ascending: false })

    if (error) throw error
    const produkte = data || []

    if (produkte.length === 0) {
      el.innerHTML = '<p class="dash-empty">Noch keine Produkte. Füge dein erstes Produkt hinzu.</p>'
      return
    }

    el.innerHTML = `<div class="dash-produkte-grid">${produkte.map((p) => {
      const bilder = Array.isArray(p.bilder) ? p.bilder.filter(Boolean) : []
      const bild = bilder[0]
        ? `<img class="dash-produkt__image" src="${esc(bilder[0])}" alt="${esc(p.titel)}" loading="lazy">`
        : '<div class="dash-produkt__image"></div>'
      const preis = (p.preis !== null && p.preis !== undefined) ? euro.format(p.preis) : ''
      const status = p.verfuegbar !== false ? 'Verfügbar: ja' : 'Verfügbar: nein'
      const freigabeBadge = p.freigegeben === true
        ? '<span class="badge badge--muted dash-produkt__badge">Freigegeben</span>'
        : '<span class="badge badge--outline dash-produkt__badge">Ausstehend</span>'
      return `
        <div class="dash-produkt">
          ${bild}
          ${freigabeBadge}
          <p class="dash-produkt__title">${esc(p.titel)}</p>
          <p class="dash-produkt__price">${esc(preis)}</p>
          <p class="dash-produkt__status">${status}</p>
          <button class="dash-produkt__delete" data-delete="${esc(p.id)}" data-titel="${esc(p.titel)}">Löschen</button>
        </div>`
    }).join('')}</div>`

    el.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', () => loesche(btn.dataset.delete, btn.dataset.titel))
    })
  } catch (err) {
    console.error('Produkte konnten nicht geladen werden:', err)
    el.innerHTML = '<p class="dash-empty">Produkte konnten nicht geladen werden.</p>'
  }
}

async function loesche (id, titel) {
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

async function ladeKategorienDropdown () {
  const select = document.getElementById('pf-kategorie')
  try {
    const { data, error } = await supabase.from('kategorien').select('id, name').order('name')
    if (error) throw error
    ;(data || []).forEach((k) => {
      const opt = document.createElement('option')
      opt.value = k.id
      opt.textContent = k.name
      select.appendChild(opt)
    })
  } catch (err) {
    console.error('Kategorien konnten nicht geladen werden:', err)
  }
}

function initProduktForm () {
  const toggleBtn = document.getElementById('toggle-produkt-form')
  const cancelBtn = document.getElementById('cancel-produkt-form')
  const form = document.getElementById('produkt-form')
  const feedback = document.getElementById('produkt-form-feedback')

  toggleBtn.addEventListener('click', () => {
    form.hidden = !form.hidden
    if (!form.hidden) form.titel.focus()
  })
  cancelBtn.addEventListener('click', () => {
    form.reset()
    feedback.innerHTML = ''
    form.hidden = true
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    feedback.innerHTML = ''

    const titel = form.titel.value.trim()
    const preisRaw = form.preis.value
    if (!titel || preisRaw === '') {
      feedback.innerHTML = '<div class="error-msg">Bitte Titel und Preis ausfüllen.</div>'
      return
    }

    const bildUrl = form.bild_url.value.trim()
    const neu = {
      shop_id: shop.id,
      titel,
      beschreibung: form.beschreibung.value.trim() || null,
      preis: parseFloat(preisRaw),
      kategorie_id: form.kategorie_id.value || null,
      bilder: bildUrl ? [bildUrl] : [],
      verfuegbar: true,
      freigegeben: false // muss vom Admin freigegeben werden
    }

    const submitBtn = form.querySelector('button[type="submit"]')
    submitBtn.disabled = true
    submitBtn.textContent = 'Wird gespeichert…'

    try {
      const { error } = await supabase.from('produkte').insert(neu)
      if (error) throw error
      form.reset()
      form.hidden = true
      ladeProdukte()
    } catch (err) {
      console.error('Produkt anlegen fehlgeschlagen:', err)
      feedback.innerHTML = '<div class="error-msg">Das Produkt konnte nicht gespeichert werden.</div>'
    } finally {
      submitBtn.disabled = false
      submitBtn.textContent = 'Speichern'
    }
  })
}

// ── TAB 3: Shop-Einstellungen ──
function fuelleShopForm () {
  const f = document.getElementById('shop-form')
  f.name.value = shop.name || ''
  f.beschreibung.value = shop.beschreibung || ''
  f.adresse.value = shop.adresse || ''
  f.oeffnungszeiten.value = shop.oeffnungszeiten || ''
  f.logo_url.value = shop.logo_url || ''
  f.banner_url.value = shop.banner_url || ''
}

function initShopForm () {
  const form = document.getElementById('shop-form')
  const feedback = document.getElementById('shop-form-feedback')

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    feedback.innerHTML = ''

    const updates = {
      name: form.name.value.trim(),
      beschreibung: form.beschreibung.value.trim() || null,
      adresse: form.adresse.value.trim() || null,
      oeffnungszeiten: form.oeffnungszeiten.value.trim() || null,
      logo_url: form.logo_url.value.trim() || null,
      banner_url: form.banner_url.value.trim() || null
    }

    if (!updates.name) {
      feedback.innerHTML = '<div class="error-msg">Der Shop-Name darf nicht leer sein.</div>'
      return
    }

    const submitBtn = form.querySelector('button[type="submit"]')
    submitBtn.disabled = true
    submitBtn.textContent = 'Wird gespeichert…'

    try {
      const { error } = await supabase.from('shops').update(updates).eq('id', shop.id)
      if (error) throw error
      shop = { ...shop, ...updates }
      document.getElementById('dash-greeting').textContent = `Willkommen, ${shop.name}`
      feedback.innerHTML = '<div class="success-msg">Änderungen gespeichert.</div>'
    } catch (err) {
      console.error('Shop speichern fehlgeschlagen:', err)
      feedback.innerHTML = '<div class="error-msg">Die Änderungen konnten nicht gespeichert werden.</div>'
    } finally {
      submitBtn.disabled = false
      submitBtn.textContent = 'Speichern'
    }
  })
}

// ── Init: Auth-Schutz + Daten laden ──
async function init () {
  initMobileMenu()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    window.location.replace('login.html')
    return
  }

  const loading = document.getElementById('dashboard-loading')
  const dashboard = document.getElementById('dashboard')

  // Shop des eingeloggten Händlers laden
  try {
    const { data, error } = await supabase
      .from('shops')
      .select('*')
      .eq('user_id', session.user.id)
      .maybeSingle()

    if (error) throw error

    if (!data) {
      loading.innerHTML = `
        <div class="dash-empty">
          <p>Diesem Konto ist noch kein Geschäft zugeordnet.</p>
          <p style="margin-top:1rem"><button class="btn btn--outline" id="logout-btn2">Abmelden</button></p>
        </div>`
      document.getElementById('logout-btn2')?.addEventListener('click', async () => {
        await supabase.auth.signOut()
        window.location.replace('login.html')
      })
      return
    }

    shop = data
  } catch (err) {
    console.error('Shop konnte nicht geladen werden:', err)
    loading.textContent = 'Dein Geschäft konnte nicht geladen werden.'
    return
  }

  // UI vorbereiten
  loading.hidden = true
  dashboard.hidden = false
  document.getElementById('dash-greeting').textContent = `Willkommen, ${shop.name}`

  initTabs()
  initLogout()
  initProduktForm()
  initShopForm()

  ladeReservierungen()
  ladeProdukte()
  ladeKategorienDropdown()
  fuelleShopForm()
}

init()
