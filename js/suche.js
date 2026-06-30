// js/suche.js — SIB Produktsuche
// Sucht in Produkttitel, Beschreibung, Shop-Name und Shop-Tabelle direkt.
// Ergebnisse werden in Händler + Produkte aufgeteilt.

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'
import { renderProductCard, fetchProductRatings } from './product-card.js'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

function esc (value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function neuBadge (p) {
  if (p.verfuegbar === false || p.freigegeben !== true) return ''
  const t = new Date(p.freigegeben_am || p.erstellt_am || 0).getTime()
  if (!t) return ''
  return (Date.now() - t) < 7 * 24 * 60 * 60 * 1000
    ? '<span class="product-card__badge">NEU</span>'
    : ''
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

function getQuery () {
  return (new URLSearchParams(window.location.search).get('q') || '').trim()
}

// ── Händler-Karten rendern ──
function renderHaendler (shops) {
  const section = document.getElementById('haendler-section')
  const container = document.getElementById('haendler-ergebnisse')
  const produkteTitle = document.getElementById('produkte-section-title')

  if (!shops || shops.length === 0) {
    section.hidden = true
    produkteTitle.hidden = true
    return
  }

  section.hidden = false
  produkteTitle.hidden = false

  container.innerHTML = shops.map((s) => {
    const slug = encodeURIComponent(s.slug || s.id)
    const banner = s.banner_url
      ? `<img class="suche-haendler-card__banner" src="${esc(s.banner_url)}" alt="${esc(s.name)}" loading="lazy">`
      : '<div class="suche-haendler-card__banner"></div>'
    const logo = s.logo_url
      ? `<img class="suche-haendler-card__logo" src="${esc(s.logo_url)}" alt="" loading="lazy">`
      : '<div class="suche-haendler-card__logo"></div>'
    const adresse = s.adresse
      ? `<span class="suche-haendler-card__adresse">${esc(s.adresse)}</span>`
      : ''
    return `
      <a class="suche-haendler-card" href="shop.html?slug=${slug}">
        ${banner}
        <div class="suche-haendler-card__body">
          <div class="suche-haendler-card__head">
            ${logo}
            <span class="suche-haendler-card__name">${esc(s.name)}</span>
          </div>
          ${adresse}
        </div>
      </a>`
  }).join('')
}

// ── Produkt-Karten rendern ──
async function renderProdukte (produkte, q) {
  const container = document.getElementById('ergebnisse')

  if (produkte.length === 0) {
    container.innerHTML = `<p class="suche-empty">Keine Produkte für „${esc(q)}" gefunden.</p>`
    return
  }

  const produktIds = produkte.map(p => p.id)
  const ratings = await fetchProductRatings(supabase, produktIds)
  container.innerHTML = produkte.map((p) => renderProductCard(
    p,
    p.shops?.name || 'Lokaler Händler',
    ratings[p.id] || null
  )).join('')
}

// ── Init ──
async function init () {
  initMobileMenu()
  initHeaderSearch()

  const q = getQuery()
  const titelEl = document.getElementById('suche-titel')
  const anzahlEl = document.getElementById('suche-anzahl')
  const container = document.getElementById('ergebnisse')

  titelEl.textContent = q ? `Suchergebnisse für „${q}"` : 'Suche'
  if (q) document.title = `Suche: ${q} — Shoppen in Braunschweig`

  if (!q) {
    anzahlEl.textContent = ''
    container.innerHTML = '<p class="suche-empty">Bitte gib einen Suchbegriff ein.</p>'
    return
  }

  const safe = q.replace(/[,()*]/g, ' ').trim()
  const ilikePattern = `%${q}%`

  try {
    const [textRes, shopNameProductRes, shopRes] = await Promise.all([
      // Produkte: Treffer in Titel oder Beschreibung
      supabase
        .from('produkte')
        .select('*, shops(name, slug)')
        .eq('verfuegbar', true)
        .eq('freigegeben', true)
        .or(`titel.ilike.*${safe}*,beschreibung.ilike.*${safe}*`)
        .order('erstellt_am', { ascending: false }),

      // Produkte: Treffer im Shop-Namen
      supabase
        .from('produkte')
        .select('*, shops!inner(name, slug)')
        .eq('verfuegbar', true)
        .eq('freigegeben', true)
        .ilike('shops.name', ilikePattern)
        .order('erstellt_am', { ascending: false }),

      // Händler: direkt in der shops-Tabelle suchen
      supabase
        .from('shops')
        .select('id, name, slug, adresse, logo_url, banner_url')
        .ilike('name', ilikePattern)
        .order('name')
    ])

    if (textRes.error) throw textRes.error
    if (shopNameProductRes.error) throw shopNameProductRes.error

    // Produkte zusammenführen + deduplizieren
    const map = new Map()
    ;[...(textRes.data || []), ...(shopNameProductRes.data || [])].forEach((p) => {
      if (!map.has(p.id)) map.set(p.id, p)
    })
    const produkte = [...map.values()].sort((a, b) =>
      String(b.erstellt_am || '').localeCompare(String(a.erstellt_am || ''))
    )

    const shops = shopRes?.data || []
    const total = produkte.length + shops.length
    anzahlEl.textContent = `${total} ${total === 1 ? 'Treffer' : 'Treffer'}`

    // Händler rendern (zeigt/versteckt Sektion automatisch)
    renderHaendler(shops)

    // Produkte rendern
    if (produkte.length === 0 && shops.length > 0) {
      // Nur Händler gefunden — Produkte-Sektion leer lassen
      container.innerHTML = ''
      document.getElementById('produkte-section-title').hidden = true
    } else {
      renderProdukte(produkte, q)
    }

  } catch (err) {
    console.error('Suche fehlgeschlagen:', err)
    anzahlEl.textContent = ''
    container.innerHTML = '<p class="suche-empty">Die Suche konnte gerade nicht ausgeführt werden.</p>'
  }
}

init()
