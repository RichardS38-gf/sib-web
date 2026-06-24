// js/admin.js — SIB Admin-Bereich (Florian)
// Sicherer Zugang über Supabase Auth + is_admin()-Prüfung (kein service_role im Frontend).
// Vollzugriff wird serverseitig per RLS-Policy gewährt (siehe supabase/admin-setup.sql).

import { supabase } from './supabase.js'

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
  document.getElementById('admin-loading').hidden = true
  document.getElementById('admin').hidden = true
  const gate = document.getElementById('admin-gate')
  gate.hidden = false
  if (msg) {
    document.getElementById('admin-gate-feedback').innerHTML = `<div class="error-msg">${esc(msg)}</div>`
  }
}

function zeigeAdmin () {
  document.getElementById('admin-gate').hidden = true
  document.getElementById('admin-loading').hidden = true
  document.getElementById('admin').hidden = false

  initTabs()
  initLogout()
  initShopCreateForm()

  ladeHaendler()
  ladeProdukte()
  ladeReservierungen()
  ladeNewsletter()
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
          <td><button class="admin-link-btn" data-toggle-shop="${esc(s.id)}" data-aktiv="${aktiv}">${toggleLabel}</button></td>
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

function initShopCreateForm () {
  const toggleBtn = document.getElementById('toggle-shop-form')
  const cancelBtn = document.getElementById('cancel-shop-form')
  const form = document.getElementById('shop-create-form')
  const feedback = document.getElementById('shop-create-feedback')

  toggleBtn.addEventListener('click', () => {
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
    const slug = form.slug.value.trim()
    if (!name || !slug) {
      feedback.innerHTML = '<div class="error-msg">Bitte Name und Slug ausfüllen.</div>'
      return
    }

    const neu = {
      name,
      slug,
      beschreibung: form.beschreibung.value.trim() || null,
      adresse: form.adresse.value.trim() || null,
      oeffnungszeiten: form.oeffnungszeiten.value.trim() || null,
      aktiv: true
    }

    const submitBtn = form.querySelector('button[type="submit"]')
    submitBtn.disabled = true
    submitBtn.textContent = 'Wird angelegt…'

    try {
      const { error } = await supabase.from('shops').insert(neu)
      if (error) {
        if (error.code === '23505') {
          feedback.innerHTML = '<div class="error-msg">Dieser Slug ist bereits vergeben.</div>'
          return
        }
        throw error
      }
      form.reset()
      form.hidden = true
      ladeHaendler()
    } catch (err) {
      console.error('Händler anlegen fehlgeschlagen:', err)
      feedback.innerHTML = '<div class="error-msg">Der Händler konnte nicht angelegt werden.</div>'
    } finally {
      submitBtn.disabled = false
      submitBtn.textContent = 'Anlegen'
    }
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
      const preis = (p.preis !== null && p.preis !== undefined) ? euro.format(p.preis) : '—'
      const toggleLabel = verfuegbar ? 'Auf nicht verfügbar' : 'Auf verfügbar'
      return `
        <tr>
          <td class="is-wrap">${esc(p.titel)}</td>
          <td class="is-wrap">${esc(p.shops?.name || '—')}</td>
          <td>${esc(preis)}</td>
          <td>${jaNein(verfuegbar)}</td>
          <td>
            <button class="admin-link-btn" data-toggle-produkt="${esc(p.id)}" data-verf="${verfuegbar}">${toggleLabel}</button>
            <button class="admin-link-btn" data-delete-produkt="${esc(p.id)}" data-titel="${esc(p.titel)}">Löschen</button>
          </td>
        </tr>`
    }).join('')

    el.innerHTML = `
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Titel</th><th>Shop</th><th>Preis</th><th>Verfügbar</th><th>Aktion</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`

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

// ── Init ──
async function init () {
  initMobileMenu()
  initGateForm()

  if (await istAdmin()) {
    zeigeAdmin()
  } else {
    zeigeGate()
  }
}

init()
