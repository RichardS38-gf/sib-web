// js/index.js — SIB Startseite
// Lädt Kategorien und neue Produkte live aus Supabase.

import { supabase } from './supabase.js'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

// HTML escapen, damit Daten aus der DB kein Markup einschleusen
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

// ── 3. Kategorien ──
async function ladeKategorien () {
  const container = document.getElementById('kategorien')
  if (!container) return

  try {
    const { data, error } = await supabase
      .from('kategorien')
      .select('*')
      .order('name')

    if (error) throw error

    const kategorien = (data || []).slice(0, 5)

    if (kategorien.length === 0) {
      container.innerHTML = '<p class="empty-state">Noch keine Kategorien verfügbar.</p>'
      return
    }

    container.innerHTML = kategorien.map((k) => {
      const slug = encodeURIComponent(k.slug || k.id)
      const bild = k.bild_url
        ? `<img class="category-card__image" src="${esc(k.bild_url)}" alt="${esc(k.name)}" loading="lazy">`
        : '<div class="category-card__image"></div>'
      return `
        <a class="category-card" href="kategorie.html?slug=${slug}">
          ${bild}
          <span class="category-card__name">${esc(k.name)}</span>
        </a>`
    }).join('')
  } catch (err) {
    // Stumm scheitern, Platzhalter zeigen
    console.error('Kategorien konnten nicht geladen werden:', err)
    container.innerHTML = '<p class="empty-state">Kategorien konnten gerade nicht geladen werden.</p>'
  }
}

// ── 4. Neue Produkte ──
async function ladeProdukte () {
  const container = document.getElementById('produkte')
  if (!container) return

  try {
    const { data, error } = await supabase
      .from('produkte')
      .select('*, shops(name, slug)')
      .eq('verfuegbar', true)
      .order('erstellt_am', { ascending: false })
      .limit(8)

    if (error) throw error

    const produkte = data || []

    if (produkte.length === 0) {
      container.innerHTML = '<p class="empty-state">Noch keine Produkte verfügbar.</p>'
      return
    }

    container.innerHTML = produkte.map((p) => {
      const id = encodeURIComponent(p.id)
      const bilder = Array.isArray(p.bilder) ? p.bilder : []
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
  } catch (err) {
    // Stumm scheitern, Platzhalter zeigen
    console.error('Produkte konnten nicht geladen werden:', err)
    container.innerHTML = '<p class="empty-state">Noch keine Produkte verfügbar.</p>'
  }
}

initMobileMenu()
ladeKategorien()
ladeProdukte()
