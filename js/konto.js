// js/konto.js — SIB Käufer-Konto
// Geschützte Seite für eingeloggte Kunden: Persönliche Daten, Reservierungen,
// Bewertungen, Wunschliste, Nachrichten.

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'
import { renderProductCard, fetchProductRatings, initWunschlisteButtons } from './product-card.js'

let kunde = null
let userId = null

function esc (value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDatum (value, opts) {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d)) return '—'
  return d.toLocaleDateString('de-DE', opts || { day: '2-digit', month: '2-digit', year: 'numeric' })
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

function initLogout () {
  const btn = document.getElementById('konto-logout-btn')
  if (!btn) return
  btn.addEventListener('click', async () => {
    await supabase.auth.signOut()
    window.location.replace('haendler-login.html?rolle=kunde')
  })
}

// ── TAB: Persönliche Daten ──
function fuelleDatenForm () {
  const f = document.getElementById('konto-daten-form')
  f.vorname.value = kunde.vorname || ''
  f.nachname.value = kunde.nachname || ''
  f.email.value = kunde.email || ''
  f.telefon.value = kunde.telefon || ''
}

function initDatenForm () {
  const form = document.getElementById('konto-daten-form')
  const feedback = document.getElementById('konto-daten-feedback')

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    feedback.innerHTML = ''

    const updates = {
      vorname: form.vorname.value.trim(),
      nachname: form.nachname.value.trim(),
      telefon: form.telefon.value.trim() || null
    }

    const submitBtn = form.querySelector('button[type="submit"]')
    submitBtn.disabled = true
    submitBtn.textContent = 'Wird gespeichert…'

    try {
      const { error } = await supabase.from('kunden').update(updates).eq('id', userId)
      if (error) throw error
      kunde = { ...kunde, ...updates }
      document.getElementById('konto-greeting').textContent = `Willkommen, ${kunde.vorname || 'Kunde'}`
      feedback.innerHTML = '<div class="success-msg">Änderungen gespeichert.</div>'
    } catch (err) {
      console.error('Daten speichern fehlgeschlagen:', err)
      feedback.innerHTML = '<div class="error-msg">Die Änderungen konnten nicht gespeichert werden.</div>'
    } finally {
      submitBtn.disabled = false
      submitBtn.textContent = 'Speichern'
    }
  })
}

function initPasswortForm () {
  const form = document.getElementById('konto-passwort-form')
  const feedback = document.getElementById('konto-passwort-feedback')

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    feedback.innerHTML = ''
    const neu = form.passwort.value

    if (!neu || neu.length < 6) {
      feedback.innerHTML = '<div class="error-msg">Das Passwort muss mindestens 6 Zeichen lang sein.</div>'
      return
    }

    const submitBtn = form.querySelector('button[type="submit"]')
    submitBtn.disabled = true
    submitBtn.textContent = 'Wird aktualisiert…'

    try {
      const { error } = await supabase.auth.updateUser({ password: neu })
      if (error) throw error
      form.reset()
      feedback.innerHTML = '<div class="success-msg">Passwort wurde aktualisiert.</div>'
    } catch (err) {
      console.error('Passwort aktualisieren fehlgeschlagen:', err)
      feedback.innerHTML = '<div class="error-msg">Das Passwort konnte nicht aktualisiert werden.</div>'
    } finally {
      submitBtn.disabled = false
      submitBtn.textContent = 'Passwort aktualisieren'
    }
  })
}

// ── TAB: Reservierungen ──
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
  const el = document.getElementById('konto-reservierungen-content')
  try {
    const { data, error } = await supabase
      .from('reservierungen')
      .select('*, produkte(titel, id, shops(name, slug))')
      .eq('user_id', userId)
      .order('erstellt_am', { ascending: false })

    if (error) throw error
    const reservierungen = data || []

    if (reservierungen.length === 0) {
      el.innerHTML = '<p class="dash-empty">Du hast noch keine Artikel reserviert.</p>'
      return
    }

    const rows = reservierungen.map((r) => `
      <tr>
        <td>${formatDatum(r.erstellt_am)}</td>
        <td class="is-wrap"><a href="produkt.html?id=${esc(r.produkte?.id || '')}">${esc(r.produkte?.titel || '—')}</a></td>
        <td>${esc(r.produkte?.shops?.name || '—')}</td>
        <td>${statusBadge(r.status)}</td>
      </tr>`).join('')

    el.innerHTML = `
      <div class="dash-table-wrap">
        <table class="dash-table">
          <thead><tr><th>Datum</th><th>Produkt</th><th>Geschäft</th><th>Status</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`
  } catch (err) {
    console.error('Reservierungen konnten nicht geladen werden:', err)
    el.innerHTML = '<p class="dash-empty">Reservierungen konnten nicht geladen werden.</p>'
  }
}

