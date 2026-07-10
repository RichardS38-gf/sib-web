// js/newsletter.js v6 — SIB Monatsausgabe (aktualisiert sich automatisch)
//
// Monat, Ausgabe-Nummer und Inhalte werden nicht mehr hart im Code hinterlegt.
// - Monat/Ausgabe kommen aus js/newsletter-zeitraum.js (rein aus dem Datum berechnet).
// - "Neu eingetroffen" + "Sonderangebote" kommen aus der Tabelle
//   newsletter_eintraege, die Händler über ihr Dashboard pflegen.
// - "Neu beigetreten" sind alle aktiven Shops, die in den letzten
//   NEU_SHOPS_WOCHEN Wochen angelegt wurden.

import { supabase } from './supabase.js'
import { renderProductCard, initWunschlisteButtons, fetchWunschlisteIds, fetchProductRatings } from './product-card.js'
import { aktuelleAusgabe, monatDatum, monatName, ausgabeNummer } from './newsletter-zeitraum.js'

// Wie viele Wochen zurück ein Shop noch als "neu beigetreten" gilt.
const NEU_SHOPS_WOCHEN = 4

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

function esc (value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

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

// ── Hero + Meta: Monat/Ausgabe automatisch setzen ──
function setzeAusgabeMeta () {
  const ausgabe = aktuelleAusgabe()
  const monat = monatName(ausgabe)
  const nummer = String(ausgabeNummer(ausgabe)).padStart(2, '0')

  const bg = document.getElementById('nl-monat-bg')
  if (bg) bg.textContent = monat

  const label = document.getElementById('nl-ausgabe')
  if (label) label.textContent = `Ausgabe ${nummer} · ${monat} ${ausgabe.jahr}`

  document.title = `${monat} ${ausgabe.jahr} — Shoppen in Braunschweig`
  const metaDesc = document.querySelector('meta[name="description"]')
  if (metaDesc) {
    metaDesc.setAttribute('content', `Neue Produkte, Sonderangebote und frische Geschäfte aus Braunschweig — ${monat} ${ausgabe.jahr}.`)
  }

  return monatDatum(ausgabe)
}

// Neu eingetroffene Artikel — von Händlern für diese Ausgabe eingetragen
async function ladeProdukte (monatStr) {
  const container = document.getElementById('nl-produkte-grid')
  if (!container) return
  try {
    const { data, error } = await supabase
      .from('newsletter_eintraege')
      .select('produkte!inner(*, shops(name, slug))')
      .eq('typ', 'neu')
      .eq('monat', monatStr)
      .eq('produkte.freigegeben', true)
      .eq('produkte.verfuegbar', true)
    if (error) throw error

    const produkte = (data || []).map((e) => e.produkte).filter(Boolean)
    if (produkte.length === 0) {
      container.innerHTML = '<p class="nl-empty">Diesen Monat noch keine neuen Artikel — schau bald wieder vorbei.</p>'
      return
    }

    const ids = produkte.map((p) => p.id)
    const [ratings, wunschlisteIds] = await Promise.all([
      fetchProductRatings(supabase, ids),
      fetchWunschlisteIds(supabase)
    ])
    container.innerHTML = produkte.map((p) =>
      renderProductCard(p, p.shops?.name, ratings[p.id] || null, wunschlisteIds.has(p.id))
    ).join('')
    initWunschlisteButtons(supabase, container)
  } catch (err) {
    console.error('Newsletter-Produkte:', err)
    container.innerHTML = '<p class="nl-empty">Artikel konnten nicht geladen werden.</p>'
  }
}

// Sonderangebote & Sale — ebenfalls von Händlern für diese Ausgabe eingetragen
async function ladeSale (monatStr) {
  const container = document.getElementById('nl-sale-grid')
  if (!container) return
  try {
    const { data, error } = await supabase
      .from('newsletter_eintraege')
      .select('produkte!inner(*, shops(name))')
      .eq('typ', 'sale')
      .eq('monat', monatStr)
      .eq('produkte.freigegeben', true)
      .eq('produkte.verfuegbar', true)
    if (error) throw error

    const produkte = (data || []).map((e) => e.produkte).filter(Boolean)
    if (produkte.length === 0) {
      container.innerHTML = '<p class="nl-empty nl-empty--dark">Diesen Monat keine Sonderangebote.</p>'
      return
    }

    const ratings = await fetchProductRatings(supabase, produkte.map((p) => p.id))

    container.innerHTML = produkte.map((p) => {
      const bild = p.bilder?.[0] || ''
      let preisHtml = `<span class="nl-sale-card__price-new">${euro.format(p.preis)}</span>`
      if (p.angebotspreis && p.angebotspreis < p.preis) {
        const ersparnis = euro.format(p.preis - p.angebotspreis)
        preisHtml = `
          <span class="nl-sale-card__price-new">${euro.format(p.angebotspreis)}</span>
          <span class="nl-sale-card__price-old">${euro.format(p.preis)}</span>
          <span class="nl-sale-card__discount">-${ersparnis}</span>`
      }
      const r = ratings[p.id]
      const ratingHtml = r && r.anzahl > 0
        ? `<p class="nl-sale-card__rating"><span class="nl-sale-card__stars">★</span> ${(r.summe / r.anzahl).toFixed(1).replace('.', ',')} <span class="nl-sale-card__rating-count">(${r.anzahl})</span></p>`
        : `<p class="nl-sale-card__rating nl-sale-card__rating--empty"><span class="nl-sale-card__stars">★</span> Noch keine Bewertungen</p>`

      return `
        <a class="nl-sale-card" href="produkt.html?id=${encodeURIComponent(p.id)}">
          <div class="nl-sale-card__img-wrap">
            <img src="${esc(bild)}" alt="${esc(p.titel)}" loading="lazy">
          </div>
          <div class="nl-sale-card__body">
            <p class="nl-sale-card__shop">${esc(p.shops?.name || 'Lokaler Händler')}</p>
            <p class="nl-sale-card__name">${esc(p.titel)}</p>
            ${ratingHtml}
            <div class="nl-sale-card__prices">${preisHtml}</div>
          </div>
        </a>`
    }).join('')
  } catch (err) {
    console.error('Newsletter-Sale:', err)
    container.innerHTML = '<p class="nl-empty nl-empty--dark">Angebote konnten nicht geladen werden.</p>'
  }
}

// Neu beigetretene Shops: aktiv + in den letzten NEU_SHOPS_WOCHEN Wochen angelegt
async function ladeShops () {
  const container = document.getElementById('nl-shops-grid')
  if (!container) return
  try {
    const seit = new Date(Date.now() - NEU_SHOPS_WOCHEN * 7 * 24 * 60 * 60 * 1000).toISOString()
    const { data: shops, error } = await supabase
      .from('shops')
      .select('*')
      .eq('aktiv', true)
      .gte('erstellt_am', seit)
      .order('erstellt_am', { ascending: false })
    if (error) throw error

    if (!shops || shops.length === 0) {
      container.innerHTML = '<p class="nl-empty">Diesen Monat keine neuen Geschäfte — schau gerne bei allen unseren Händlern vorbei.</p>'
      return
    }

    const { data: produkte } = await supabase.from('produkte').select('shop_id')
    const anzahlByShop = {}
    ;(produkte || []).forEach((p) => { if (p.shop_id) anzahlByShop[p.shop_id] = (anzahlByShop[p.shop_id] || 0) + 1 })

    container.innerHTML = shops.map((s) => {
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
    container.innerHTML = '<p class="nl-empty">Geschäfte konnten nicht geladen werden.</p>'
  }
}

const monatStr = setzeAusgabeMeta()
ladeProdukte(monatStr)
ladeSale(monatStr)
ladeShops()
