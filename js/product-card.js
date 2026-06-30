// js/product-card.js — Gemeinsames Produkt-Karten-Rendering für alle Seiten

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

function esc (value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Prüft ob ein Angebot gerade aktiv ist
export function isSaleAktiv (p) {
  if (!p.angebotspreis || p.angebotspreis <= 0) return false
  if (p.angebotspreis >= p.preis) return false // kein Rabatt
  const now = new Date()
  if (p.angebot_von && now < new Date(p.angebot_von)) return false
  if (p.angebot_bis && now > new Date(p.angebot_bis + 'T23:59:59')) return false
  return true
}

function neuBadge (p) {
  if (p.verfuegbar === false || p.freigegeben !== true) return ''
  if (isSaleAktiv(p))
    return '<span class="product-card__badge product-card__badge--sale">SALE</span>'
  const t = new Date(p.freigegeben_am || p.erstellt_am || 0).getTime()
  if (!t) return ''
  return (Date.now() - t) < 7 * 24 * 60 * 60 * 1000
    ? '<span class="product-card__badge product-card__badge--neu">NEU</span>'
    : ''
}

/**
 * Lädt Produkt-Bewertungen für eine Liste von produkt_ids.
 * Bewertungen gehören immer zu einem Produkt, nie zu einem Shop direkt.
 * @param {object} supabase   - Supabase-Client
 * @param {string[]} produktIds - Array von UUIDs
 * @returns {object} ratings - { [produkt_id]: { summe, anzahl } }
 */
export async function fetchProductRatings (supabase, produktIds) {
  const ratings = {}
  if (!produktIds?.length) return ratings
  try {
    const { data } = await supabase
      .from('bewertungen')
      .select('produkt_id, sterne')
      .in('produkt_id', produktIds)
    ;(data || []).forEach(b => {
      const r = ratings[b.produkt_id] || (ratings[b.produkt_id] = { summe: 0, anzahl: 0 })
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
 * @param {boolean} wunschliste - Optional: ob das Produkt aktuell auf der Wunschliste des Kunden ist (zeigt Herz)
 */
export function renderProductCard (p, shopName, rating = null, wunschliste = false) {
  const id = encodeURIComponent(p.id)
  const bilder = Array.isArray(p.bilder) ? p.bilder.filter(Boolean) : []
  const bild = bilder[0]
    ? `<img class="product-card__image" src="${esc(bilder[0])}" alt="${esc(p.titel)}" loading="lazy">`
    : '<div class="product-card__image" style="background:var(--color-bg-soft);width:100%;height:100%"></div>'
  const preis = (p.preis !== null && p.preis !== undefined) ? euro.format(p.preis) : ''
  const sale = isSaleAktiv(p)
  const preisHtml = sale
    ? `<span class="product-card__price-alt">${esc(preis)}</span><span class="product-card__price product-card__price--sale">${euro.format(p.angebotspreis)}</span>`
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

  const herzBtn = `<button class="product-card__wish${wunschliste ? ' is-active' : ''}" type="button" data-wunschliste-produkt="${id}" aria-label="${wunschliste ? 'Von Wunschliste entfernen' : 'Zur Wunschliste hinzufügen'}" aria-pressed="${wunschliste ? 'true' : 'false'}">
    <svg viewBox="0 0 24 24" width="18" height="18" fill="${wunschliste ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z"/></svg>
  </button>`

  return `
    <div class="product-card">
      <a class="product-card__img-link" href="produkt.html?id=${id}">
        <div class="product-card__img-wrap">
          ${neuBadge(p)}
          ${herzBtn}
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

/**
 * Initialisiert alle Wunschlisten-Herzen innerhalb eines Containers.
 * Nicht eingeloggte Besucher werden zur Registrierung weitergeleitet.
 * @param {object} supabase
 * @param {Element} root - Container, der .product-card__wish Buttons enthält (Standard: document)
 */
export function initWunschlisteButtons (supabase, root) {
  (root || document).querySelectorAll('[data-wunschliste-produkt]').forEach((btn) => {
    if (btn.dataset.wunschlisteInit) return
    btn.dataset.wunschlisteInit = '1'
    btn.addEventListener('click', async (e) => {
      e.preventDefault()
      e.stopPropagation()
      const produktId = btn.dataset.wunschlisteProdukt

      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        window.location.href = `haendler-werden.html?rolle=kunde&weiter=${encodeURIComponent(window.location.href)}`
        return
      }

      const aktiv = btn.classList.contains('is-active')
      btn.disabled = true
      try {
        if (aktiv) {
          await supabase.from('wunschliste').delete().eq('user_id', session.user.id).eq('produkt_id', produktId)
          btn.classList.remove('is-active')
          btn.setAttribute('aria-pressed', 'false')
          btn.setAttribute('aria-label', 'Zur Wunschliste hinzufügen')
          btn.querySelector('svg').setAttribute('fill', 'none')
        } else {
          await supabase.from('wunschliste').insert({ user_id: session.user.id, produkt_id: produktId })
          btn.classList.add('is-active')
          btn.setAttribute('aria-pressed', 'true')
          btn.setAttribute('aria-label', 'Von Wunschliste entfernen')
          btn.querySelector('svg').setAttribute('fill', 'currentColor')
        }
      } catch (err) {
        console.error('Wunschliste konnte nicht aktualisiert werden:', err)
      } finally {
        btn.disabled = false
      }
    })
  })
}

/**
 * Lädt die Wunschlisten-IDs des eingeloggten Kunden (leeres Set wenn nicht eingeloggt).
 * @param {object} supabase
 * @returns {Promise<Set<string>>}
 */
export async function fetchWunschlisteIds (supabase) {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return new Set()
    const { data } = await supabase.from('wunschliste').select('produkt_id').eq('user_id', session.user.id)
    return new Set((data || []).map((w) => w.produkt_id))
  } catch {
    return new Set()
  }
}
