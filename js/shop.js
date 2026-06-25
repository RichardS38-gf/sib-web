// js/shop.js — SIB Shopseite
// Lädt ein Geschäft (per slug) live aus Supabase und zeigt Profil + Produkte.

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

function getSlug () {
  return new URLSearchParams(window.location.search).get('slug')
}

function notFound (text) {
  const el = document.getElementById('shop-profil')
  el.innerHTML = `
    <div class="container">
      <div class="shop-notfound">
        <h1>Geschäft nicht gefunden</h1>
        <p>${esc(text || 'Dieses Geschäft existiert nicht oder ist nicht mehr aktiv.')}</p>
        <p style="margin-top:1.5rem"><a class="btn btn--primary" href="shop.html">Alle Geschäfte ansehen</a></p>
      </div>
    </div>`
}

// ── Shop-Profil rendern ──
function renderShop (shop) {
  const el = document.getElementById('shop-profil')

  const banner = shop.banner_url
    ? `<img class="shop-banner" src="${esc(shop.banner_url)}" alt="${esc(shop.name)} — Banner">`
    : '<div class="shop-banner"></div>'

  const logo = shop.logo_url
    ? `<img class="shop-head__logo" src="${esc(shop.logo_url)}" alt="${esc(shop.name)} — Logo">`
    : '<div class="shop-head__logo"></div>'

  const meta = []
  if (shop.adresse) {
    meta.push(`<span class="shop-head__meta-item"><span class="shop-head__meta-label">Adresse</span>${esc(shop.adresse)}</span>`)
  }
  if (shop.oeffnungszeiten) {
    meta.push(`<span class="shop-head__meta-item"><span class="shop-head__meta-label">Öffnungszeiten</span>${esc(shop.oeffnungszeiten)}</span>`)
  }
  const metaBlock = meta.length
    ? `<div class="shop-head__meta">${meta.join('')}</div>`
    : ''

  const beschreibung = shop.beschreibung
    ? `<div class="container shop-desc"><p>${esc(shop.beschreibung)}</p></div><div class="container"><hr></div>`
    : ''

  el.innerHTML = `
    ${banner}
    <div class="container">
      <div class="shop-head">
        ${logo}
        <div class="shop-head__main">
          <h1 class="shop-head__name">${esc(shop.name)}</h1>
          <div class="shop-rating" id="shop-rating"></div>
          ${shareRow(`Schau mal dieses Geschäft an: ${shop.name} auf Shoppen in Braunschweig – ${window.location.href}`, window.location.href)}
        </div>
        ${metaBlock}
      </div>
      <hr>
    </div>
    ${beschreibung}`

  if (shop.name) document.title = `${shop.name} — Shoppen in Braunschweig`

  initCopyButtons(el)
}

