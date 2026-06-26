// js/shop.js — SIB Shopseite v6
// Lädt ein Geschäft (per slug) aus Supabase.
// Sektionen: Galerie → Info-Bar → Willkommen → Artikel → Bewertungen → Info-Tabelle

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
  const lit = '<span class="stern-on">★</span>'
  const dim = '<span class="stern-off">★</span>'
  return lit.repeat(v) + dim.repeat(max - v)
}

function avatarHtml (name) {
  const initials = (name || '?').trim().slice(0, 1).toUpperCase()
  const colors = ['#2D6A4F','#1B4332','#52796F','#354F52','#40916C','#1D3557','#457B9D','#6D4C41']
  const hue = initials.charCodeAt(0) % colors.length
  return `<span class="bw-avatar" style="background:${colors[hue]}">${initials}</span>`
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

  // Hero immer einblenden (Infobar ist immer da)
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

  el.innerHTML = `
    <div class="shop-infobar__left">
      ${logo}
      <div class="shop-infobar__text">
        <h1 class="shop-infobar__name">${esc(shop.name)}</h1>
        ${ort}
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
      <a class="btn btn--primary shop-infobar__msg" href="${kontaktHref}">
        Nachricht
        <svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><path d="M20 2H4a2 2 0 00-2 2v18l4-4h14a2 2 0 002-2V4a2 2 0 00-2-2z"/></svg>
      </a>
    </div>`
}

// ─────────────────────────────────────────
// 3. WILLKOMMEN / ABOUT
// ─────────────────────────────────────────
function renderAbout (shop) {
  if (!shop.beschreibung && !shop.bild_url && !shop.banner_url) return

  const section = document.getElementById('shop-about')
  const inner = document.getElementById('shop-about-inner')
  section.hidden = false

  const willkommenBild = shop.bild_url || (
    Array.isArray(shop.galerie) && shop.galerie.length > 1
      ? shop.galerie[1]
      : null
  )

  const bildHtml = willkommenBild
    ? `<div class="shop-about__bild-wrap">
         <img class="shop-about__bild" src="${esc(willkommenBild)}" alt="${esc(shop.name)}" loading="lazy">
       </div>`
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

  const mehrWrap = document.getElementById('shop-mehr-wrap')
  mehrWrap.hidden = gezeigte >= alleProdukte.length
}

async function ladeProdukte (shop) {
  const section = document.getElementById('shop-produkte-section')
  const container = document.getElementById('shop-produkte')
  const titel = document.getElementById('shop-produkte-titel')
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
    console.error('Artikel konnten nicht geladen werden:', err)
    container.innerHTML = '<p class="shop-empty">Die Artikel konnten gerade nicht geladen werden.</p>'
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
      <div class="bw-karte__sterne" aria-label="${b.sterne} von 5 Sternen">${sterneHtml(b.sterne)}</div>
      ${b.text ? `<p class="bw-karte__text">${esc(b.text)}</p>` : ''}
    </article>`).join('')

  document.getElementById('bw-mehr-wrap').hidden = gezeigteB >= alleBewertungen.length
}

async function ladeBewertungen (shop) {
  const section = document.getElementById('bewertungen-section')
  section.hidden = false

  try {
    const { data, error } = await supabase
      .from('bewertungen')
      .select('*')
      .eq('shop_id', shop.id)
      .order('erstellt_am', { ascending: false })

    if (error) throw error
    alleBewertungen = data || []

    const schnitt = alleBewertungen.length > 0
      ? alleBewertungen.reduce((s, b) => s + (b.sterne || 0), 0) / alleBewertungen.length
      : 0

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
    console.error('Bewertungen konnten nicht geladen werden:', err)
    document.getElementById('shop-rating-summary').innerHTML = ''
    return { schnitt: 0, anzahl: 0 }
  }
}

function initBewertungForm (shop) {
  const toggle = document.getElementById('toggle-bewertung-form')
  const form = document.getElementById('bewertung-form')
  const feedback = document.getElementById('bewertung-feedback')
  const sternBtns = Array.from(document.querySelectorAll('#sterne-input .stern'))

  function zeichneSterne (wert) {
    sternBtns.forEach(b => b.classList.toggle('is-on', Number(b.dataset.wert) <= wert))
  }

  toggle.addEventListener('click', () => {
    form.hidden = !form.hidden
    if (!form.hidden) form.querySelector('[name="name"]').focus()
  })

  sternBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      gewaehlteSterne = Number(btn.dataset.wert)
      zeichneSterne(gewaehlteSterne)
    })
  })

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    feedback.innerHTML = ''

    const nameVal = form.querySelector('[name="name"]').value.trim()
    const emailVal = form.querySelector('[name="email"]').value.trim()
    const textVal = form.querySelector('[name="text"]').value.trim()

    if (!nameVal || !emailVal) {
      feedback.innerHTML = '<div class="error-msg">Bitte Name und E-Mail ausfüllen.</div>'
      return
    }
    if (gewaehlteSterne < 1) {
      feedback.innerHTML = '<div class="error-msg">Bitte wähle eine Sterne-Bewertung.</div>'
      return
    }

    const submitBtn = form.querySelector('button[type="submit"]')
    submitBtn.disabled = true
    submitBtn.textContent = 'Wird gesendet…'

    try {
      const { error } = await supabase.from('bewertungen').insert({
        shop_id: shop.id,
        autor_name: nameVal,
        autor_email: emailVal,
        sterne: gewaehlteSterne,
        text: textVal || null
      })
      if (error) throw error

      form.reset()
      form.hidden = true
      gewaehlteSterne = 0
      zeichneSterne(0)
      alleBewertungen = []
      gezeigteB = 0
      ladeBewertungen(shop)
    } catch (err) {
      console.error('Bewertung speichern fehlgeschlagen:', err)
      feedback.innerHTML = '<div class="error-msg">Konnte nicht gespeichert werden. Bitte später erneut versuchen.</div>'
      submitBtn.disabled = false
      submitBtn.textContent = 'Absenden'
    }
  })
}

// ─────────────────────────────────────────
// 6. INFO-TABELLE (AGB, Versand, etc.)
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

  const section = document.getElementById('shop-info-tabelle')
  const body = document.getElementById('shop-info-tabelle-body')
  section.hidden = false

  body.innerHTML = vorhandene.map(f => `
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
  if (!slug) {
    notFound('Kein Geschäft angegeben.')
    return
  }

  try {
    const { data: shop, error } = await supabase
      .from('shops')
      .select('*')
      .eq('slug', slug)
      .maybeSingle()

    if (error) throw error
    if (!shop) { notFound(); return }

    showLoading(false)
    if (shop.name) document.title = `${shop.name} — Shoppen in Braunschweig`

    // Galerie (zeigt auch den Hero-Wrapper)
    renderGalerie(shop)

    // Artikel + Bewertungen parallel laden
    const [produktAnzahl, { schnitt, anzahl }] = await Promise.all([
      ladeProdukte(shop),
      ladeBewertungen(shop)
    ])

    // Info-Bar (braucht Produkt- und Bewertungszahlen)
    renderInfoBar(shop, produktAnzahl || 0, schnitt, anzahl)

    // Willkommen / About
    renderAbout(shop)

    // AGB-Tabelle
    renderInfoTabelle(shop)

    // Bewertungsformular
    initBewertungForm(shop)

  } catch (err) {
    console.error('Geschäft konnte nicht geladen werden:', err)
    notFound('Das Geschäft konnte gerade nicht geladen werden.')
  }
}

init()
