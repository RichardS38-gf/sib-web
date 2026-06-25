// js/suche.js — SIB Produktsuche
// Sucht in Produkttitel, Beschreibung und Shop-Name (ilike).
// Nur Produkte mit verfuegbar=true UND freigegeben=true.

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

function getQuery () {
  return (new URLSearchParams(window.location.search).get('q') || '').trim()
}

function renderProdukte (produkte) {
  const container = document.getElementById('ergebnisse')

  if (produkte.length === 0) {
    container.innerHTML = `<p class="suche-empty">Keine Produkte für „${esc(getQuery())}" gefunden.</p>`
    return
  }

  container.innerHTML = produkte.map((p) => {
    const id = encodeURIComponent(p.id)
    const bilder = Array.isArray(p.bilder) ? p.bilder.filter(Boolean) : []
    const bild = bilder[0]
      ? `<img class="product-card__image" src="${esc(bilder[0])}" alt="${esc(p.titel)}" loading="lazy">`
      : '<div class="product-card__image"></div>'
    const shopName = p.shops?.name || 'Lokaler Händler'
    const preis = (p.preis !== null && p.preis !== undefined) ? euro.format(p.preis) : ''
    return `
      <a class="product-card" href="produkt.html?id=${id}">
        ${neuBadge(p)}${bild}
        <span class="product-card__shop">${esc(shopName)}</span>
        <span class="product-card__title">${esc(p.titel)}</span>
        <span class="product-card__price">${esc(preis)}</span>
      </a>`
  }).join('')
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

  // Begriff für den or-Filter entschärfen (Komma/Klammern/Stern brechen die Syntax)
  const safe = q.replace(/[,()*]/g, ' ').trim()
  const ilikePattern = `%${q}%`

  try {
    // 1) Treffer in Titel/Beschreibung (eigene Spalten)
    // 2) Treffer im Shop-Namen (referenzierte Tabelle, inner join)
    const [textRes, shopRes] = await Promise.all([
      supabase
        .from('produkte')
        .select('*, shops(name, slug)')
        .eq('verfuegbar', true)
        .eq('freigegeben', true)
        .or(`titel.ilike.*${safe}*,beschreibung.ilike.*${safe}*`)
        .order('erstellt_am', { ascending: false }),
      supabase
        .from('produkte')
        .select('*, shops!inner(name, slug)')
        .eq('verfuegbar', true)
        .eq('freigegeben', true)
        .ilike('shops.name', ilikePattern)
        .order('erstellt_am', { ascending: false })
    ])

    if (textRes.error) throw textRes.error
    if (shopRes.error) throw shopRes.error

    // Zusammenführen + nach id deduplizieren
    const map = new Map()
    ;[...(textRes.data || []), ...(shopRes.data || [])].forEach((p) => {
      if (!map.has(p.id)) map.set(p.id, p)
    })
    const produkte = [...map.values()].sort((a, b) =>
      String(b.erstellt_am || '').localeCompare(String(a.erstellt_am || ''))
    )

    anzahlEl.textContent = `${produkte.length} ${produkte.length === 1 ? 'Treffer' : 'Treffer'}`
    renderProdukte(produkte)
  } catch (err) {
    console.error('Suche fehlgeschlagen:', err)
    anzahlEl.textContent = ''
    container.innerHTML = '<p class="suche-empty">Die Suche konnte gerade nicht ausgeführt werden.</p>'
  }
}

init()
