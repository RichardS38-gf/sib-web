// js/product-card.js — Gemeinsames Produkt-Karten-Rendering für alle Seiten

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
  if (p.vergleichspreis && p.vergleichspreis > p.preis)
    return '<span class="product-card__badge product-card__badge--sale">SALE</span>'
  const t = new Date(p.freigegeben_am || p.erstellt_am || 0).getTime()
  if (!t) return ''
  return (Date.now() - t) < 7 * 24 * 60 * 60 * 1000
    ? '<span class="product-card__badge product-card__badge--neu">NEU</span>'
    : ''
}

/**
 * Lädt Shop-Bewertungen für eine Liste von shop_ids.
 * @param {object} supabase  - Supabase-Client
 * @param {string[]} shopIds - Array von UUIDs
 * @returns {object} ratings - { [shop_id]: { summe, anzahl } }
 */
export async function fetchShopRatings (supabase, shopIds) {
  const ratings = {}
  if (!shopIds?.length) return ratings
  try {
    const { data } = await supabase
      .from('bewertungen')
      .select('shop_id, sterne')
      .in('shop_id', shopIds)
    ;(data || []).forEach(b => {
      const r = ratings[b.shop_id] || (ratings[b.shop_id] = { summe: 0, anzahl: 0 })
      r.summe += (b.sterne || 0)
      r.anzahl += 1
    })
  } catch (e) { console.error('Ratings laden:', e) }
  return ratings
}

/**
 * @param {object} p           - Produkt-Objekt aus Supabase
 * @param {string} shopName    - Anzeigename des Shops
 * @param {object|null} rating - Optional: { summe, anzahl } vom Shop
 */
export function renderProductCard (p, shopName, rating = null) {
  const id = encodeURIComponent(p.id)
  const bilder = Array.isArray(p.bilder) ? p.bilder.filter(Boolean) : []
  const bild = bilder[0]
    ? `<img class="product-card__image" src="${esc(bilder[0])}" alt="${esc(p.titel)}" loading="lazy">`
    : '<div class="product-card__image" style="background:var(--color-bg-soft);width:100%;height:100%"></div>'
  const preis = (p.preis !== null && p.preis !== undefined) ? euro.format(p.preis) : ''
  const istSale = p.vergleichspreis && p.vergleichspreis > p.preis
  const preisHtml = istSale
    ? `<span class="product-card__price product-card__price--sale">${esc(preis)}</span>
       <span class="product-card__price-alt">${euro.format(p.vergleichspreis)}</span>`
    : `<span class="product-card__price">${esc(preis)}</span>`
  const shop = shopName || p.shops?.name || 'Lokaler Händler'

  // Sterne — immer anzeigen, Platzhalter wenn keine Daten
  const ratingHtml = (rating && rating.anzahl > 0)
    ? `<div class="product-card__rating">
        <span class="product-card__stars">★</span>
        <span class="product-card__rating-val">${(rating.summe / rating.anzahl).toFixed(1).replace('.', ',')}</span>
        <span class="product-card__rating-count">(${rating.anzahl})</span>
       </div>`
    : `<div class="product-card__rating">
        <span class="product-card__stars">★</span>
        <span class="product-card__rating-count">Noch keine Bewertungen (0)</span>
       </div>`

  return `
    <div class="product-card">
      <a class="product-card__img-link" href="produkt.html?id=${id}">
        <div class="product-card__img-wrap">
          ${neuBadge(p)}
          ${bild}
        </div>
      </a>
      <div class="product-card__body">
        <a class="product-card__content" href="produkt.html?id=${id}">
          <span class="product-card__shop">${esc(shop)}</span>
          <span class="product-card__title">${esc(p.titel)}</span>
          ${ratingHtml}
        </a>
        <div class="product-card__prices">${preisHtml}</div>
      </div>
    </div>`
}
