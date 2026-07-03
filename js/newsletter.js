// js/newsletter.js v4 — SIB Monatsausgabe

import { supabase } from './supabase.js'
import { renderProductCard, initWunschlisteButtons, fetchWunschlisteIds, fetchProductRatings } from './product-card.js'

const SALE_IDS = [
  'd8485a10-a907-4ae5-9aa9-246b8ea2dae7' // Leder-Handtasche
]

const PRODUKT_IDS = [
  '55563f59-dae1-4883-9be8-31dabc79b600',
  '5da6f0ff-43c1-40c9-90c1-4f6333c28d6e',
  'd8485a10-a907-4ae5-9aa9-246b8ea2dae7'
]

// Mobile-Menue
const burger = document.querySelector('.site-header__burger')
const mobileMenu = document.getElementById('mobile-menu')
if (burger && mobileMenu) {
  burger.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') === 'true'
    burger.setAttribute('aria-expanded', String(!open))
    mobileMenu.hidden = open
  })
}

// Produkte laden und rendern
async function ladeProdukte () {
  const container = document.getElementById('nl-produkte-grid')
  if (!container) return

  try {
    const { data, error } = await supabase
      .from('produkte')
      .select('*, shops(name, slug)')
      .in('id', PRODUKT_IDS)

    if (error) throw error
    const produkte = data || []

    // Reihenfolge wie in PRODUKT_IDS beibehalten
    const sortiert = PRODUKT_IDS.map(id => produkte.find(p => p.id === id)).filter(Boolean)

    const produktIds = sortiert.map(p => p.id)
    const [ratings, wunschlisteIds] = await Promise.all([
      fetchProductRatings(supabase, produktIds),
      fetchWunschlisteIds(supabase)
    ])

    container.innerHTML = sortiert.map(p =>
      renderProductCard(p, p.shops?.name || 'Amelie Fair Fashion', ratings[p.id] || null, wunschlisteIds.has(p.id))
    ).join('')

    initWunschlisteButtons(supabase, container)
  } catch (err) {
    console.error('Newsletter-Produkte konnten nicht geladen werden:', err)
    container.innerHTML = ''
  }
}

ladeProdukte()
ladeSaleBilder()

async function ladeSaleBilder () {
  const { data } = await supabase
    .from('produkte')
    .select('id, bilder, preis, angebotspreis')
    .in('id', SALE_IDS)
  if (!data) return
  const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
  data.forEach(p => {
    const card = document.querySelector(`a[href="produkt.html?id=${p.id}"]`)
    if (!card) return
    // Bild
    const img = card.querySelector('.nl-sale-card__img-wrap img')
    if (img && p.bilder?.[0]) img.src = p.bilder[0]
    // Preise
    const preisWrap = card.querySelector('.nl-sale-card__prices')
    if (preisWrap && p.angebotspreis && p.angebotspreis < p.preis) {
      const rabatt = Math.round((1 - p.angebotspreis / p.preis) * 100)
      preisWrap.innerHTML = `
        <span class="nl-sale-card__price-new">${euro.format(p.angebotspreis)}</span>
        <span class="nl-sale-card__price-old">${euro.format(p.preis)}</span>
        <span class="nl-sale-card__discount">−${rabatt} %</span>
      `
    } else if (preisWrap && p.preis) {
      preisWrap.innerHTML = `<span class="nl-sale-card__price-new">${euro.format(p.preis)}</span>`
    }
  })
}
