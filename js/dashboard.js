// js/dashboard.js — SIB Händler-Dashboard
// Geschützte Seite: nur eingeloggte Händler sehen ihre eigenen Daten.
// Verknüpfung Händler <-> Shop über shops.user_id = auth.uid().

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'

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

          <button class="dash-produkt__delete" data-delete="${esc(p.id)}" data-titel="${esc(p.titel)}">Produkt löschen</button>
        </div>`
    }).join('')}</div>`

    el.querySelectorAll('[data-delete]').forEach((btn) => {
      btn.addEventListener('click', () => loesche(btn.dataset.delete, btn.dataset.titel))
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

// ── TAB 4: Nachrichten ──
async function ladeNachrichten () {
  const el = document.getElementById('nachrichten-content')
  const badge = document.getElementById('nachrichten-badge')
  try {
    // 1) Chats des Shops laden
    const { data: chats, error: e1 } = await supabase
      .from('chats')
      .select('id, sender_name, sender_email, gelesen, erstellt_am, aktualisiert_am')
      .eq('shop_id', shop.id)
      .order('aktualisiert_am', { ascending: false })
    if (e1) throw e1
    const alle = chats || []

    // 2) Alle Nachrichten dieser Chats laden (separate Query = zuverlässiger)
    let msgByChat = {}
    if (alle.length > 0) {
      const { data: nachrichten, error: e2 } = await supabase
        .from('chat_nachrichten')
        .select('id, chat_id, text, von_haendler, erstellt_am')
        .in('chat_id', alle.map(c => c.id))
        .order('erstellt_am', { ascending: true })
      if (!e2) {
        ;(nachrichten || []).forEach(m => {
          if (!msgByChat[m.chat_id]) msgByChat[m.chat_id] = []
          msgByChat[m.chat_id].push(m)
        })
      }
    }

    // Badge: nur bei ungelesenen Nachrichten
    const ungelesen = alle.filter(c => !c.gelesen).length
    if (badge) {
      badge.hidden = ungelesen === 0
      badge.textContent = ungelesen > 0 ? String(ungelesen) : ''
    }

    if (alle.length === 0) {
      el.innerHTML = '<p class="dash-empty">Noch keine Nachrichten.</p>'
      return
    }

    el.innerHTML = alle.map((chat) => {
      const msgs = msgByChat[chat.id] || []
      const ersteMsg = msgs[0]
      const unread = !chat.gelesen
      return `
        <div class="chat-item ${unread ? 'chat-item--unread' : ''}" data-chat-id="${esc(chat.id)}">
          <div class="chat-item__head">
            <div class="chat-item__meta">
              <span class="chat-item__name">${esc(chat.sender_name)}</span>
              <span class="chat-item__email">${esc(chat.sender_email)}</span>
              <span class="chat-item__date">${formatDatum(chat.erstellt_am)}</span>
            </div>
            <div class="chat-item__actions">
              ${unread ? '<span class="chat-item__dot" aria-label="Ungelesen"></span>' : ''}
              <button class="chat-item__del" data-del-chat="${esc(chat.id)}" title="Chat löschen" type="button">
                <svg viewBox="0 0 24 24" width="14" height="14"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"/></svg>
              </button>
            </div>
          </div>
          <p class="chat-item__preview">${esc((ersteMsg?.text || '').slice(0, 120))}${(ersteMsg?.text?.length || 0) > 120 ? '…' : ''}</p>
          <div class="chat-thread" id="thread-${esc(chat.id)}" hidden>
            <div class="chat-thread__nachrichten">
              ${msgs.map(m => `
                <div class="chat-bubble ${m.von_haendler ? 'chat-bubble--haendler' : 'chat-bubble--kunde'}">
                  <p>${esc(m.text)}</p>
                  <span class="chat-bubble__zeit">${formatDatum(m.erstellt_am)}</span>
                </div>`).join('')}
            </div>
            <form class="chat-reply" data-reply-chat="${esc(chat.id)}">
              <textarea class="form-input chat-reply__input" rows="2" placeholder="Antwort schreiben…" required></textarea>
              <button class="btn btn--primary" type="submit">Antworten</button>
              <div class="chat-reply__feedback" aria-live="polite"></div>
            </form>
          </div>
        </div>`
    }).join('')

    // Thread aufklappen + als gelesen markieren
    el.querySelectorAll('.chat-item').forEach(item => {
      item.querySelector('.chat-item__head').addEventListener('click', async () => {
        const id = item.dataset.chatId
        const thread = document.getElementById(`thread-${id}`)
        thread.hidden = !thread.hidden
        if (!thread.hidden && item.classList.contains('chat-item--unread')) {
          item.classList.remove('chat-item--unread')
          item.querySelector('.chat-item__dot')?.remove()
          await supabase.from('chats').update({ gelesen: true }).eq('id', id)
          const newUnread = el.querySelectorAll('.chat-item--unread').length
          if (badge) { badge.hidden = newUnread === 0; badge.textContent = newUnread > 0 ? String(newUnread) : '' }
        }
      })
    })

    // Chat löschen
    el.querySelectorAll('.chat-item__del').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation()
        const chatId = btn.dataset.delChat
        if (!confirm('Chat wirklich löschen?')) return
        try {
          // Nachrichten zuerst (kein CASCADE in DB)
          await supabase.from('chat_nachrichten').delete().eq('chat_id', chatId)
          const { error } = await supabase.from('chats').delete().eq('id', chatId)
          if (error) throw error
          ladeNachrichten()
        } catch (err) {
          alert('Fehler beim Löschen: ' + (err?.message || err))
        }
      })
    })

    // Antwort abschicken
    el.querySelectorAll('.chat-reply').forEach(form => {
      form.addEventListener('submit', async (e) => {
        e.preventDefault()
        const chatId = form.dataset.replyChat
        const textarea = form.querySelector('textarea')
        const fb = form.querySelector('.chat-reply__feedback')
        const text = textarea.value.trim()
        if (!text) return
        const btn = form.querySelector('button')
        btn.disabled = true; btn.textContent = '…'
        try {
          const { error } = await supabase.from('chat_nachrichten')
            .insert({ chat_id: chatId, text, von_haendler: true })
          if (error) throw error
          await supabase.from('chats')
            .update({ aktualisiert_am: new Date().toISOString() })
            .eq('id', chatId)
          textarea.value = ''
          // Thread nach Reload wieder öffnen
          await ladeNachrichten()
          const reopened = document.getElementById(`thread-${chatId}`)
          if (reopened) reopened.hidden = false
        } catch (err) {
          fb.innerHTML = `<span class="error-msg">${err?.message || 'Fehler'}</span>`
          btn.disabled = false; btn.textContent = 'Antworten'
        }
      })
    })

  } catch (err) {
    console.error('Nachrichten laden:', err)
    el.innerHTML = `<p class="dash-empty" style="color:red">${err?.message || JSON.stringify(err)}</p>`
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
  initProduktForm()
  initShopForm()

  ladeReservierungen()
  ladeProdukte()
  ladeNachrichten()
  ladeKategorienDropdown()
  fuelleShopForm()
}

init()
