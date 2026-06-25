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
let alleShops = []          // angereicherte Shops: { ...shop, anzahl }
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
    return !term || (s.name || '').toLowerCase().includes(term)
  })

  if (liste.length === 0) {
    grid.innerHTML = '<p class="haendler-empty">Keine Geschäfte gefunden.</p>'
    return
  }
  grid.innerHTML = liste.map(renderCard).join('')
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
    // Aktive Shops und (sichtbare) Produkte parallel laden
    const [shopsRes, prodRes] = await Promise.all([
      supabase.from('shops').select('*').eq('aktiv', true).order('name'),
      supabase.from('produkte').select('shop_id')
    ])

    if (shopsRes.error) throw shopsRes.error
    const shops = shopsRes.data || []
    const produkte = prodRes.error ? [] : (prodRes.data || [])

    // Pro Shop: Anzahl Produkte
    const anzahlByShop = {}
    produkte.forEach((p) => {
      if (!p.shop_id) return
      anzahlByShop[p.shop_id] = (anzahlByShop[p.shop_id] || 0) + 1
    })

    alleShops = shops.map((s) => ({ ...s, anzahl: anzahlByShop[s.id] || 0 }))

    if (alleShops.length === 0) {
      grid.innerHTML = '<p class="haendler-empty">Noch keine Geschäfte verfügbar.</p>'
      return
    }

    renderGrid()
  } catch (err) {
    console.error('Geschäfte konnten nicht geladen werden:', err)
    grid.innerHTML = '<p class="haendler-empty">Geschäfte konnten gerade nicht geladen werden.</p>'
  }
}

init()
