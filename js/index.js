// js/index.js — SIB Startseite
// Lädt Kategorien und neue Produkte live aus Supabase.

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'

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

// "Neu"-Badge: Produkte, die jünger als 7 Tage sind
function neuBadge (p) {
  const t = p.erstellt_am ? new Date(p.erstellt_am).getTime() : NaN
  if (isNaN(t)) return ''
  return (Date.now() - t) < 7 * 24 * 60 * 60 * 1000
    ? '<span class="product-card__badge">Neu</span>'
    : ''
}

// Einzelne Produktkarte rendern (inkl. Sterne-Meta + Neu-Badge)
function produktKarte (p, ratings) {
  const id = encodeURIComponent(p.id)
  const bilder = Array.isArray(p.bilder) ? p.bilder : []
  const bild = bilder[0]
    ? `<img class="product-card__image" src="${esc(bilder[0])}" alt="${esc(p.titel)}" loading="lazy">`
    : '<div class="product-card__image"></div>'
  const shopName = p.shops?.name || 'Lokaler Händler'
  const preis = (p.preis !== null && p.preis !== undefined) ? euro.format(p.preis) : ''
  const r = ratings[p.shop_id]
  const meta = (r && r.anzahl > 0)
    ? `<span class="product-card__stars">★</span> <span class="product-card__rating-val">${(r.summe / r.anzahl).toFixed(1).replace('.', ',')}</span> <span class="product-card__count">(${r.anzahl})</span> von ${esc(shopName)}`
    : `von ${esc(shopName)}`
  return `
    <a class="product-card" href="produkt.html?id=${id}">
      ${neuBadge(p)}${bild}
      <span class="product-card__title">${esc(p.titel)}</span>
      <span class="product-card__meta">${meta}</span>
      <span class="product-card__price">${esc(preis)}</span>
    </a>`
}

// ── 4. Produkte: Tabs „Beliebt" (nach Bewertung) und „Neu" (nach Datum) ──
async function ladeProdukte () {
  const container = document.getElementById('produkte')
  if (!container) return

  try {
    const { data, error } = await supabase
      .from('produkte')
      .select('*, shops(name, slug)')
      .eq('verfuegbar', true)
      .eq('freigegeben', true)
      .order('erstellt_am', { ascending: false })
      .limit(12)

    if (error) throw error

    const alle = data || []

    if (alle.length === 0) {
      container.innerHTML = '<p class="empty-state">Noch keine Produkte verfügbar.</p>'
      return
    }

    // Shop-Bewertungen (Durchschnitt + Anzahl) für die geladenen Shops holen
    const shopIds = [...new Set(alle.map((p) => p.shop_id).filter(Boolean))]
    const ratings = {}
    if (shopIds.length > 0) {
      const { data: bew } = await supabase
        .from('bewertungen')
        .select('shop_id, sterne')
        .in('shop_id', shopIds)
      ;(bew || []).forEach((b) => {
        const r = ratings[b.shop_id] || (ratings[b.shop_id] = { summe: 0, anzahl: 0 })
        r.summe += (b.sterne || 0)
        r.anzahl += 1
      })
    }
    const avgOf = (id) => {
      const r = ratings[id]
      return r && r.anzahl > 0 ? r.summe / r.anzahl : null
    }

    // Beliebt: nach Shop-Bewertung sortiert (ohne Bewertung ans Ende), Top 5
    const beliebt = [...alle]
      .map((p) => ({ p, avg: avgOf(p.shop_id) }))
      .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))
      .slice(0, 5)
      .map((x) => x.p)

    // Neu: nach Erstelldatum sortiert (neueste zuerst), Top 5
    const neu = [...alle]
      .sort((a, b) => new Date(b.erstellt_am || 0) - new Date(a.erstellt_am || 0))
      .slice(0, 5)

    const listen = { beliebt, neu }
    const render = (key) => {
      container.innerHTML = (listen[key] || []).map((p) => produktKarte(p, ratings)).join('')
    }
    render('beliebt')

    // Tab-Umschaltung
    const tabs = document.querySelectorAll('.product-tab')
    tabs.forEach((tab) => {
      tab.addEventListener('click', () => {
        tabs.forEach((t) => {
          t.classList.remove('is-active')
          t.setAttribute('aria-selected', 'false')
        })
        tab.classList.add('is-active')
        tab.setAttribute('aria-selected', 'true')
        render(tab.dataset.tab)
      })
    })
  } catch (err) {
    // Stumm scheitern, Platzhalter zeigen
    console.error('Produkte konnten nicht geladen werden:', err)
    container.innerHTML = '<p class="empty-state">Noch keine Produkte verfügbar.</p>'
  }
}

initMobileMenu()
initHeaderSearch()
ladeKategorien()
ladeProdukte()
