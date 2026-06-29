// js/shop.js — SIB Shopseite v9
// Sektionen: Galerie → Info-Bar → Willkommen → Artikel → Bewertungen → Info-Tabelle
// Chat-Widget (floating) wenn messaging_enabled = true

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'
import { renderProductCard } from './product-card.js'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

function esc (value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDatum (value, opts) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('de-DE', opts || { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function formatMsgTime (value) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  const heute = new Date()
  const sameDay = d.toDateString() === heute.toDateString()
  if (sameDay) return d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' }) + ' ' +
         d.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
}

function neuBadge (p) {
  if (p.verfuegbar === false || p.freigegeben !== true) return ''
  // SALE hat Vorrang
  if (p.vergleichspreis && p.vergleichspreis > p.preis)
    return '<span class="product-card__badge product-card__badge--sale">SALE</span>'
  const t = new Date(p.freigegeben_am || p.erstellt_am || 0).getTime()
  if (!t) return ''
  return (Date.now() - t) < 7 * 24 * 60 * 60 * 1000
    ? '<span class="product-card__badge product-card__badge--neu">NEU</span>'
    : ''
}

function sterneHtml (n, max = 5) {
  const v = Math.max(0, Math.min(max, Math.round(n)))
  return '<span class="stern-on">★</span>'.repeat(v) + '<span class="stern-off">★</span>'.repeat(max - v)
}

function avatarHtml (name) {
  const initials = (name || '?').trim().slice(0, 1).toUpperCase()
  const colors = ['#2D6A4F','#1B4332','#52796F','#354F52','#40916C','#1D3557','#457B9D','#6D4C41']
  const hue = initials.charCodeAt(0) % colors.length
  return `<span class="bw-avatar" style="background:${colors[hue]}">${initials}</span>`
}

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

function getSlug () {
  return new URLSearchParams(window.location.search).get('slug')
}

function showLoading (on) {
  const el = document.getElementById('shop-loading')
  if (el) el.hidden = !on
}

function notFound (text) {
  showLoading(false)
  document.getElementById('shop-main').innerHTML = `
    <div class="container" style="padding-top:4rem;padding-bottom:4rem;text-align:center">
      <h1>Geschäft nicht gefunden</h1>
      <p style="margin-top:1rem;color:var(--color-muted)">${esc(text || 'Dieses Geschäft existiert nicht oder ist nicht mehr aktiv.')}</p>
      <p style="margin-top:2rem"><a class="btn btn--primary" href="geschaefte.html">Alle Geschäfte ansehen</a></p>
    </div>`
}

// ─────────────────────────────────────────
// 1. BILDERGALERIE
// ─────────────────────────────────────────
function renderGalerie (shop) {
  const el = document.getElementById('shop-galerie')
  const bilder = Array.isArray(shop.galerie) && shop.galerie.length > 0
    ? shop.galerie.filter(Boolean)
    : shop.banner_url ? [shop.banner_url] : []

  document.getElementById('shop-hero').hidden = false

  if (bilder.length === 0) return

  if (bilder.length === 1) {
    el.innerHTML = `<img class="shop-galerie__single" src="${esc(bilder[0])}" alt="${esc(shop.name)}">`
    return
  }

  const show = bilder.slice(0, 4)
  el.setAttribute('data-count', show.length)
  el.innerHTML = show.map((url, i) =>
    `<div class="shop-galerie__cell">
       <img src="${esc(url)}" alt="${esc(shop.name)} — Foto ${i + 1}" loading="${i === 0 ? 'eager' : 'lazy'}">
     </div>`
  ).join('')
}

// ─────────────────────────────────────────
// 2. INFO-BAR
// ─────────────────────────────────────────
function renderInfoBar (shop, produktAnzahl, bewertungSchnitt, bewertungAnzahl) {
  const el = document.getElementById('shop-infobar')

  const logo = shop.logo_url
    ? `<img class="shop-infobar__logo" src="${esc(shop.logo_url)}" alt="${esc(shop.name)}">`
    : `<div class="shop-infobar__logo shop-infobar__logo--placeholder">${esc((shop.name || '?').slice(0, 1).toUpperCase())}</div>`

  const ort = shop.adresse
    ? `<span class="shop-infobar__ort"><svg viewBox="0 0 24 24" width="14" height="14" style="margin-right:4px;vertical-align:-2px;flex-shrink:0;color:#0D0D0D" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/></svg>${esc(shop.adresse)}</span>`
    : ''

  const emailZeile = shop.email
    ? `<span class="shop-infobar__ort"><svg viewBox="0 0 24 24" width="14" height="14" style="margin-right:4px;vertical-align:-2px;flex-shrink:0;color:#0D0D0D" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg><a href="mailto:${esc(shop.email)}" style="color:inherit;text-decoration:underline">${esc(shop.email)}</a></span>`
    : ''

  const ratingStr = bewertungAnzahl > 0
    ? `<span class="shop-infobar__stat">
         <span class="shop-infobar__star">★</span>
         ${bewertungSchnitt.toFixed(1)} <span class="shop-infobar__stat-sub">(${bewertungAnzahl})</span>
       </span>`
    : `<span class="shop-infobar__stat shop-infobar__stat--muted"><span class="shop-infobar__star">★</span>&nbsp;Noch keine Bewertungen (0)</span>`

  const artikelStr = `<span class="shop-infobar__stat">${produktAnzahl} Artikel</span>`

  const beigetreten = shop.erstellt_am
    ? `<span class="shop-infobar__stat shop-infobar__stat--muted">${formatDatum(shop.erstellt_am, { month: '2-digit', year: 'numeric' }).replace(/\./g, '/')} beigetreten</span>`
    : ''

  const kontaktHref = shop.email
    ? `mailto:${esc(shop.email)}`
    : `mailto:support@shoppeninbraunschweig.de?subject=${encodeURIComponent('Nachricht an ' + shop.name)}`

  const msgBtn = shop.messaging_enabled
    ? `<button class="btn btn--primary shop-infobar__msg" id="chat-open-btn" type="button">
        Nachricht
        <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/></svg>
      </button>`
    : `<a class="btn btn--primary shop-infobar__msg" href="${kontaktHref}">
        Nachricht
        <svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/></svg>
      </a>`

  el.innerHTML = `
    <div class="shop-infobar__left">
      ${logo}
      <div class="shop-infobar__text">
        <h1 class="shop-infobar__name">${esc(shop.name)}</h1>
        ${ort}
        ${emailZeile}
        <div class="shop-infobar__stats">
          ${ratingStr}
          <span class="shop-infobar__dot" aria-hidden="true">·</span>
          ${artikelStr}
          <span class="shop-infobar__dot" aria-hidden="true">·</span>
          ${beigetreten}
        </div>
      </div>
    </div>
    <div class="shop-infobar__actions">
      ${msgBtn}
    </div>`
}

// ─────────────────────────────────────────
// CHAT WIDGET
// Bubble erscheint erst nach erster Nachricht.
// Kein Name, kein Email — vollständig anonym.
// Session speichert Shop-Info für globalen Widget auf anderen Seiten.
// ─────────────────────────────────────────
function initChatWidget (shop) {
  if (!shop.messaging_enabled) return

  const widget   = document.getElementById('chat-widget')   // bubble
  const trigger  = document.getElementById('chat-trigger')
  const panel    = document.getElementById('chat-panel')    // panel separat
  const closeBtn = document.getElementById('chat-panel-close')
  const messages = document.getElementById('chat-messages')
  const input    = document.getElementById('chat-input')
  const sendBtn  = document.getElementById('chat-send')
  const badge    = document.getElementById('chat-trigger-badge')
  const iconOpen  = trigger?.querySelector('.chat-trigger__icon--open')
  const iconClose = trigger?.querySelector('.chat-trigger__icon--close')

  if (!widget || !panel) return

  // Panel: hidden-Attribut entfernen, dann per inline style steuern
  panel.removeAttribute('hidden')
  panel.style.display = 'none'
  widget.hidden = true

  // Header
  document.getElementById('chat-panel-name').textContent = shop.name
  const logoEl = document.getElementById('chat-panel-logo')
  if (shop.logo_url) { logoEl.src = shop.logo_url; logoEl.hidden = false }

  const SESSION_KEY = `sib_chat_${shop.id}`
  let session = null
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY)) } catch {}

  let pollTimer = null
  let isOpen = false
  let lastHaendlerCount = 0

  // Wenn Kunde schon gechattet hat: Bubble sofort zeigen
  if (session?.chat_id) {
    widget.hidden = false
  }

  // ── Panel öffnen/schließen ──
  function openPanel () {
    isOpen = true
    panel.style.display = 'flex'
    if (iconOpen)  iconOpen.style.display  = 'none'
    if (iconClose) iconClose.style.display = 'block'
    // Badge sofort wegräumen
    badge.hidden = true
    badge.textContent = ''
    if (session?.chat_id) { loadMessages(); startPolling() }
    else messages.innerHTML = '<p class="chat-empty">Schreib uns!</p>'
    setTimeout(() => input.focus(), 80)
  }

  function closePanel () {
    isOpen = false
    panel.style.display = 'none'
    if (iconOpen)  iconOpen.style.display  = 'block'
    if (iconClose) iconClose.style.display = 'none'
    stopPolling()
  }

  trigger.addEventListener('click', () => isOpen ? closePanel() : openPanel())
  closeBtn.addEventListener('click', closePanel)

  // Nachricht-Button in Infobar
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#chat-open-btn')
    if (btn) { e.preventDefault(); openPanel() }
  })

  // ── Nachrichten ──
  function renderMessages (msgs) {
    if (!msgs.length) { messages.innerHTML = '<p class="chat-empty">Noch keine Nachrichten.</p>'; return }
    let lastDay = ''
    messages.innerHTML = msgs.map(m => {
      const day = new Date(m.erstellt_am).toDateString()
      const sep = day !== lastDay ? `<div class="chat-date-sep">${formatDatum(m.erstellt_am)}</div>` : ''
      lastDay = day
      return `${sep}<div class="chat-msg ${m.von_haendler ? 'chat-msg--in' : 'chat-msg--out'}">
        <div class="chat-msg__bubble">${esc(m.text)}</div>
        <span class="chat-msg__time">${formatMsgTime(m.erstellt_am)}</span>
      </div>`
    }).join('')
    messages.scrollTop = messages.scrollHeight
  }

  async function loadMessages () {
    if (!session?.chat_id) return
    try {
      const { data } = await supabase
        .from('chat_nachrichten').select('*')
        .eq('chat_id', session.chat_id).order('erstellt_am', { ascending: true })
      const msgs = data || []
      renderMessages(msgs)
      const hc = msgs.filter(m => m.von_haendler).length
      if (!isOpen && hc > lastHaendlerCount) { badge.hidden = false; badge.textContent = hc - lastHaendlerCount }
      lastHaendlerCount = hc
    } catch (e) { console.error('Chat laden:', e) }
  }

  function startPolling () { stopPolling(); pollTimer = setInterval(loadMessages, 10000) }
  function stopPolling  () { if (pollTimer) { clearInterval(pollTimer); pollTimer = null } }

  // ── Senden (vollständig anonym) ──
  async function sendMessage () {
    const text = input.value.trim()
    if (!text) return
    sendBtn.disabled = true

    try {
      if (!session?.chat_id) {
        // Erste Nachricht: Chat anonym anlegen
        // ID selbst generieren → kein SELECT nach INSERT nötig (anon hat kein SELECT)
        const chatId = crypto.randomUUID()
        const { error: e1 } = await supabase
          .from('chats')
          .insert({ id: chatId, shop_id: shop.id, sender_name: 'Anonym', sender_email: '' })
        if (e1) throw e1

        const { error: e2 } = await supabase
          .from('chat_nachrichten')
          .insert({ chat_id: chatId, text, von_haendler: false })
        if (e2) throw e2

        // Session mit Shop-Info speichern (für globalen Widget auf anderen Seiten)
        session = {
          chat_id: chatId,
          shop_name: shop.name,
          shop_logo: shop.logo_url || null,
          shop_slug: shop.slug || ''
        }
        localStorage.setItem(SESSION_KEY, JSON.stringify(session))

        input.value = ''
        input.style.height = 'auto'
        widget.hidden = false   // Bubble erscheint erstmals
        await loadMessages()
        startPolling()
        return
      }

      // Folge-Nachricht
      const { error } = await supabase.from('chat_nachrichten')
        .insert({ chat_id: session.chat_id, text, von_haendler: false })
      if (error) {
        // FK-Fehler: Chat existiert nicht mehr → Session löschen und neu starten
        if (error.code === '23503' || error.message?.includes('foreign key')) {
          localStorage.removeItem(SESSION_KEY)
          session = null
          widget.hidden = true
          messages.innerHTML = '<p class="chat-empty">Schreib uns!</p>'
          sendBtn.disabled = false
          return
        }
        throw error
      }
      await supabase.from('chats')
        .update({ aktualisiert_am: new Date().toISOString() }).eq('id', session.chat_id)
      input.value = ''
      input.style.height = 'auto'
      await loadMessages()

    } catch (err) {
      console.error('Senden:', err)
      // Fehler sichtbar im Widget anzeigen
      const errDiv = document.getElementById('chat-send-error')
      if (errDiv) {
        errDiv.textContent = err?.message || JSON.stringify(err) || 'Unbekannter Fehler'
        errDiv.hidden = false
        setTimeout(() => { errDiv.hidden = true }, 8000)
      }
    }
    finally { sendBtn.disabled = false; input.focus() }
  }

  sendBtn.addEventListener('click', sendMessage)
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  })
  input.addEventListener('input', () => {
    input.style.height = 'auto'
    input.style.height = Math.min(input.scrollHeight, 120) + 'px'
  })
}

