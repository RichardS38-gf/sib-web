// js/dashboard.js — SIB Händler-Dashboard
// Geschützte Seite: nur eingeloggte Händler sehen ihre eigenen Daten.
// Verknüpfung Händler <-> Shop über shops.user_id = auth.uid().

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'
import { initProduktModal, oeffneProduktModal } from './produkt-modal.js'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

// Feste Größen-Liste (Reihenfolge wie auf der Produktseite)
const GROESSEN = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Einheitsgröße']

let shop = null // aktueller Shop des eingeloggten Händlers
let reservierungenListe = [] // Cache für die E-Mail-Daten beim Bestätigen

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
    window.location.replace('haendler-login.html')
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
    reservierungenListe = reservierungen

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

// Abholbereit-E-Mail an den Kunden (Edge Function) — stört den Ablauf nicht
async function sendeAbholbereitMail (r) {
  try {
    await supabase.functions.invoke('send-email', {
      body: {
        type: 'abholbereit',
        kunde_name: r.kunde_name,
        kunde_email: r.kunde_email,
        produkt_titel: r.produkte?.titel || 'dein Artikel',
        shop_name: shop?.name || 'dem Geschäft',
        shop_adresse: shop?.adresse || '',
        reservierung_id: r.id
      }
    })
  } catch (err) {
    console.error('Abholbereit-E-Mail konnte nicht gesendet werden:', err)
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

    // Kunde benachrichtigen (nicht blockierend)
    const r = reservierungenListe.find((x) => x.id === id)
    if (r) sendeAbholbereitMail(r)

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

    // Varianten aller Produkte laden und nach produkt_id gruppieren
    const variantenByProdukt = {}
    const ids = produkte.map((p) => p.id)
    if (ids.length) {
      const { data: vData, error: vErr } = await supabase
        .from('produkt_varianten')
        .select('*')
        .in('produkt_id', ids)
        .order('erstellt_am', { ascending: true })
      if (!vErr) {
        (vData || []).forEach((v) => {
          if (!variantenByProdukt[v.produkt_id]) variantenByProdukt[v.produkt_id] = []
          variantenByProdukt[v.produkt_id].push(v)
        })
      }
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

      const varianten = variantenByProdukt[p.id] || []
      const byGroesse = {}
      varianten.forEach((v) => { byGroesse[v.groesse] = v })

      const groessenRows = GROESSEN.map((g) => {
        const vorhanden = byGroesse[g]
        const checked = !!vorhanden
        const stk = vorhanden ? (vorhanden.stueckzahl ?? 0) : 1
        return `
          <label class="dash-groesse-row">
            <input type="checkbox" class="dash-groesse-check" value="${esc(g)}" ${checked ? 'checked' : ''}>
            <span class="dash-groesse-name">${esc(g)}</span>
            <input type="number" class="form-input dash-groesse-stk" min="0" value="${esc(stk)}" ${checked ? '' : 'disabled'}>
          </label>`
      }).join('')

      return `
        <div class="dash-produkt">
          ${bild}
          ${freigabeBadge}
          <p class="dash-produkt__title">${esc(p.titel)}</p>
          <p class="dash-produkt__price">${esc(preis)}</p>
          <p class="dash-produkt__status">${status}</p>

          <div class="dash-varianten" data-groessen="${esc(p.id)}">
            <p class="dash-varianten__label">Größen &amp; Stück</p>
            <div class="dash-groessen">${groessenRows}</div>
            <div class="dash-groessen__bar">
              <button class="btn btn--outline dash-groessen__save" type="button" data-save-groessen="${esc(p.id)}">Größen speichern</button>
              <span class="dash-groessen__feedback" data-feedback="${esc(p.id)}" aria-live="polite"></span>
            </div>
          </div>

          <div class="dash-produkt__actions">
            <button class="btn btn--outline dash-produkt__edit" data-edit="${esc(p.id)}">Bearbeiten</button>
            <button class="dash-produkt__delete" data-delete="${esc(p.id)}" data-titel="${esc(p.titel)}">Löschen</button>
          </div>
        </div>`
    }).join('')}</div>`

    el.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', () => loesche(btn.dataset.delete, btn.dataset.titel))
    })

    el.querySelectorAll('[data-edit]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const p = produkte.find((x) => x.id === btn.dataset.edit)
        if (!p) return
        oeffneProduktModal({
          produkt: p,
          onSave: () => ladeProdukte()
        })
      })
    })

    // Checkbox aktiviert/deaktiviert das zugehörige Stückzahl-Feld
    el.querySelectorAll('.dash-groesse-row').forEach((row) => {
      const cb = row.querySelector('.dash-groesse-check')
      const stk = row.querySelector('.dash-groesse-stk')
      cb.addEventListener('change', () => {
        stk.disabled = !cb.checked
        if (cb.checked) stk.focus()
      })
    })

    // Größen speichern
    el.querySelectorAll('[data-save-groessen]').forEach((btn) => {
      btn.addEventListener('click', () => speichereGroessen(btn.dataset.saveGroessen, btn))
    })
  } catch (err) {
    console.error('Produkte konnten nicht geladen werden:', err)
    el.innerHTML = '<p class="dash-empty">Produkte konnten nicht geladen werden.</p>'
  }
}

// Größen eines Produkts speichern: angehakte Größen ersetzen die bestehenden
async function speichereGroessen (produktId, btn) {
  const container = document.querySelector(`.dash-varianten[data-groessen="${CSS.escape(produktId)}"]`)
  const feedback = container?.querySelector('.dash-groessen__feedback')
  if (!container) return

  const neu = []
  container.querySelectorAll('.dash-groesse-row').forEach((row) => {
    const cb = row.querySelector('.dash-groesse-check')
    if (!cb.checked) return
    let stk = parseInt(row.querySelector('.dash-groesse-stk').value, 10)
    if (isNaN(stk) || stk < 0) stk = 0
    neu.push({ produkt_id: produktId, groesse: cb.value, stueckzahl: stk })
  })

  btn.disabled = true
  btn.textContent = 'Wird gespeichert…'
  if (feedback) feedback.innerHTML = ''

  try {
    // bestehende Varianten ersetzen
    const { error: delErr } = await supabase.from('produkt_varianten').delete().eq('produkt_id', produktId)
    if (delErr) throw delErr
    if (neu.length) {
      const { error: insErr } = await supabase.from('produkt_varianten').insert(neu)
      if (insErr) throw insErr
    }
    ladeProdukte()
  } catch (err) {
    console.error('Größen speichern fehlgeschlagen:', err)
    if (feedback) feedback.innerHTML = '<span class="error-msg">Speichern fehlgeschlagen.</span>'
    btn.disabled = false
    btn.textContent = 'Größen speichern'
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
  if (!toggleBtn) return
  toggleBtn.addEventListener('click', () => {
    oeffneProduktModal({
      onSave: async (daten) => {
        const { error } = await supabase.from('produkte').insert({
          ...daten,
          shop_id: shop.id,
          freigegeben: false
        })
        if (error) throw error
        ladeProdukte()
      }
    })
  })
}

// ── TAB 4: Nachrichten ──
async function ladeNachrichten () {
  const statusEl = document.getElementById('nachrichten-content')
  const chatEl   = document.getElementById('dash-chat')
  const tabsEl   = document.getElementById('dash-chat-tabs')
  const msgsEl   = document.getElementById('dash-chat-messages')
  const input    = document.getElementById('dash-chat-input')
  const sendBtn  = document.getElementById('dash-chat-send')
  const badge    = document.getElementById('nachrichten-badge')

  try {
    // 1) Chats laden
    const { data: chats, error: e1 } = await supabase
      .from('chats')
      .select('id, sender_name, sender_email, gelesen, erstellt_am, aktualisiert_am')
      .eq('shop_id', shop.id)
      .order('aktualisiert_am', { ascending: false })
    if (e1) throw e1
    const alle = chats || []

    // 2) Alle Nachrichten laden
    let msgByChat = {}
    if (alle.length > 0) {
      const { data: nachrichten } = await supabase
        .from('chat_nachrichten')
        .select('id, chat_id, text, von_haendler, erstellt_am')
        .in('chat_id', alle.map(c => c.id))
        .order('erstellt_am', { ascending: true })
      ;(nachrichten || []).forEach(m => {
        if (!msgByChat[m.chat_id]) msgByChat[m.chat_id] = []
        msgByChat[m.chat_id].push(m)
      })
    }

    // Badge
    const ungelesen = alle.filter(c => !c.gelesen).length
    if (badge) { badge.hidden = ungelesen === 0; badge.textContent = ungelesen > 0 ? String(ungelesen) : '' }

    if (alle.length === 0) {
      statusEl.innerHTML = '<p class="dash-empty">Noch keine Nachrichten.</p>'
      chatEl.hidden = true
      return
    }

    statusEl.innerHTML = ''
    chatEl.hidden = false

    let aktiveChat = alle[0]

    // Reiter bauen
    function buildTabs () {
      tabsEl.innerHTML = alle.map((chat, i) => {
        const preview = (msgByChat[chat.id]?.[0]?.text || '').slice(0, 22)
        const unread  = !chat.gelesen
        return `<button class="dash-chat__tab${chat.id === aktiveChat.id ? ' active' : ''}" data-chat-id="${esc(chat.id)}">
          ${unread ? '<span class="dash-chat__tab-dot"></span>' : ''}
          Chat ${i + 1}${preview ? ' · ' + esc(preview) + '…' : ''}
          <button class="dash-chat__tab-del" data-del="${esc(chat.id)}" type="button" title="Löschen">×</button>
        </button>`
      }).join('')

      tabsEl.querySelectorAll('.dash-chat__tab').forEach(tab => {
        tab.addEventListener('click', (e) => {
          if (e.target.closest('.dash-chat__tab-del')) return
          const id = tab.dataset.chatId
          aktiveChat = alle.find(c => c.id === id)
          // als gelesen markieren
          if (!aktiveChat.gelesen) {
            aktiveChat.gelesen = true
            supabase.from('chats').update({ gelesen: true }).eq('id', id)
            const nu = alle.filter(c => !c.gelesen).length
            if (badge) { badge.hidden = nu === 0; badge.textContent = nu > 0 ? String(nu) : '' }
          }
          tabsEl.querySelectorAll('.dash-chat__tab').forEach(t =>
            t.classList.toggle('active', t.dataset.chatId === id))
          renderMessages(msgByChat[id] || [])
        })
      })

      tabsEl.querySelectorAll('.dash-chat__tab-del').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          e.stopPropagation()
          const id = btn.dataset.del
          if (!confirm('Chat löschen?')) return
          await supabase.from('chat_nachrichten').delete().eq('chat_id', id)
          await supabase.from('chats').delete().eq('id', id)
          ladeNachrichten()
        })
      })
    }

    // Nachrichten rendern
    function renderMessages (msgs) {
      if (!msgs.length) {
        msgsEl.innerHTML = '<p class="dash-empty" style="text-align:center;padding:2rem 0">Noch keine Nachrichten.</p>'
        return
      }
      let lastDay = ''
      msgsEl.innerHTML = msgs.map(m => {
        const day = new Date(m.erstellt_am).toDateString()
        const sep = day !== lastDay ? `<div class="dash-chat__date">${formatDatum(m.erstellt_am)}</div>` : ''
        lastDay = day
        return `${sep}<div class="dash-chat__msg ${m.von_haendler ? 'out' : 'in'}">
          <div class="dash-chat__bubble">${esc(m.text)}</div>
          <span class="dash-chat__time">${formatDatum(m.erstellt_am, { hour: '2-digit', minute: '2-digit' })}</span>
        </div>`
      }).join('')
      msgsEl.scrollTop = msgsEl.scrollHeight
    }

    buildTabs()
    renderMessages(msgByChat[aktiveChat.id] || [])

    // Senden
    sendBtn.onclick = null
    sendBtn.onclick = async () => {
      const text = input.value.trim()
      if (!text) return
      sendBtn.disabled = true
      try {
        const { error } = await supabase.from('chat_nachrichten')
          .insert({ chat_id: aktiveChat.id, text, von_haendler: true })
        if (error) throw error
        await supabase.from('chats')
          .update({ aktualisiert_am: new Date().toISOString() }).eq('id', aktiveChat.id)
        input.value = ''
        if (!msgByChat[aktiveChat.id]) msgByChat[aktiveChat.id] = []
        msgByChat[aktiveChat.id].push({ text, von_haendler: true, erstellt_am: new Date().toISOString() })
        renderMessages(msgByChat[aktiveChat.id])
      } catch (err) { alert(err?.message || 'Fehler') }
      finally { sendBtn.disabled = false; input.focus() }
    }

    input.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn.click() }
    }
    input.oninput = () => {
      input.style.height = 'auto'
      input.style.height = Math.min(input.scrollHeight, 120) + 'px'
    }

  } catch (err) {
    console.error('Nachrichten laden:', err)
    document.getElementById('nachrichten-content').innerHTML =
      `<p class="dash-empty" style="color:red">${err?.message || JSON.stringify(err)}</p>`
  }
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
  const msgToggle = document.getElementById('sf-messaging')
  if (msgToggle) msgToggle.checked = !!shop.messaging_enabled
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
      banner_url: form.banner_url.value.trim() || null,
      messaging_enabled: document.getElementById('sf-messaging')?.checked ?? false
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
  initHeaderSearch()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    window.location.replace('haendler-login.html')
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
        window.location.replace('haendler-login.html')
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
  // .style.display statt .hidden, da die .loading-Klasse (display:flex)
  // das [hidden]-Attribut überstimmen würde.
  loading.style.display = 'none'
  dashboard.hidden = false
  document.getElementById('dash-greeting').textContent = `Willkommen, ${shop.name}`

  initTabs()
  initLogout()
  initProduktModal()
  initProduktForm()
  initShopForm()

  ladeReservierungen()
  ladeProdukte()
  ladeNachrichten()
  fuelleShopForm()

  // Nachrichten-Badge alle 30s aktualisieren
  setInterval(async () => {
    const badge = document.getElementById('nachrichten-badge')
    if (!badge) return
    const { data } = await supabase
      .from('chats')
      .select('id', { count: 'exact' })
      .eq('shop_id', shop.id)
      .eq('gelesen', false)
    const n = data?.length ?? 0
    badge.hidden = n === 0
    badge.textContent = n > 0 ? String(n) : ''
  }, 30000)
}

init()