// ── TAB: Bewertungen ──
function sterneHtmlKonto (n, max = 5) {
  const v = Math.max(0, Math.min(max, Math.round(n)))
  return '★'.repeat(v) + '☆'.repeat(max - v) + ` <span class="dash-bewertung__sterne-text">${v} von ${max}</span>`
}

function sterneAuswahlHtml (aktuelleSterne) {
  return Array.from({ length: 5 }, (_, i) => {
    const wert = i + 1
    return `<button type="button" class="stern${wert <= aktuelleSterne ? ' is-on' : ''}" data-wert="${wert}">★</button>`
  }).join('')
}

async function ladeBewertungen () {
  const el = document.getElementById('konto-bewertungen-content')
  try {
    const { data, error } = await supabase
      .from('bewertungen')
      .select('*, produkte(titel, id)')
      .eq('user_id', userId)
      .order('erstellt_am', { ascending: false })

    if (error) throw error
    const bewertungen = data || []

    if (bewertungen.length === 0) {
      el.innerHTML = '<p class="dash-empty">Du hast noch keine Bewertungen geschrieben.</p>'
      return
    }

    el.innerHTML = `<div class="dash-bewertungen-liste">${bewertungen.map((b) => `
      <div class="dash-bewertung" data-bewertung-id="${esc(b.id)}">
        <div class="dash-bewertung__kopf">
          <a class="dash-bewertung__produkt" href="produkt.html?id=${esc(b.produkte?.id || '')}">${esc(b.produkte?.titel || 'Unbekanntes Produkt')}</a>
          <span class="dash-bewertung__datum">${formatDatum(b.erstellt_am)}</span>
        </div>
        <div class="dash-bewertung__ansicht">
          <div class="dash-bewertung__sterne">${sterneHtmlKonto(b.sterne)}</div>
          ${b.text ? `<p class="dash-bewertung__text">${esc(b.text)}</p>` : ''}
          <div class="dash-bewertung__actions">
            <button class="dash-bewertung__edit" type="button" data-edit-bewertung="${esc(b.id)}">Bearbeiten</button>
            <button class="dash-bewertung__delete" type="button" data-delete-bewertung="${esc(b.id)}">Löschen</button>
          </div>
        </div>
        <form class="dash-bewertung__edit-form" data-edit-form="${esc(b.id)}" hidden>
          <div class="sterne-input">${sterneAuswahlHtml(b.sterne)}</div>
          <textarea class="form-input" rows="3">${esc(b.text || '')}</textarea>
          <div class="dash-bewertung__edit-actions">
            <button class="btn btn--primary" type="submit">Speichern</button>
            <button class="btn btn--outline" type="button" data-cancel-edit="${esc(b.id)}">Abbrechen</button>
          </div>
          <div class="dash-bewertung__edit-feedback" aria-live="polite"></div>
        </form>
      </div>`).join('')}</div>`

    initBewertungAktionen()
  } catch (err) {
    console.error('Bewertungen konnten nicht geladen werden:', err)
    el.innerHTML = '<p class="dash-empty">Bewertungen konnten nicht geladen werden.</p>'
  }
}