// ─────────────────────────────────────────
// 3. WILLKOMMEN / ABOUT
// ─────────────────────────────────────────
function renderAbout (shop) {
  const section = document.getElementById('shop-about')
  const inner   = document.getElementById('shop-about-inner')
  section.hidden = false

  const bildUrl = shop.bild_url || (
    Array.isArray(shop.galerie) && shop.galerie.length > 1 ? shop.galerie[1] : null
  )
  const bildHtml = bildUrl
    ? `<div class="shop-about__bild-wrap">
         <img class="shop-about__bild" src="${esc(bildUrl)}" alt="${esc(shop.name)}" loading="lazy">
       </div>`
    : ''

  const beschreibung = shop.beschreibung
    ? shop.beschreibung.split('\n').filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('')
    : ''

  inner.innerHTML = `
    <div class="shop-about__inner-card">
      <h2 class="shop-about__headline">Willkommen bei ${esc(shop.name)} ✨</h2>
      ${bildHtml}
      ${beschreibung ? `<div class="shop-about__text">${beschreibung}</div>` : ''}
    </div>`
}

// ─────────────────────────────────────────
// 4. ARTIKEL
// ─────────────────────────────────────────
const PAGE_SIZE = 10
let alleProdukte = []
let gezeigte = 0
let shopBewertungRating = null  // wird nach ladeBewertungen gesetzt

