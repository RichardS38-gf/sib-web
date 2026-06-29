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

export function renderProductCard (p, shopName) {
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
        </a>
        <div class="product-card__footer">
          <div class="product-card__prices">${preisHtml}</div>
          <a class="product-card__cart" href="reservierung.html?id=${id}" aria-label="Reservieren">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>
              <path d="M1 1h4l2.68 13.39a2 2 0 001.99 1.61h9.72a2 2 0 001.99-1.61L23 6H6"/>
            </svg>
          </a>
        </div>
      </div>
    </div>`
}
