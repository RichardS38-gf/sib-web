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
        </div>
        ${metaBlock}
      </div>
      <hr>
    </div>
    ${beschreibung}`

  if (shop.name) document.title = `${shop.name} — Shoppen in Braunschweig`
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