function renderProduktBatch (shop) {
  const container = document.getElementById('shop-produkte')
  const batch = alleProdukte.slice(0, gezeigte + PAGE_SIZE)
  gezeigte = batch.length

  container.innerHTML = batch.map((p) => renderProductCard(p, shop.name, shopBewertungRating)).join('')

  document.getElementById('shop-mehr-wrap').hidden = gezeigte >= alleProdukte.length
}

async function ladeProdukte (shop) {
  const section   = document.getElementById('shop-produkte-section')
  const container = document.getElementById('shop-produkte')
  const titel     = document.getElementById('shop-produkte-titel')
  section.hidden = false
  container.innerHTML = '<div class="loading">Artikel werden geladen…</div>'

  try {
    const { data, error } = await supabase
      .from('produkte').select('*')
      .eq('shop_id', shop.id).eq('verfuegbar', true).eq('freigegeben', true)
      .order('erstellt_am', { ascending: false })

    if (error) throw error
    alleProdukte = data || []
    gezeigte = 0
    titel.textContent = `Artikel (${alleProdukte.length})`

    if (alleProdukte.length === 0) {
      container.innerHTML = '<p class="shop-empty">Dieses Geschäft hat aktuell keine Artikel.</p>'
      return 0
    }
    renderProduktBatch(shop)
    document.getElementById('shop-mehr-btn').addEventListener('click', () => renderProduktBatch(shop))
    return alleProdukte.length
  } catch (err) {
    console.error(err)
    container.innerHTML = '<p class="shop-empty">Artikel konnten nicht geladen werden.</p>'
    return 0
  }
}

