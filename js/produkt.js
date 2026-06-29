// js/produkt.js — SIB Produktseite
// Lädt ein einzelnes Produkt (+ Shop) live aus Supabase, zeigt Galerie,
// Reservierungsformular und weitere Artikel desselben Shops.

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'
import { renderProductCard, fetchShopRatings } from './product-card.js'

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

// "Neu"-Badge
function neuBadge (p) {
  if (p.verfuegbar === false || p.freigegeben !== true) return ''
  const t = new Date(p.freigegeben_am || p.erstellt_am || 0).getTime()
  if (!t) return ''
  return (Date.now() - t) < 7 * 24 * 60 * 60 * 1000
    ? '<span class="product-card__badge product-card__badge--neu">NEU</span>'
    : ''
}

// ── Social-Share Icons ──
const SHARE_ICONS = {
  whatsapp: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>',
  facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15.12 5.32H17V2.14A26.11 26.11 0 0014.26 2c-2.72 0-4.58 1.66-4.58 4.7v2.6H6.6v3.56h3.08V22h3.68v-9.14h3.06l.46-3.56h-3.52V7.05c0-1.03.28-1.73 1.76-1.73z"/></svg>',
  link: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.9 12a3.1 3.1 0 013.1-3.1h4V7H7a5 5 0 000 10h4v-1.9H7A3.1 3.1 0 013.9 12zM8 13h8v-2H8v2zm9-6h-4v1.9h4A3.1 3.1 0 0117 15.1h-4V17h4a5 5 0 000-10z"/></svg>'
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
  const kategorieName = produkt.kategorien?.name || ''

  selectedGroesse = null
  hatVarianten = varianten.length > 0

  // Galerie
  const mainImg = bilder[0]
    ? `<img class="pdp-gallery__main" id="gallery-main" src="${esc(bilder[0])}" alt="${esc(produkt.titel)}">`
    : '<div class="pdp-gallery__main" id="gallery-main"></div>'

  const thumbsHtml = bilder.length > 1
    ? `<div class="pdp-gallery__grid">${bilder.slice(1).map((b, i) =>
        `<img class="pdp-gallery__grid-img" src="${esc(b)}" alt="${esc(produkt.titel)} ${i + 2}" loading="lazy">`
      ).join('')}</div>`
    : ''

  // Shop-Link
  const shopLink = shop?.slug
    ? `<a class="pdp-info__shop" href="shop.html?slug=${encodeURIComponent(shop.slug)}">${esc(shopName)}</a>`
    : `<span class="pdp-info__shop">${esc(shopName)}</span>`

  // Kategorie
  const kategorieHtml = kategorieName
    ? `<div class="pdp-meta-row"><span class="pdp-meta-label">Kategorie</span><span class="pdp-meta-value">${esc(kategorieName)}</span></div>`
    : ''

  // Größe
  const groesseHtml = hatVarianten
    ? `<div class="pdp-field">
        <label class="pdp-field__label" for="groesse-select">Größe</label>
        <select class="form-select" id="groesse-select">
          <option value="">Bitte wählen…</option>
          ${sortiereVarianten(varianten).map((v) => {
            const ausverkauft = !(v.stueckzahl > 0)
            return `<option value="${esc(v.groesse)}"${ausverkauft ? ' disabled' : ''}>${esc(v.groesse)}${ausverkauft ? ' (Nicht verfügbar)' : ''}</option>`
          }).join('')}
        </select>
      </div>`
    : `<div class="pdp-field">
        <label class="pdp-field__label" for="groesse-input">Größe</label>
        <input class="form-input" type="text" id="groesse-input" name="groesse" placeholder="z.B. M, L, XL …">
      </div>`

  // Reservierungsformular
  const formularHtml = verfuegbar
    ? `<p class="pdp-section-title">Artikel reservieren</p>
      <div class="form-group">
        <label class="form-label" for="kunde-name">Name</label>
        <input class="form-input" type="text" id="kunde-name" name="name" required autocomplete="name">
      </div>
      <div class="form-group">
        <label class="form-label" for="kunde-email">E-Mail</label>
        <input class="form-input" type="email" id="kunde-email" name="email" required autocomplete="email">
      </div>
      <button class="btn btn--primary btn--full pdp-cta" type="submit">
        Reservieren
        <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.72a2 2 0 001.99-1.61L23 6H6"/></svg>
      </button>
      <div id="reservierung-feedback" aria-live="polite"></div>`
    : '<p class="badge badge--outline">Aktuell nicht verfügbar</p>'

  // Teilen
  const url = window.location.href
  const waText = `Schau mal: ${produkt.titel} bei ${shopName} auf Shoppen in Braunschweig – ${url}`
  const wa = `https://wa.me/?text=${encodeURIComponent(waText)}`
  const fb = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`

  el.innerHTML = `
    <div class="pdp-layout">
      <div class="pdp-gallery">
        ${neuBadge(produkt)}
        ${mainImg}
        ${thumbsHtml}
      </div>
      <div class="pdp-info">
        <h1 class="pdp-info__title">${esc(produkt.titel)}</h1>
        ${shopLink}
        <p class="pdp-info__price">${esc(preis)}</p>
        <hr class="pdp-divider">
        ${kategorieHtml}
        ${groesseHtml}
        <form class="pdp-form" id="reservierung-form" novalidate>
          ${formularHtml}
        </form>
        <div class="pdp-share">
          <span class="pdp-share__label">Teilen</span>
          <a class="share-btn" href="${esc(wa)}" target="_blank" rel="noopener" aria-label="WhatsApp">${SHARE_ICONS.whatsapp}</a>
          <a class="share-btn" href="${esc(fb)}" target="_blank" rel="noopener" aria-label="Facebook">${SHARE_ICONS.facebook}</a>
          <button class="share-btn share-btn--copy" type="button" data-copy-url="${esc(url)}" aria-label="Link kopieren">${SHARE_ICONS.link}</button>
        </div>
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

// Größen-Dropdown
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
  const thumbs = document.querySelectorAll('.pdp-gallery__thumb')
  thumbs.forEach((thumb) => {
    thumb.addEventListener('click', () => {
      const src = thumb.getAttribute('data-src')
      if (main.tagName === 'IMG') main.src = src
      thumbs.forEach((t) => t.classList.remove('is-active'))
      thumb.classList.add('is-active')
    })
  })
}

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

      const ansehen = neu?.id
        ? ` <a href="reservierung.html?id=${encodeURIComponent(neu.id)}">Reservierung ansehen →</a>`
        : ''
      form.innerHTML = `<div class="success-msg">Reservierung erfolgreich! Wir benachrichtigen dich wenn der Artikel abholbereit ist.${ansehen}</div>`

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