// ── Produkte des Shops ──
async function ladeProdukte (shop) {
  const section = document.getElementById('shop-produkte-section')
  const container = document.getElementById('shop-produkte')
  const titel = document.getElementById('shop-produkte-titel')

  titel.textContent = `Artikel von ${shop.name}`
  section.hidden = false
  container.innerHTML = '<div class="loading">Artikel werden geladen…</div>'

  try {
    const { data, error } = await supabase
      .from('produkte')
      .select('*')
      .eq('shop_id', shop.id)
      .eq('verfuegbar', true)
      .eq('freigegeben', true)
      .order('erstellt_am', { ascending: false })

    if (error) throw error
    const produkte = data || []

    if (produkte.length === 0) {
      container.innerHTML = '<p class="shop-empty">Dieses Geschäft hat aktuell keine Artikel.</p>'
      return
    }

    container.innerHTML = produkte.map((p) => {
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
  } catch (err) {
    console.error('Artikel konnten nicht geladen werden:', err)
    container.innerHTML = '<p class="shop-empty">Die Artikel konnten gerade nicht geladen werden.</p>'
  }
}

// ── Bewertungen ──
let gewaehlteSterne = 0

function sterneIcons (n) {
  const v = Math.max(0, Math.min(5, Math.round(n)))
  return '★'.repeat(v) + '☆'.repeat(5 - v)
}

async function ladeBewertungen (shop) {
  const section = document.getElementById('bewertungen-section')
  const liste = document.getElementById('bewertungen-liste')
  const rating = document.getElementById('shop-rating')
  section.hidden = false

  try {
    const { data, error } = await supabase
      .from('bewertungen')
      .select('*')
      .eq('shop_id', shop.id)
      .order('erstellt_am', { ascending: false })
    if (error) throw error
    const bewertungen = data || []

    // Durchschnitt + Anzahl
    if (rating) {
      if (bewertungen.length === 0) {
        rating.textContent = 'Noch keine Bewertungen'
      } else {
        const schnitt = bewertungen.reduce((s, b) => s + (b.sterne || 0), 0) / bewertungen.length
        const wort = bewertungen.length === 1 ? 'Bewertung' : 'Bewertungen'
        rating.innerHTML = `<span class="shop-rating__stars">★</span> ${schnitt.toFixed(1)} <span class="shop-rating__count">(${bewertungen.length} ${wort})</span>`
      }
    }

    // Letzte 5 anzeigen
    if (bewertungen.length === 0) {
      liste.innerHTML = '<p class="shop-empty">Sei die erste Person, die dieses Geschäft bewertet.</p>'
      return
    }
    liste.innerHTML = bewertungen.slice(0, 5).map((b) => `
      <article class="bewertung">
        <div class="bewertung__kopf">
          <span class="bewertung__autor">${esc(b.autor_name)}</span>
          <span class="bewertung__datum">${formatDatum(b.erstellt_am)}</span>
        </div>
        <div class="bewertung__sterne" aria-label="${b.sterne} von 5 Sternen">${sterneIcons(b.sterne)}</div>
        ${b.text ? `<p class="bewertung__text">${esc(b.text)}</p>` : ''}
      </article>`).join('')
  } catch (err) {
    console.error('Bewertungen konnten nicht geladen werden:', err)
    if (rating) rating.textContent = ''
    liste.innerHTML = '<p class="shop-empty">Bewertungen konnten gerade nicht geladen werden.</p>'
  }
}

function formatDatum (value) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function initBewertungForm (shop) {
  const toggle = document.getElementById('toggle-bewertung-form')
  const form = document.getElementById('bewertung-form')
  const feedback = document.getElementById('bewertung-feedback')
  const sterneEl = document.getElementById('sterne-input')
  const sternBtns = Array.from(sterneEl.querySelectorAll('.stern'))

  function zeichneSterne (wert) {
    sternBtns.forEach((b) => b.classList.toggle('is-on', Number(b.dataset.wert) <= wert))
  }

  toggle.addEventListener('click', () => {
    form.hidden = !form.hidden
    if (!form.hidden) form.name.focus()
  })

  sternBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      gewaehlteSterne = Number(btn.dataset.wert)
      zeichneSterne(gewaehlteSterne)
    })
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    feedback.innerHTML = ''

    const name = form.name.value.trim()
    const email = form.email.value.trim()
    const text = form.text.value.trim()

    if (!name || !email) {
      feedback.innerHTML = '<div class="error-msg">Bitte Name und E-Mail ausfüllen.</div>'
      return
    }
    if (gewaehlteSterne < 1 || gewaehlteSterne > 5) {
      feedback.innerHTML = '<div class="error-msg">Bitte wähle eine Sterne-Bewertung.</div>'
      return
    }

    const submitBtn = form.querySelector('button[type="submit"]')
    submitBtn.disabled = true
    submitBtn.textContent = 'Wird gesendet…'

    try {
      const { error } = await supabase.from('bewertungen').insert({
        shop_id: shop.id,
        autor_name: name,
        autor_email: email,
        sterne: gewaehlteSterne,
        text: text || null
      })
      if (error) throw error

      form.reset()
      form.hidden = true
      gewaehlteSterne = 0
      zeichneSterne(0)
      ladeBewertungen(shop)
      feedback.innerHTML = ''
      document.getElementById('bewertungen-liste').insertAdjacentHTML('beforebegin',
        '<div class="success-msg" id="bewertung-danke">Danke für deine Bewertung!</div>')
    } catch (err) {
      console.error('Bewertung speichern fehlgeschlagen:', err)
      feedback.innerHTML = '<div class="error-msg">Die Bewertung konnte nicht gespeichert werden. Bitte versuche es später erneut.</div>'
      submitBtn.disabled = false
      submitBtn.textContent = 'Absenden'
    }
  })
}

// ── Init ──
async function init () {
  initMobileMenu()
  initHeaderSearch()

  const slug = getSlug()
  if (!slug) {
    notFound('Kein Geschäft angegeben.')
    return
  }

  try {
    const { data, error } = await supabase
      .from('shops')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      notFound()
      return
    }

    renderShop(data)
    ladeProdukte(data)
    ladeBewertungen(data)
    initBewertungForm(data)
  } catch (err) {
    console.error('Geschäft konnte nicht geladen werden:', err)
    notFound('Das Geschäft konnte gerade nicht geladen werden.')
  }
}

init()