// ─────────────────────────────────────────
// 5. BEWERTUNGEN
// ─────────────────────────────────────────
let alleBewertungen = []
let gezeigteB = 0
const BW_PAGE = 6
let gewaehlteSterne = 0

function renderBewertungBatch () {
  const liste = document.getElementById('bewertungen-liste')
  const batch = alleBewertungen.slice(0, gezeigteB + BW_PAGE)
  gezeigteB = batch.length

  liste.innerHTML = batch.map((b) => `
    <article class="bw-karte">
      <div class="bw-karte__kopf">
        ${avatarHtml(b.autor_name)}
        <div>
          <span class="bw-karte__autor-datum">${esc(b.autor_name)} <span class="bw-karte__datum">am ${formatDatum(b.erstellt_am)}</span></span>
        </div>
      </div>
      <div class="bw-karte__sterne">${sterneHtml(b.sterne)}</div>
      ${b.text ? `<p class="bw-karte__text">${esc(b.text)}</p>` : ''}
    </article>`).join('')

  document.getElementById('bw-mehr-wrap').hidden = gezeigteB >= alleBewertungen.length
}

async function ladeBewertungen (shop) {
  const section = document.getElementById('bewertungen-section')
  section.hidden = false

  try {
    const { data, error } = await supabase
      .from('bewertungen').select('*').eq('shop_id', shop.id)
      .order('erstellt_am', { ascending: false })
    if (error) throw error
    alleBewertungen = data || []

    const schnitt = alleBewertungen.length > 0
      ? alleBewertungen.reduce((s, b) => s + (b.sterne || 0), 0) / alleBewertungen.length : 0

    const summary = document.getElementById('shop-rating-summary')
    if (alleBewertungen.length > 0) {
      summary.innerHTML = `
        <div class="shop-rating-summary__row">
          <span class="shop-rating-star">★</span>
          <span class="shop-rating-zahl">${schnitt.toFixed(1)}/5</span>
          <span class="shop-rating-anzahl">(${alleBewertungen.length} Bewertung${alleBewertungen.length !== 1 ? 'en' : ''})</span>
        </div>`
    } else {
      summary.innerHTML = '<div class="shop-rating-summary__row"><span class="shop-rating-star">★</span><span class="shop-rating-leer">Noch keine Bewertungen (0)</span></div>'
    }

    if (alleBewertungen.length === 0) {
      document.getElementById('bewertungen-liste').innerHTML =
        '<p class="shop-empty shop-empty--light">Sei die erste Person, die dieses Geschäft bewertet.</p>'
    } else {
      gezeigteB = 0
      renderBewertungBatch()
      document.getElementById('bw-mehr-btn').addEventListener('click', renderBewertungBatch)
    }
    return { schnitt, anzahl: alleBewertungen.length }
  } catch (err) {
    console.error(err)
    document.getElementById('shop-rating-summary').innerHTML = ''
    return { schnitt: 0, anzahl: 0 }
  }
}

