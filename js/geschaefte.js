// js/geschaefte.js — SIB Geschäfte-Übersicht
// Listet alle aktiven Händler, mit Suche (clientseitig) und Kategorie-Filter
// (Hauptkategorie = Kategorie der meisten Produkte eines Händlers).

import { supabase } from './supabase.js'

function esc (value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
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

// Zustand
let alleShops = []          // angereicherte Shops: { ...shop, anzahl, hauptKat }
let aktiveKategorie = 'alle'
let suchbegriff = ''

// ── Händler-Karte ──
function renderCard (s) {
  const slug = encodeURIComponent(s.slug || s.id)
  const banner = s.banner_url
    ? `<img class="haendler-card__banner" src="${esc(s.banner_url)}" alt="${esc(s.name)}" loading="lazy">`
    : '<div class="haendler-card__banner"></div>'
  const logo = s.logo_url
    ? `<img class="haendler-card__logo" src="${esc(s.logo_url)}" alt="${esc(s.name)} — Logo" loading="lazy">`
    : '<div class="haendler-card__logo"></div>'

  return `
    <a class="haendler-card" href="shop.html?slug=${slug}">
      ${banner}
      <div class="haendler-card__body">
        <div class="haendler-card__head">
          ${logo}
          <span class="haendler-card__name">${esc(s.name)}</span>
        </div>
        ${s.adresse ? `<p class="haendler-card__adresse">${esc(s.adresse)}</p>` : ''}
        <p class="haendler-card__count">${s.anzahl} Artikel</p>
      </div>
    </a>`
}

// ── Grid nach Filter + Suche rendern ──
function renderGrid () {
  const grid = document.getElementById('haendler-grid')
  const term = suchbegriff.trim().toLowerCase()

  const liste = alleShops.filter((s) => {
    const passtKat = aktiveKategorie === 'alle' || s.hauptKat === aktiveKategorie
    const passtName = !term || (s.name || '').toLowerCase().includes(term)
    return passtKat && passtName
  })

  if (liste.length === 0) {
    grid.innerHTML = '<p class="haendler-empty">Keine Geschäfte gefunden.</p>'
    return
  }
  grid.innerHTML = liste.map(renderCard).join('')
}

// ── Kategorie-Filter-Buttons ──
function renderFilter (kategorien) {
  const filter = document.getElementById('kategorie-filter')
  filter.innerHTML = `<button class="filter-btn is-active" type="button" data-kat="alle">Alle</button>` +
    kategorien.map((k) => `<button class="filter-btn" type="button" data-kat="${esc(k.id)}">${esc(k.name)}</button>`).join('')

  filter.querySelectorAll('.filter-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      aktiveKategorie = btn.dataset.kat
      filter.querySelectorAll('.filter-btn').forEach((b) => b.classList.toggle('is-active', b === btn))
      renderGrid()
    })
  })
}

// ── Init: Daten laden ──
async function init () {
  initMobileMenu()
  const grid = document.getElementById('haendler-grid')

  // Suche verdrahten
  const sucheInput = document.getElementById('haendler-suche')
  sucheInput.addEventListener('input', () => {
    suchbegriff = sucheInput.value
    renderGrid()
  })

  try {
    // Aktive Shops, Kategorien und (sichtbare) Produkte parallel laden
    const [shopsRes, katRes, prodRes] = await Promise.all([
      supabase.from('shops').select('*').eq('aktiv', true).order('name'),
      supabase.from('kategorien').select('id, name').order('name'),
      supabase.from('produkte').select('shop_id, kategorie_id')
    ])

    if (shopsRes.error) throw shopsRes.error
    const shops = shopsRes.data || []
    const kategorien = katRes.error ? [] : (katRes.data || [])
    const produkte = prodRes.error ? [] : (prodRes.data || [])

    // Pro Shop: Anzahl + Kategorie-Häufigkeit
    const statsByShop = {}
    produkte.forEach((p) => {
      if (!p.shop_id) return
      if (!statsByShop[p.shop_id]) statsByShop[p.shop_id] = { anzahl: 0, kat: {} }
      const s = statsByShop[p.shop_id]
      s.anzahl++
      if (p.kategorie_id) s.kat[p.kategorie_id] = (s.kat[p.kategorie_id] || 0) + 1
    })

    function hauptKategorie (stats) {
      if (!stats) return null
      let best = null
      let bestN = -1
      for (const katId in stats.kat) {
        if (stats.kat[katId] > bestN) { bestN = stats.kat[katId]; best = katId }
      }
      return best
    }

    alleShops = shops.map((s) => {
      const stats = statsByShop[s.id]
      return { ...s, anzahl: stats ? stats.anzahl : 0, hauptKat: hauptKategorie(stats) }
    })

    if (alleShops.length === 0) {
      grid.innerHTML = '<p class="haendler-empty">Noch keine Geschäfte verfügbar.</p>'
      return
    }

    renderFilter(kategorien)
    renderGrid()
  } catch (err) {
    console.error('Geschäfte konnten nicht geladen werden:', err)
    grid.innerHTML = '<p class="haendler-empty">Geschäfte konnten gerade nicht geladen werden.</p>'
  }
}

init()
