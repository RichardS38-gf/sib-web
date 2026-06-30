// js/index.js — SIB Startseite
// Lädt Kategorien und neue Produkte live aus Supabase.

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'
import { renderProductCard, fetchProductRatings } from './product-card.js'

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

// "Neu"-Badge und Karte werden jetzt von product-card.js geliefert
function produktKarte (p, ratings) {
  const rating = ratings?.[p.id] || null
  return renderProductCard(p, p.shops?.name || 'Lokaler Händler', rating)
}

// ── 4. Produkte: Neue und Beliebte als zwei separate Sektionen ──
async function ladeProdukte () {
  const neueContainer    = document.getElementById('neue-produkte')
  const beliebtContainer = document.getElementById('beliebte-produkte')
  if (!neueContainer && !beliebtContainer) return

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
      const msg = '<p class="empty-state">Noch keine Produkte verfügbar.</p>'
      if (neueContainer)    neueContainer.innerHTML    = msg
      if (beliebtContainer) beliebtContainer.innerHTML = msg
      return
    }

    const produktIds = alle.map(p => p.id)
    const ratings = await fetchProductRatings(supabase, produktIds)

    // Neu: neueste zuerst (freigegeben_am wenn vorhanden, sonst erstellt_am), Top 5
    const neu = [...alle]
      .sort((a, b) => new Date(b.freigegeben_am || b.erstellt_am || 0) - new Date(a.freigegeben_am || a.erstellt_am || 0))
      .slice(0, 5)

    // Beliebt: nach Produkt-Bewertung sortiert, Top 5
    const beliebt = [...alle]
      .map((p) => {
        const r = ratings[p.id]
        return { p, avg: r && r.anzahl > 0 ? r.summe / r.anzahl : null }
      })
      .sort((a, b) => (b.avg ?? -1) - (a.avg ?? -1))
      .slice(0, 5)
      .map((x) => x.p)

    if (neueContainer) {
      neueContainer.innerHTML = neu.length > 0
        ? neu.map((p) => produktKarte(p, ratings)).join('')
        : '<p class="empty-state">Noch keine neuen Produkte.</p>'
    }

    if (beliebtContainer) {
      beliebtContainer.innerHTML = beliebt.length > 0
        ? beliebt.map((p) => produktKarte(p, ratings)).join('')
        : '<p class="empty-state">Noch keine Produkte verfügbar.</p>'
    }

  } catch (err) {
    console.error('Produkte konnten nicht geladen werden:', err)
    const msg = '<p class="empty-state">Produkte konnten gerade nicht geladen werden.</p>'
    if (neueContainer)    neueContainer.innerHTML    = msg
    if (beliebtContainer) beliebtContainer.innerHTML = msg
  }
}

initMobileMenu()
initHeaderSearch()
ladeKategorien()
ladeProdukte()
