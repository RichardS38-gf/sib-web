// js/kategorie.js — SIB Kategorie-/Produktübersicht
// Zeigt Produkte gefiltert nach Kategorie (?slug=XXX) oder alle Produkte.

import { supabase } from './supabase.js'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

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

function getSlug () {
  return new URLSearchParams(window.location.search).get('slug')
}

// ── Sidebar mit allen Kategorien ──
function renderSidebar (kategorien, aktiverSlug) {
  const nav = document.getElementById('kategorie-nav')
  const links = [
    `<a class="kategorie-sidebar__link${!aktiverSlug ? ' is-active' : ''}" href="kategorie.html">Alle Produkte</a>`,
    ...kategorien.map((k) => {
      const slug = encodeURIComponent(k.slug || k.id)
      const aktiv = aktiverSlug && (k.slug === aktiverSlug)
      return `<a class="kategorie-sidebar__link${aktiv ? ' is-active' : ''}" href="kategorie.html?slug=${slug}">${esc(k.name)}</a>`
    })
  ]
  nav.innerHTML = links.join('')
}

// ── Produktgrid ──
function renderProdukte (produkte) {
  const container = document.getElementById('produkte')

  if (produkte.length === 0) {
    container.innerHTML = '<p class="kategorie-empty">Keine Produkte in dieser Kategorie.</p>'
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
        ${bild}
        <span class="product-card__shop">${esc(shopName)}</span>
        <span class="product-card__title">${esc(p.titel)}</span>
        <span class="product-card__price">${esc(preis)}</span>
      </a>`
  }).join('')
}

// ── Init ──
async function init () {
  initMobileMenu()

  const slug = getSlug()
  const titelEl = document.getElementById('kategorie-titel')
  const anzahlEl = document.getElementById('kategorie-anzahl')

  try {
    // Kategorien für Sidebar laden
    const { data: katData } = await supabase
      .from('kategorien')
      .select('id, name, slug')
      .order('name')
    const kategorien = katData || []
    renderSidebar(kategorien, slug)

    // Aktive Kategorie bestimmen
    let aktiveKat = null
    if (slug) {
      aktiveKat = kategorien.find((k) => k.slug === slug) || null
      if (!aktiveKat) {
        // Slug unbekannt — Titel trotzdem sinnvoll setzen
        titelEl.textContent = 'Kategorie'
      }
    }

    titelEl.textContent = aktiveKat ? aktiveKat.name : (slug ? 'Kategorie' : 'Alle Produkte')
    if (slug && aktiveKat) document.title = `${aktiveKat.name} — Shoppen in Braunschweig`

    // Produkte laden (nur sichtbare, neueste zuerst)
    let query = supabase
      .from('produkte')
      .select('*, shops(name, slug)')
      .eq('verfuegbar', true)
      .eq('freigegeben', true)
      .order('erstellt_am', { ascending: false })

    if (aktiveKat) query = query.eq('kategorie_id', aktiveKat.id)
    // Unbekannter Slug -> keine Treffer erzwingen
    if (slug && !aktiveKat) query = query.eq('kategorie_id', '00000000-0000-0000-0000-000000000000')

    const { data, error } = await query
    if (error) throw error
    const produkte = data || []

    anzahlEl.textContent = `${produkte.length} ${produkte.length === 1 ? 'Produkt' : 'Produkte'}`
    renderProdukte(produkte)
  } catch (err) {
    console.error('Produkte konnten nicht geladen werden:', err)
    anzahlEl.textContent = ''
    document.getElementById('produkte').innerHTML =
      '<p class="kategorie-empty">Produkte konnten gerade nicht geladen werden.</p>'
  }
}

init()