// ── Details-Sektion (Beschreibung + Features + Bild) ──
function renderDetails (produkt) {
  const section = document.getElementById('produkt-details-section')
  if (!section) return

  const beschreibung = produkt.beschreibung || ''
  const highlights = Array.isArray(produkt.highlights) ? produkt.highlights : []
  const bildUrl = produkt.details_bild_url || ''

  if (!beschreibung && !highlights.length) return

  const bildHtml = bildUrl
    ? `<div class="pdp-details__bild"><img src="${esc(bildUrl)}" alt="${esc(produkt.titel)}"></div>`
    : ''

  const featuresHtml = highlights.length
    ? `<h3 class="pdp-details__sub">Features</h3>
       <ul class="pdp-details__list">${highlights.map(h => `<li>${esc(h)}</li>`).join('')}</ul>`
    : ''

  section.innerHTML = `
    <div class="container">
      <div class="pdp-details__layout">
        <div class="pdp-details__text">
          <h2 class="pdp-details__headline">Details</h2>
          ${beschreibung ? `<h3 class="pdp-details__sub">Beschreibung</h3><p class="pdp-details__desc">${esc(beschreibung)}</p>` : ''}
          ${featuresHtml}
        </div>
        ${bildHtml}
      </div>
    </div>`
  section.hidden = false
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

    const shopIdsW = [...new Set(weitere.map(p => p.shop_id).filter(Boolean))]
    const shopRatingW = await fetchShopRatings(supabase, shopIdsW)
    container.innerHTML = weitere.map((p) => renderProductCard(p, p.shops?.name || 'Lokaler Händler', shopRatingW[p.shop_id] || null)).join('')
    section.hidden = false
  } catch (err) {
    console.error('Weitere Artikel konnten nicht geladen werden:', err)
  }
}

function mischen (arr) {
  const a = arr.slice()
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

async function ladeAehnliche (produkt) {
  const section = document.getElementById('aehnliche-section')
  const container = document.getElementById('aehnliche')
  section.hidden = false  // immer anzeigen

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
    const shopIdsA = [...new Set(auswahl.map(p => p.shop_id).filter(Boolean))]
    const shopRatingA = await fetchShopRatings(supabase, shopIdsA)
    container.innerHTML = auswahl.map((p) => renderProductCard(p, p.shops?.name || 'Lokaler Händler', shopRatingA[p.shop_id] || null)).join('')
    section.hidden = false
  } catch (err) {
    console.error('Ähnliche Artikel konnten nicht geladen werden:', err)
  }
}

async function init () {
  initMobileMenu()
  initHeaderSearch()

  const id = getProduktId()
  if (!id) { notFound('Kein Produkt angegeben.'); return }

  try {
    const { data, error } = await supabase
      .from('produkte')
      .select('*, shops(name, slug, adresse), kategorien(name)')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!data) { notFound(); return }

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
    renderDetails(data)
    ladeWeitere(data)
    ladeAehnliche(data)
  } catch (err) {
    console.error('Produkt konnte nicht geladen werden:', err)
    notFound('Das Produkt konnte gerade nicht geladen werden.')
  }
}

init()