function initBewertungAktionen () {
  const container = document.getElementById('konto-bewertungen-content')

  // Bearbeiten-Button öffnet das Inline-Formular
  container.querySelectorAll('[data-edit-bewertung]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const karte = btn.closest('.dash-bewertung')
      karte.querySelector('.dash-bewertung__ansicht').hidden = true
      karte.querySelector('[data-edit-form]').hidden = false
    })
  })

  // Abbrechen schließt das Formular wieder
  container.querySelectorAll('[data-cancel-edit]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const karte = btn.closest('.dash-bewertung')
      karte.querySelector('[data-edit-form]').hidden = true
      karte.querySelector('.dash-bewertung__ansicht').hidden = false
    })
  })

  // Sterne-Auswahl im Bearbeiten-Formular
  container.querySelectorAll('.dash-bewertung__edit-form .sterne-input').forEach((sterneEl) => {
    sterneEl.querySelectorAll('.stern').forEach((sternBtn) => {
      sternBtn.addEventListener('click', () => {
        const wert = Number(sternBtn.dataset.wert)
        sterneEl.querySelectorAll('.stern').forEach((b) => b.classList.toggle('is-on', Number(b.dataset.wert) <= wert))
        sterneEl.dataset.gewaehlt = wert
      })
    })
  })

  // Speichern (UPDATE)
  container.querySelectorAll('[data-edit-form]').forEach((form) => {
    form.addEventListener('submit', async (e) => {
      e.preventDefault()
      const id = form.dataset.editForm
      const feedback = form.querySelector('.dash-bewertung__edit-feedback')
      const sterneEl = form.querySelector('.sterne-input')
      const aktiveSterne = sterneEl.querySelectorAll('.stern.is-on').length
      const text = form.querySelector('textarea').value.trim()
      feedback.innerHTML = ''

      if (aktiveSterne < 1) {
        feedback.innerHTML = '<span class="error-msg">Bitte wähle eine Sterne-Bewertung.</span>'
        return
      }

      const submitBtn = form.querySelector('button[type="submit"]')
      submitBtn.disabled = true
      submitBtn.textContent = 'Wird gespeichert…'

      try {
        const { error } = await supabase
          .from('bewertungen')
          .update({ sterne: aktiveSterne, text: text || null })
          .eq('id', id)
          .eq('user_id', userId)
        if (error) throw error
        ladeBewertungen()
      } catch (err) {
        console.error('Bewertung aktualisieren fehlgeschlagen:', err)
        feedback.innerHTML = '<span class="error-msg">Konnte nicht gespeichert werden.</span>'
        submitBtn.disabled = false
        submitBtn.textContent = 'Speichern'
      }
    })
  })

  // Löschen
  container.querySelectorAll('[data-delete-bewertung]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Diese Bewertung wirklich löschen?')) return
      const id = btn.dataset.deleteBewertung
      btn.disabled = true
      try {
        const { error } = await supabase.from('bewertungen').delete().eq('id', id).eq('user_id', userId)
        if (error) throw error
        ladeBewertungen()
      } catch (err) {
        console.error('Bewertung löschen fehlgeschlagen:', err)
        window.alert('Die Bewertung konnte nicht gelöscht werden.')
        btn.disabled = false
      }
    })
  })
}

// ── TAB: Wunschliste ──
async function ladeWunschliste () {
  const el = document.getElementById('konto-wunschliste-content')
  try {
    const { data, error } = await supabase
      .from('wunschliste')
      .select('produkt_id, produkte(*, shops(name, slug))')
      .eq('user_id', userId)
      .order('erstellt_am', { ascending: false })

    if (error) throw error
    const eintraege = (data || []).filter((e) => e.produkte)

    if (eintraege.length === 0) {
      el.innerHTML = '<p class="dash-empty">Deine Wunschliste ist noch leer. Tippe auf das Herz bei einem Produkt, um es zu speichern.</p>'
      return
    }

    const produkte = eintraege.map((e) => e.produkte)
    const ratings = await fetchProductRatings(supabase, produkte.map((p) => p.id))
    el.innerHTML = produkte.map((p) => renderProductCard(p, p.shops?.name || 'Lokaler Händler', ratings[p.id] || null, true)).join('')
    initWunschlisteButtons(supabase, el)
  } catch (err) {
    console.error('Wunschliste konnte nicht geladen werden:', err)
    el.innerHTML = '<p class="dash-empty">Wunschliste konnte nicht geladen werden.</p>'
  }
}