function initBewertungForm (shop) {
  const toggle    = document.getElementById('toggle-bewertung-form')
  const form      = document.getElementById('bewertung-form')
  const feedback  = document.getElementById('bewertung-feedback')
  const sternBtns = Array.from(document.querySelectorAll('#sterne-input .stern'))

  function zeichneSterne (wert) {
    sternBtns.forEach(b => b.classList.toggle('is-on', Number(b.dataset.wert) <= wert))
  }

  toggle.addEventListener('click', () => {
    form.hidden = !form.hidden
    if (!form.hidden) form.querySelector('[name="name"]').focus()
  })

  sternBtns.forEach(btn => btn.addEventListener('click', () => {
    gewaehlteSterne = Number(btn.dataset.wert)
    zeichneSterne(gewaehlteSterne)
  }))

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    feedback.innerHTML = ''
    const nameVal  = form.querySelector('[name="name"]').value.trim()
    const emailVal = form.querySelector('[name="email"]').value.trim()
    const textVal  = form.querySelector('[name="text"]').value.trim()

    if (!nameVal || !emailVal) { feedback.innerHTML = '<div class="error-msg">Bitte Name und E-Mail ausfüllen.</div>'; return }
    if (gewaehlteSterne < 1) { feedback.innerHTML = '<div class="error-msg">Bitte wähle eine Sterne-Bewertung.</div>'; return }

    const submitBtn = form.querySelector('button[type="submit"]')
    submitBtn.disabled = true; submitBtn.textContent = 'Wird gesendet…'

    try {
      const { error } = await supabase.from('bewertungen').insert({
        shop_id: shop.id, autor_name: nameVal, autor_email: emailVal,
        sterne: gewaehlteSterne, text: textVal || null
      })
      if (error) throw error
      form.reset(); form.hidden = true
      gewaehlteSterne = 0; zeichneSterne(0)
      alleBewertungen = []; gezeigteB = 0
      ladeBewertungen(shop)
    } catch (err) {
      console.error(err)
      feedback.innerHTML = '<div class="error-msg">Konnte nicht gespeichert werden.</div>'
      submitBtn.disabled = false; submitBtn.textContent = 'Absenden'
    }
  })
}

