// js/produkt.js — SIB Produktseite
// Lädt ein einzelnes Produkt (+ Shop) live aus Supabase, zeigt Galerie,
// Reservierungsformular und weitere Artikel desselben Shops.

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

// Ausgewählte Größe (Variante) für die Reservierung
let selectedGroesse = null
let hatVarianten = false

// Feste Größen-Reihenfolge für das Dropdown
const GROESSEN_ORDER = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', 'Einheitsgröße']

function sortiereVarianten (varianten) {
  const rang = (g) => {
    const i = GROESSEN_ORDER.indexOf(g)
    return i === -1 ? GROESSEN_ORDER.length : i
  }
  return [...varianten].sort((a, b) => rang(a.groesse) - rang(b.groesse))
}

function esc (value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// "Neu"-Badge: nur für verfügbare, freigegebene Produkte < 7 Tage alt
function neuBadge (p) {
  if (p.verfuegbar === false || p.freigegeben !== true) return ''
  const t = p.erstellt_am ? new Date(p.erstellt_am).getTime() : NaN
  if (isNaN(t)) return ''
  return (Date.now() - t) < 7 * 24 * 60 * 60 * 1000
    ? '<span class="product-card__badge">Neu</span>'
    : ''
}

// ── Social-Share ──
const SHARE_ICONS = {
  whatsapp: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M19.11 17.2c-.28-.14-1.65-.81-1.9-.9-.26-.1-.45-.14-.63.14-.19.28-.72.9-.88 1.08-.16.19-.32.21-.6.07-.28-.14-1.18-.43-2.25-1.39-.83-.74-1.39-1.65-1.55-1.93-.16-.28-.02-.43.12-.57.13-.13.28-.32.42-.48.14-.16.19-.28.28-.46.09-.19.05-.35-.02-.49-.07-.14-.63-1.51-.86-2.07-.23-.55-.46-.48-.63-.49h-.54c-.19 0-.49.07-.75.35-.26.28-.98.96-.98 2.33 0 1.37 1 2.7 1.14 2.89.14.19 1.97 3.01 4.78 4.22.67.29 1.19.46 1.6.59.67.21 1.28.18 1.76.11.54-.08 1.65-.67 1.88-1.32.23-.65.23-1.21.16-1.32-.07-.11-.26-.18-.54-.32z M12 2a10 10 0 00-8.6 15.06L2 22l5.06-1.33A10 10 0 1012 2zm0 18.2a8.18 8.18 0 01-4.17-1.14l-.3-.18-3 .79.8-2.92-.2-.31A8.2 8.2 0 1112 20.2z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.12 5.32H17V2.14A26.11 26.11 0 0014.26 2c-2.72 0-4.58 1.66-4.58 4.7v2.6H6.6v3.56h3.08V22h3.68v-9.14h3.06l.46-3.56h-3.52V7.05c0-1.03.28-1.73 1.76-1.73z"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.9 12a3.1 3.1 0 013.1-3.1h4V7H7a5 5 0 000 10h4v-1.9H7A3.1 3.1 0 013.9 12zM8 13h8v-2H8v2zm9-6h-4v1.9h4A3.1 3.1 0 0117 15.1h-4V17h4a5 5 0 000-10z"/></svg>'
}

function shareRow (waText, url) {
  const wa = `https://wa.me/?text=${encodeURIComponent(waText)}`
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`
  return `
    <div class="share-row">
      <span class="share-row__label">Teilen:</span>
      <a class="share-btn" href="${esc(wa)}" target="_blank" rel="noopener" aria-label="Auf WhatsApp teilen" title="WhatsApp">${SHARE_ICONS.whatsapp}</a>
      <a class="share-btn" href="${esc(fb)}" target="_blank" rel="noopener" aria-label="Auf Facebook teilen" title="Facebook">${SHARE_ICONS.facebook}</a>
      <button class="share-btn share-btn--copy" type="button" data-copy-url="${esc(url)}" aria-label="Link kopieren" title="Link kopieren">${SHARE_ICONS.link}</button>
    </div>`
}

function initCopyButtons (root) {
  (root || document).querySelectorAll('[data-copy-url]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const url = btn.dataset.copyUrl
      try {
        await navigator.clipboard.writeText(url)
      } catch (e) {
        const ta = document.createElement('textarea')
        ta.value = url
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        try { document.execCommand('copy') } catch (e2) { /* ignore */ }
        document.body.removeChild(ta)
      }
      const orig = btn.innerHTML
      btn.classList.add('is-copied')
      btn.innerHTML = '<span class="share-btn__copied">Kopiert!</span>'
      setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('is-copied') }, 1500)
    })
  })
}

// ── Mobile-Menü (wie auf der Startseite) ──
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

// ── Produkt-ID aus URL ──
function getProduktId () {
  return new URLSearchParams(window.location.search).get('id')
}

function bilderOf (produkt) {
  return Array.isArray(produkt.bilder) ? produkt.bilder.filter(Boolean) : []
}

function notFound (text) {
  const el = document.getElementById('produkt-detail')
  el.innerHTML = `
    <div class="product-notfound">
      <h1>Produkt nicht gefunden</h1>
      <p>${esc(text || 'Dieses Produkt existiert nicht oder ist nicht mehr verfügbar.')}</p>
      <p style="margin-top:1.5rem"><a class="btn btn--primary" href="kategorie.html">Alle Produkte ansehen</a></p>
    </div>`
}

// ── Detail rendern ──
function renderDetail (produkt, varianten = []) {
  const el = document.getElementById('produkt-detail')
  const bilder = bilderOf(produkt)
  const shop = produkt.shops || null
  const shopName = shop?.name || 'Lokaler Händler'
  const preis = (produkt.preis !== null && produkt.preis !== undefined) ? euro.format(produkt.preis) : ''
  const verfuegbar = produkt.verfuegbar !== false

  // Status für Reservierung zurücksetzen
  selectedGroesse = null
  hatVarianten = varianten.length > 0

  const groessenBlock = hatVarianten
    ? `
      <div class="product-groessen">
        <label class="product-groessen__label" for="groesse-select">Größe wählen</label>
        <select class="form-select product-groessen__select" id="groesse-select">
          <option value="">Bitte wählen…</option>
          ${sortiereVarianten(varianten).map((v) => {
            const ausverkauft = !(v.stueckzahl > 0)
            return `<option value="${esc(v.groesse)}"${ausverkauft ? ' disabled' : ''}>${esc(v.groesse)}${ausverkauft ? ' (Nicht verfügbar)' : ''}</option>`
          }).join('')}
        </select>
      </div>`
    : ''

  const mainImg = bilder[0]
    ? `<img class="product-gallery__main" id="gallery-main" src="${esc(bilder[0])}" alt="${esc(produkt.titel)}">`
    : '<div class="product-gallery__main" id="gallery-main"></div>'

  const thumbs = bilder.length > 1
    ? `<div class="product-gallery__thumbs">${bilder.map((b, i) =>
        `<img class="product-gallery__thumb${i === 0 ? ' is-active' : ''}" src="${esc(b)}" alt="${esc(produkt.titel)} — Bild ${i + 1}" data-src="${esc(b)}" loading="lazy">`
      ).join('')}</div>`
    : ''

  const shopLink = shop?.slug
    ? `<a class="product-info__shop" href="shop.html?slug=${encodeURIComponent(shop.slug)}">${esc(shopName)}</a>`
    : `<span class="product-info__shop" style="text-decoration:none">${esc(shopName)}</span>`

  const beschreibung = produkt.beschreibung
    ? `<p class="product-info__desc">${esc(produkt.beschreibung)}</p>`
    : ''

  const formularOderStatus = verfuegbar
    ? `
      ${groessenBlock}
      <p class="reservierung__title">Artikel reservieren</p>
      <p class="reservierung__hint">Reservieren, im Geschäft abholen — kein Account nötig. Die Reservierung gilt 7&nbsp;Tage.</p>
      <form class="reservierung-form" id="reservierung-form" novalidate>
        <div class="form-group">
          <label class="form-label" for="kunde-name">Name</label>
          <input class="form-input" type="text" id="kunde-name" name="name" required autocomplete="name">
        </div>
        <div class="form-group">
          <label class="form-label" for="kunde-email">E-Mail</label>
          <input class="form-input" type="email" id="kunde-email" name="email" required autocomplete="email">
        </div>
        <button class="btn btn--primary btn--full" type="submit">Reservieren</button>
        <div id="reservierung-feedback" aria-live="polite"></div>
      </form>`
    : '<p class="badge badge--outline product-info__soldout">Aktuell nicht verfügbar</p>'

  el.innerHTML = `
    <div class="product-detail">
      <div class="product-gallery">
        ${mainImg}
        ${thumbs}
      </div>
      <div class="product-info">
        ${shopLink}
        <h1 class="product-info__title">${esc(produkt.titel)}</h1>
        <p class="product-info__price">${esc(preis)}</p>
        ${shareRow(`Schau mal: ${produkt.titel} bei ${shopName} auf Shoppen in Braunschweig – ${window.location.href}`, window.location.href)}
        ${beschreibung}
        <hr>
        ${formularOderStatus}
      </div>
    </div>`

  if (produkt.titel) document.title = `${produkt.titel} — Shoppen in Braunschweig`

  initGallery()
  initCopyButtons(el)
  if (verfuegbar) {
    initGroessen()
    initReservierung(produkt)
  }
}

// Größen-Dropdown: Auswahl übernehmen
function initGroessen () {
  const select = document.getElementById('groesse-select')
  if (!select) return
  select.addEventListener('change', () => {
    selectedGroesse = select.value || null
  })
}

// Thumbnail-Klick tauscht das Hauptbild
function initGallery () {
  const main = document.getElementById('gallery-main')
  const thumbs = document.querySelectorAll('.product-gallery__thumb')
  thumbs.forEach((thumb) => {
    thumb.addEventListener('click', () => {
      const src = thumb.getAttribute('data-src')
      if (main.tagName === 'IMG') main.src = src
      thumbs.forEach((t) => t.classList.remove('is-active'))
      thumb.classList.add('is-active')
    })
  })
}

// Reservierungsbestätigung per E-Mail (Edge Function) — stört den Ablauf nicht
async function sendeBestaetigungsMail (payload) {
  try {
    await supabase.functions.invoke('send-email', {
      body: { type: 'reservierung', ...payload }
    })
  } catch (err) {
    console.error('Bestätigungs-E-Mail konnte nicht gesendet werden:', err)
  }
}

// ── Reservierung speichern ──
function initReservierung (produkt) {
  const form = document.getElementById('reservierung-form')
  const feedback = document.getElementById('reservierung-feedback')
  if (!form) return

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    feedback.innerHTML = ''

    const name = form.name.value.trim()
    const email = form.email.value.trim()

    if (!name || !email) {
      feedback.innerHTML = '<div class="error-msg">Bitte Name und E-Mail ausfüllen.</div>'
      return
    }

    if (hatVarianten && !selectedGroesse) {
      feedback.innerHTML = '<div class="error-msg">Bitte wähle eine Größe.</div>'
      return
    }

    const submitBtn = form.querySelector('button[type="submit"]')
    submitBtn.disabled = true
    submitBtn.textContent = 'Wird gesendet…'

    // Ablaufdatum = jetzt + 7 Tage
    const ablauf = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()

    try {
      const { data: neu, error } = await supabase.from('reservierungen').insert({
        produkt_id: produkt.id,
        kunde_name: name,
        kunde_email: email,
        groesse: selectedGroesse,
        status: 'offen',
        ablauf_am: ablauf
      }).select('id').single()

      if (error) throw error

      // Formular durch Erfolgsmeldung ersetzen
      const ansehen = neu?.id
        ? ` <a href="reservierung.html?id=${encodeURIComponent(neu.id)}">Reservierung ansehen →</a>`
        : ''
      form.innerHTML = `<div class="success-msg">Reservierung erfolgreich! Wir benachrichtigen dich wenn der Artikel abholbereit ist.${ansehen}</div>`

      // Bestätigungs-E-Mail an den Kunden (nicht blockierend)
      sendeBestaetigungsMail({
        kunde_name: name,
        kunde_email: email,
        produkt_titel: produkt.titel,
        shop_name: produkt.shops?.name || 'dem Geschäft',
        shop_adresse: produkt.shops?.adresse || '',
        reservierung_id: neu?.id,
        ablauf_am: ablauf
      })
    } catch (err) {
      console.error('Reservierung fehlgeschlagen:', err)
      feedback.innerHTML = '<div class="error-msg">Die Reservierung konnte nicht gespeichert werden. Bitte versuche es später erneut.</div>'
      submitBtn.disabled = false
      submitBtn.textContent = 'Reservieren'
    }
  })
}

// ── Weitere Artikel desselben Shops ──
async function ladeWeitere (produkt) {
  const section = document.getElementById('weitere-section')
  const container = document.getElementById('weitere')
  const titel = document.getElementById('weitere-titel')
  if (!produkt.shop_id) return

  try {
    const { data, error } = await supabase
      .from('produkte')
      .select('*, shops(name, slug)')
      .eq('shop_id', produkt.shop_id)
      .eq('verfuegbar', true)
      .eq('freigegeben', true)
      .neq('id', produkt.id)
      .order('erstellt_am', { ascending: false })
      .limit(4)

    if (error) throw error
    const weitere = data || []
    if (weitere.length === 0) return

    const shopName = produkt.shops?.name || 'diesem Geschäft'
    titel.textContent = `Weitere Artikel von ${shopName}`

    container.innerHTML = weitere.map((p) => {
      const id = encodeURIComponent(p.id)
      const bilder = bilderOf(p)
      const bild = bilder[0]
        ? `<img class="product-card__image" src="${esc(bilder[0])}" alt="${esc(p.titel)}" loading="lazy">`
        : '<div class="product-card__image"></div>'
      const sName = p.shops?.name || 'Lokaler Händler'
      const preis = (p.preis !== null && p.preis !== undefined) ? euro.format(p.preis) : ''
      return `
        <a class="product-card" href="produkt.html?id=${id}">
          ${neuBadge(p)}${bild}
          <span class="product-card__shop">${esc(sName)}</span>
          <span class="product-card__title">${esc(p.titel)}</span>
          <span class="product-card__price">${esc(preis)}</span>
        </a>`
    }).join('')

    section.hidden = false
  } catch (err) {
    console.error('Weitere Artikel konnten nicht geladen werden:', err)
    // Stumm scheitern — Sektion bleibt ausgeblendet
  }
}

// Array mischen (Fisher-Yates)
function mischen (arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

// ── Das könnte dir auch gefallen (gleiche Kategorie, andere Händler) ──
async function ladeAehnliche (produkt) {
  const section = document.getElementById('aehnliche-section')
  const container = document.getElementById('aehnliche')
  if (!produkt.kategorie_id) return

  try {
    let query = supabase
      .from('produkte')
      .select('*, shops(name, slug)')
      .eq('kategorie_id', produkt.kategorie_id)
      .eq('verfuegbar', true)
      .eq('freigegeben', true)
      .neq('id', produkt.id)
      .limit(24)

    if (produkt.shop_id) query = query.neq('shop_id', produkt.shop_id)

    const { data, error } = await query
    if (error) throw error
    const kandidaten = data || []
    if (kandidaten.length === 0) return

    const auswahl = mischen(kandidaten).slice(0, 4)

    container.innerHTML = auswahl.map((p) => {
      const id = encodeURIComponent(p.id)
      const bilder = bilderOf(p)
      const bild = bilder[0]
        ? `<img class="product-card__image" src="${esc(bilder[0])}" alt="${esc(p.titel)}" loading="lazy">`
        : '<div class="product-card__image"></div>'
      const sName = p.shops?.name || 'Lokaler Händler'
      const preis = (p.preis !== null && p.preis !== undefined) ? euro.format(p.preis) : ''
      return `
        <a class="product-card" href="produkt.html?id=${id}">
          ${neuBadge(p)}${bild}
          <span class="product-card__shop">${esc(sName)}</span>
          <span class="product-card__title">${esc(p.titel)}</span>
          <span class="product-card__price">${esc(preis)}</span>
        </a>`
    }).join('')

    section.hidden = false
  } catch (err) {
    console.error('Ähnliche Artikel konnten nicht geladen werden:', err)
    // Stumm scheitern — Sektion bleibt ausgeblendet
  }
}

// ── Init ──
async function init () {
  initMobileMenu()
  initHeaderSearch()

  const id = getProduktId()
  if (!id) {
    notFound('Kein Produkt angegeben.')
    return
  }

  try {
    const { data, error } = await supabase
      .from('produkte')
      .select('*, shops(name, slug, adresse)')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      notFound()
      return
    }

    // Alle Größen (Varianten) laden — auch ausverkaufte werden angezeigt
    let varianten = []
    try {
      const { data: vData, error: vErr } = await supabase
        .from('produkt_varianten')
        .select('*')
        .eq('produkt_id', data.id)
        .order('erstellt_am', { ascending: true })
      if (!vErr) varianten = vData || []
    } catch (vErr) {
      console.error('Größen konnten nicht geladen werden:', vErr)
    }

    renderDetail(data, varianten)
    ladeWeitere(data)
    ladeAehnliche(data)
  } catch (err) {
    console.error('Produkt konnte nicht geladen werden:', err)
    notFound('Das Produkt konnte gerade nicht geladen werden.')
  }
}

init()
