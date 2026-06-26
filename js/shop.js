// js/shop.js — SIB Shopseite v9
// Sektionen: Galerie → Info-Bar → Willkommen → Artikel → Bewertungen → Info-Tabelle
// Chat-Widget (floating) wenn messaging_enabled = true

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'

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
  const t = new Date(p.freigegeben_am || p.erstellt_am || 0).getTime()
  if (!t) return ''
  return (Date.now() - t) < 7 * 24 * 60 * 60 * 1000
    ? '<span class="product-card__badge">NEU</span>'
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
    ? `<span class="shop-infobar__ort">${esc(shop.adresse)}</span>`
    : ''

  const emailZeile = shop.email
    ? `<span class="shop-infobar__ort"><a href="mailto:${esc(shop.email)}" style="color:inherit">${esc(shop.email)}</a></span>`
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
// CHAT WIDGET — WhatsApp-Style
// Panel startet GESCHLOSSEN. Öffnet nur per Trigger oder Nachricht-Button.
// Name/Email nur beim ersten Senden abgefragt (kompakt inline).
// ─────────────────────────────────────────
function initChatWidget (shop) {
  if (!shop.messaging_enabled) return

  const widget   = document.getElementById('chat-widget')
  const trigger  = document.getElementById('chat-trigger')
  const panel    = document.getElementById('chat-panel')
  const closeBtn = document.getElementById('chat-panel-close')
  const messages = document.getElementById('chat-messages')
  const identity = document.getElementById('chat-identity')
  const nameIn   = document.getElementById('chat-id-name')
  const emailIn  = document.getElementById('chat-id-email')
  const input    = document.getElementById('chat-input')
  const sendBtn  = document.getElementById('chat-send')
  const badge    = document.getElementById('chat-trigger-badge')
  const iconOpen  = trigger.querySelector('.chat-trigger__icon--open')
  const iconClose = trigger.querySelector('.chat-trigger__icon--close')

  if (!widget) return

  // Widget sichtbar (nur Trigger-Button), Panel GESCHLOSSEN
  widget.hidden = false
  panel.hidden  = true

  // Header
  document.getElementById('chat-panel-name').textContent = shop.name
  const logoEl = document.getElementById('chat-panel-logo')
  if (shop.logo_url) { logoEl.src = shop.logo_url; logoEl.hidden = false }

  // Session aus localStorage
  const SESSION_KEY = `sib_chat_${shop.id}`
  let session = null
  try { session = JSON.parse(localStorage.getItem(SESSION_KEY)) } catch {}

  let pollTimer = null
  let lastHaendlerCount = 0
  let isOpen = false

  // ── Panel öffnen / schließen ──
  function openPanel () {
    isOpen = true
    panel.hidden = false
    trigger.setAttribute('aria-expanded', 'true')
    if (iconOpen)  iconOpen.style.display  = 'none'
    if (iconClose) iconClose.style.display = 'block'
    badge.hidden = true
    badge.textContent = ''

    if (session?.chat_id) {
      identity.hidden = true
      loadMessages()
      startPolling()
    } else {
      identity.hidden = false
      messages.innerHTML = '<p class="chat-empty">Schreib uns einfach!</p>'
    }
    setTimeout(() => input.focus(), 100)
  }

  function closePanel () {
    isOpen = false
    panel.hidden = true
    trigger.setAttribute('aria-expanded', 'false')
    if (iconOpen)  iconOpen.style.display  = 'block'
    if (iconClose) iconClose.style.display = 'none'
    stopPolling()
  }

  trigger.addEventListener('click', () => isOpen ? closePanel() : openPanel())
  closeBtn.addEventListener('click', closePanel)
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('#chat-open-btn')
    if (btn) { e.preventDefault(); if (!isOpen) openPanel() }
  })

  // ── Nachrichten rendern ──
  function renderMessages (msgs) {
    if (msgs.length === 0) {
      messages.innerHTML = '<p class="chat-empty">Noch keine Nachrichten.</p>'
      return
    }
    let lastDay = ''
    messages.innerHTML = msgs.map(m => {
      const day = new Date(m.erstellt_am).toDateString()
      const sep = day !== lastDay
        ? `<div class="chat-date-sep">${formatDatum(m.erstellt_am)}</div>` : ''
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
        .eq('chat_id', session.chat_id)
        .order('erstellt_am', { ascending: true })
      const msgs = data || []
      renderMessages(msgs)
      const haendlerCount = msgs.filter(m => m.von_haendler).length
      if (!isOpen && haendlerCount > lastHaendlerCount) {
        badge.hidden = false
        badge.textContent = haendlerCount - lastHaendlerCount
      }
      lastHaendlerCount = haendlerCount
    } catch (err) { console.error('Chat laden:', err) }
  }

  function startPolling () { stopPolling(); pollTimer = setInterval(loadMessages, 10000) }
  function stopPolling  () { if (pollTimer) { clearInterval(pollTimer); pollTimer = null } }

  // ── Nachricht senden ──
  async function sendMessage () {
    const text = input.value.trim()
    if (!text) return

    if (!session?.chat_id) {
      const name  = nameIn?.value.trim()  || ''
      const email = emailIn?.value.trim() || ''
      if (!name)  { nameIn?.focus();  return }
      if (!email) { emailIn?.focus(); return }

      sendBtn.disabled = true
      try {
        const { data: chat, error: e1 } = await supabase
          .from('chats')
          .insert({ shop_id: shop.id, sender_name: name, sender_email: email })
          .select('id').single()
        if (e1) throw e1
        const { error: e2 } = await supabase
          .from('chat_nachrichten')
          .insert({ chat_id: chat.id, text, von_haendler: false })
        if (e2) throw e2
        session = { chat_id: chat.id, name, email }
        localStorage.setItem(SESSION_KEY, JSON.stringify(session))
        input.value = ''
        identity.hidden = true
        await loadMessages()
        startPolling()
      } catch (err) {
        console.error('Chat starten:', err)
      } finally { sendBtn.disabled = false }
      return
    }

    input.value = ''
    input.style.height = 'auto'
    sendBtn.disabled = true
    try {
      await supabase.from('chat_nachrichten')
        .insert({ chat_id: session.chat_id, text, von_haendler: false })
      await supabase.from('chats')
        .update({ aktualisiert_am: new Date().toISOString() })
        .eq('id', session.chat_id)
      await loadMessages()
    } catch (err) { console.error('Senden:', err); input.value = text }
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
  if (!shop.beschreibung && !shop.bild_url && !shop.banner_url) return
  const section = document.getElementById('shop-about')
  const inner   = document.getElementById('shop-about-inner')
  section.hidden = false

  const willkommenBild = shop.bild_url || (
    Array.isArray(shop.galerie) && shop.galerie.length > 1 ? shop.galerie[1] : null
  )
  const bildHtml = willkommenBild
    ? `<div class="shop-about__bild-wrap"><img class="shop-about__bild" src="${esc(willkommenBild)}" alt="${esc(shop.name)}" loading="lazy"></div>`
    : ''
  const beschreibung = shop.beschreibung
    ? shop.beschreibung.split('\n').filter(Boolean).map(p => `<p>${esc(p)}</p>`).join('')
    : ''

  inner.innerHTML = `
    <h2 class="shop-about__headline">Willkommen bei ${esc(shop.name)}</h2>
    ${bildHtml}
    ${beschreibung ? `<div class="shop-about__text">${beschreibung}</div>` : ''}`
}

// ─────────────────────────────────────────
// 4. ARTIKEL
// ─────────────────────────────────────────
const PAGE_SIZE = 10
let alleProdukte = []
let gezeigte = 0

function renderProduktBatch (shop) {
  const container = document.getElementById('shop-produkte')
  const batch = alleProdukte.slice(0, gezeigte + PAGE_SIZE)
  gezeigte = batch.length

  container.innerHTML = batch.map((p) => {
    const id = encodeURIComponent(p.id)
    const bilder = Array.isArray(p.bilder) ? p.bilder.filter(Boolean) : []
    const bild = bilder[0]
      ? `<img class="product-card__image" src="${esc(bilder[0])}" alt="${esc(p.titel)}" loading="lazy">`
      : '<div class="product-card__image"></div>'
    const preis = (p.preis !== null && p.preis !== undefined) ? euro.format(p.preis) : ''
    return `
      <a class="product-card" href="produkt.html?id=${id}">
        ${neuBadge(p)}${bild}
        <span class="product-card__shop">${esc(shop.name)}</span>
        <span class="product-card__title">${esc(p.titel)}</span>
        <span class="product-card__price">${esc(preis)}</span>
      </a>`
  }).join('')

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
    <article class="bw-karte glass-card">
      <div class="bw-karte__kopf">
        ${avatarHtml(b.autor_name)}
        <div>
          <span class="bw-karte__autor">${esc(b.autor_name)}</span>
          <span class="bw-karte__datum">am ${formatDatum(b.erstellt_am)}</span>
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
        <span class="shop-rating-score">${sterneHtml(schnitt)}</span>
        <span class="shop-rating-zahl">${schnitt.toFixed(1)}/5</span>
        <span class="shop-rating-anzahl">(${alleBewertungen.length} Bewertung${alleBewertungen.length !== 1 ? 'en' : ''})</span>`
    } else {
      summary.innerHTML = '<span class="shop-rating-leer">Noch keine Bewertungen</span>'
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