// ─────────────────────────────────────────
// 6. INFO-TABELLE
// ─────────────────────────────────────────
function renderInfoTabelle (shop) {
  const felder = [
    { key: 'agb_datum',       label: 'AGB',                  formatter: v => `Zuletzt aktualisiert am ${formatDatum(v)}` },
    { key: 'versand',         label: 'Versand',               formatter: v => esc(v) },
    { key: 'rueckgaben',      label: 'Rückgaben & Umtausch', formatter: v => esc(v) },
    { key: 'stornierungen',   label: 'Stornierungen',         formatter: v => esc(v) },
    { key: 'oeffnungszeiten', label: 'Öffnungszeiten',       formatter: v => esc(v) },
  ]
  const vorhandene = felder.filter(f => shop[f.key])
  if (vorhandene.length === 0) return

  document.getElementById('shop-info-tabelle').hidden = false
  document.getElementById('shop-info-tabelle-body').innerHTML = vorhandene.map(f => `
    <div class="shop-info-row">
      <span class="shop-info-row__label">${f.label}</span>
      <span class="shop-info-row__value">${f.formatter(shop[f.key])}</span>
    </div>`).join('')
}

// ─────────────────────────────────────────
// INIT
// ─────────────────────────────────────────
async function init () {
  initMobileMenu()
  initHeaderSearch()

  const slug = getSlug()
  if (!slug) { notFound('Kein Geschäft angegeben.'); return }

  try {
    const { data: shop, error } = await supabase
      .from('shops').select('*').eq('slug', slug).maybeSingle()

    if (error) throw error
    if (!shop) { notFound(); return }

    showLoading(false)
    if (shop.name) document.title = `${shop.name} — Shoppen in Braunschweig`

    renderGalerie(shop)

    const [produktAnzahl, { schnitt, anzahl }] = await Promise.all([
      ladeProdukte(shop),
      ladeBewertungen(shop)
    ])

    // Bewertungsdaten für Produktkarten setzen + Karten neu rendern
    if (anzahl > 0) {
      shopBewertungRating = { summe: schnitt * anzahl, anzahl }
      renderProduktBatch(shop)
    }

    renderInfoBar(shop, produktAnzahl || 0, schnitt, anzahl)
    renderAbout(shop)
    renderInfoTabelle(shop)
    initBewertungForm(shop)
    initChatWidget(shop)

  } catch (err) {
    console.error('Geschäft konnte nicht geladen werden:', err)
    notFound('Das Geschäft konnte gerade nicht geladen werden.')
  }
}

init()