// ── TAB: Nachrichten (alle Chats über alle Shops) ──
async function ladeNachrichten () {
  const statusEl = document.getElementById('konto-nachrichten-content')
  const chatEl   = document.getElementById('konto-chat')
  const tabsEl   = document.getElementById('konto-chat-tabs')
  const msgsEl   = document.getElementById('konto-chat-messages')
  const input    = document.getElementById('konto-chat-input')
  const sendBtn  = document.getElementById('konto-chat-send')

  try {
    const { data: chats, error: e1 } = await supabase
      .from('chats')
      .select('id, shop_id, gelesen, erstellt_am, aktualisiert_am, shops(name, slug, logo_url)')
      .eq('user_id', userId)
      .order('aktualisiert_am', { ascending: false })
    if (e1) throw e1
    const alle = chats || []

    let msgByChat = {}
    if (alle.length > 0) {
      const { data: nachrichten } = await supabase
        .from('chat_nachrichten')
        .select('id, chat_id, text, von_haendler, erstellt_am')
        .in('chat_id', alle.map((c) => c.id))
        .order('erstellt_am', { ascending: true })
      ;(nachrichten || []).forEach((m) => {
        if (!msgByChat[m.chat_id]) msgByChat[m.chat_id] = []
        msgByChat[m.chat_id].push(m)
      })
    }

    if (alle.length === 0) {
      statusEl.innerHTML = '<p class="dash-empty">Noch keine Nachrichten. Schreib einem Geschäft über dessen Shop-Seite.</p>'
      chatEl.hidden = true
      return
    }

    statusEl.innerHTML = ''
    chatEl.hidden = false

    let aktiveChat = alle[0]

    function buildTabs () {
      tabsEl.innerHTML = alle.map((chat) => `
        <button class="dash-chat__tab${chat.id === aktiveChat.id ? ' active' : ''}" data-chat-id="${esc(chat.id)}">
          ${esc(chat.shops?.name || 'Geschäft')}
        </button>`).join('')

      tabsEl.querySelectorAll('.dash-chat__tab').forEach((tab) => {
        tab.addEventListener('click', () => {
          const id = tab.dataset.chatId
          aktiveChat = alle.find((c) => c.id === id)
          tabsEl.querySelectorAll('.dash-chat__tab').forEach((t) => t.classList.toggle('active', t.dataset.chatId === id))
          renderMessages(msgByChat[id] || [])
        })
      })
    }

    function renderMessages (msgs) {
      if (!msgs.length) {
        msgsEl.innerHTML = '<p class="dash-empty" style="text-align:center;padding:2rem 0">Noch keine Nachrichten.</p>'
        return
      }
      let lastDay = ''
      msgsEl.innerHTML = msgs.map((m) => {
        const day = new Date(m.erstellt_am).toDateString()
        const sep = day !== lastDay ? `<div class="dash-chat__date">${formatDatum(m.erstellt_am)}</div>` : ''
        lastDay = day
        return `${sep}<div class="dash-chat__msg ${m.von_haendler ? 'in' : 'out'}">
          <div class="dash-chat__bubble">${esc(m.text)}</div>
          <span class="dash-chat__time">${formatDatum(m.erstellt_am, { hour: '2-digit', minute: '2-digit' })}</span>
        </div>`
      }).join('')
      msgsEl.scrollTop = msgsEl.scrollHeight
    }

    buildTabs()
    renderMessages(msgByChat[aktiveChat.id] || [])

    sendBtn.onclick = async () => {
      const text = input.value.trim()
      if (!text) return
      sendBtn.disabled = true
      try {
        const { error } = await supabase.from('chat_nachrichten')
          .insert({ chat_id: aktiveChat.id, text, von_haendler: false })
        if (error) throw error
        await supabase.from('chats').update({ aktualisiert_am: new Date().toISOString() }).eq('id', aktiveChat.id)
        input.value = ''
        if (!msgByChat[aktiveChat.id]) msgByChat[aktiveChat.id] = []
        msgByChat[aktiveChat.id].push({ text, von_haendler: false, erstellt_am: new Date().toISOString() })
        renderMessages(msgByChat[aktiveChat.id])
      } catch (err) { console.error(err) }
      finally { sendBtn.disabled = false; input.focus() }
    }

    input.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendBtn.click() }
    }
  } catch (err) {
    console.error('Nachrichten konnten nicht geladen werden:', err)
    statusEl.innerHTML = '<p class="dash-empty">Nachrichten konnten nicht geladen werden.</p>'
  }
}

// ── Init ──
async function init () {
  initMobileMenu()
  initHeaderSearch()

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) {
    window.location.replace('haendler-login.html?rolle=kunde')
    return
  }
  userId = session.user.id

  const loading = document.getElementById('konto-loading')
  const konto = document.getElementById('konto')

  try {
    const { data, error } = await supabase.from('kunden').select('*').eq('id', userId).maybeSingle()
    if (error) throw error

    if (!data) {
      // Kundenprofil existiert noch nicht (z.B. Account über andere Rolle) -> minimal anlegen
      const { data: neu, error: insErr } = await supabase
        .from('kunden')
        .insert({ id: userId, email: session.user.email })
        .select('*').single()
      if (insErr) throw insErr
      kunde = neu
    } else {
      kunde = data
    }
  } catch (err) {
    console.error('Kundenprofil konnte nicht geladen werden:', err)
    loading.textContent = 'Dein Konto konnte nicht geladen werden.'
    return
  }

  loading.style.display = 'none'
  konto.hidden = false
  document.getElementById('konto-greeting').textContent = `Willkommen, ${kunde.vorname || 'Kunde'}`

  initTabs()
  initLogout()
  initDatenForm()
  initPasswortForm()
  fuelleDatenForm()

  ladeReservierungen()
  ladeBewertungen()
  ladeWunschliste()
  ladeNachrichten()
}

init()
