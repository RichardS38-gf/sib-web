// js/newsletter.js v5 — SIB Monatsausgabe

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

// Produkte laden
async function ladeProdukte () {
  const container = document.getElementById('nl-produkte-grid')
  if (!container) return
  try {
    const { data, error } = await supabase
      .from('produkte')
      .select('*, shops(name, slug)')
      .in('id', PRODUKT_IDS)
    if (error) throw error
    const sortiert = PRODUKT_IDS.map(id => (data || []).find(p => p.id === id)).filter(Boolean)
    const [ratings, wunschlisteIds] = await Promise.all([
      fetchProductRatings(supabase, sortiert.map(p => p.id)),
      fetchWunschlisteIds(supabase)
    ])
    container.innerHTML = sortiert.map(p =>
      renderProductCard(p, p.shops?.name || 'Amelie Fair Fashion', ratings[p.id] || null, wunschlisteIds.has(p.id))
    ).join('')
    initWunschlisteButtons(supabase, container)
  } catch (err) {
    console.error('Newsletter-Produkte:', err)
    container.innerHTML = ''
  }
}

// Sale-Karten: Bild + Preise dynamisch befüllen
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
    const img = card.querySelector('.nl-sale-card__img-wrap img')
    if (img && p.bilder?.[0]) img.src = p.bilder[0]
    const preisWrap = card.querySelector('.nl-sale-card__prices')
    if (!preisWrap) return
    if (p.angebotspreis && p.angebotspreis < p.preis) {
      const ersparnis = euro.format(p.preis - p.angebotspreis)
      preisWrap.innerHTML = `
        <span class="nl-sale-card__price-new">${euro.format(p.angebotspreis)}</span>
        <span class="nl-sale-card__price-old">${euro.format(p.preis)}</span>
        <span class="nl-sale-card__discount">-${ersparnis}</span>
      `
    } else {
      preisWrap.innerHTML = `<span class="nl-sale-card__price-new">${euro.format(p.preis)}</span>`
    }
  })
}

// Shops laden
async function ladeShops () {
  const container = document.getElementById('nl-shops-grid')
  if (!container) return
  try {
    const [shopRes, prodRes] = await Promise.all([
      supabase.from('shops').select('*').eq('name', 'Amelie Fair Fashion').limit(1),
      supabase.from('produkte').select('shop_id')
    ])
    if (shopRes.error) throw shopRes.error
    const shops = shopRes.data || []
    if (shops.length === 0) { container.innerHTML = ''; return }
    const produkte = prodRes.data || []
    const anzahlByShop = {}
    produkte.forEach(p => { if (p.shop_id) anzahlByShop[p.shop_id] = (anzahlByShop[p.shop_id] || 0) + 1 })
    const esc = v => String(v ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
    container.innerHTML = shops.map(s => {
      const slug = encodeURIComponent(s.slug || s.id)
      const banner = s.banner_url
        ? `<img class="haendler-card__banner" src="${esc(s.banner_url)}" alt="${esc(s.name)}" loading="lazy">`
        : '<div class="haendler-card__banner"></div>'
      const logo = s.logo_url
        ? `<img class="haendler-card__logo" src="${esc(s.logo_url)}" alt="${esc(s.name)}" loading="lazy">`
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
            <p class="haendler-card__count">${anzahlByShop[s.id] || 0} Artikel</p>
          </div>
        </a>`
    }).join('')
  } catch (err) {
    console.error('Newsletter-Shops:', err)
    container.innerHTML = ''
  }
}

ladeProdukte()
ladeSaleBilder()
ladeShops()
