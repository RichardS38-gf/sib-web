// js/index.js — SIB Startseite
// Lädt Kategorien und neue Produkte live aus Supabase.

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'
import { renderProductCard, fetchProductRatings, fetchFarbenByProdukt, expandiereFarbvarianten, initWunschlisteButtons, fetchWunschlisteIds } from './product-card.js?v=5'

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
        ? `<div class="category-card__img-wrap"><img class="category-card__image" src="${esc(k.bild_url)}" alt="${esc(k.name)}" loading="lazy"></div>`
        : '<div class="category-card__img-wrap"><div class="category-card__image"></div></div>'
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
function produktKarte (p, ratings, wunschlisteIds, farbe = null) {
  const rating = ratings?.[p.id] || null
  return renderProductCard(p, p.shops?.name || 'Lokaler Händler', rating, wunschlisteIds?.has(p.id), farbe)
}

// ── 4. Produkte: Neue und Beliebte als zwei separate Sektionen ──
// "Beliebt" = tatsächlich am meisten aufgerufene Artikel (siehe aufrufe-Spalte
// + produkt.js, das bei jedem Seitenaufruf hochzählt) -- dafür eigene Abfrage,
// nicht nur unter den neuesten 12 Produkten ausgewählt.
async function ladeProdukte () {
  const neueContainer    = document.getElementById('neue-produkte')
  const beliebtContainer = document.getElementById('beliebte-produkte')
  if (!neueContainer && !beliebtContainer) return

  try {
    const [{ data: neuData, error: neuErr }, { data: beliebtData, error: beliebtErr }] = await Promise.all([
      supabase
        .from('produkte')
        .select('*, shops(name, slug)')
        .eq('verfuegbar', true)
        .eq('freigegeben', true)
        .order('erstellt_am', { ascending: false })
        .limit(5),
      supabase
        .from('produkte')
        .select('*, shops(name, slug)')
        .eq('verfuegbar', true)
        .eq('freigegeben', true)
        .gt('aufrufe', 0)
        .order('aufrufe', { ascending: false })
        .limit(5)
    ])

    if (neuErr) throw neuErr
    if (beliebtErr) throw beliebtErr

    const neuProdukte = neuData || []
    const beliebtProdukte = beliebtData || []

    if (neuProdukte.length === 0 && beliebtProdukte.length === 0) {
      const msg = '<p class="empty-state">Noch keine Produkte verfügbar.</p>'
      if (neueContainer)    neueContainer.innerHTML    = msg
      if (beliebtContainer) beliebtContainer.innerHTML = msg
      return
    }

    // Farbvarianten + Bewertungen + Wunschliste für beide Listen zusammen laden
    const alleFuerMeta = [...neuProdukte, ...beliebtProdukte]
    const produktIds = [...new Set(alleFuerMeta.map(p => p.id))]
    const [ratings, wunschlisteIds, farbenByProdukt] = await Promise.all([
      fetchProductRatings(supabase, produktIds),
      fetchWunschlisteIds(supabase),
      fetchFarbenByProdukt(supabase, produktIds)
    ])

    // Jede Farbvariante wird zu einem eigenen Karten-Eintrag (Produkte ohne
    // Farbvarianten bleiben ein einzelner Eintrag).
    const neu = expandiereFarbvarianten(neuProdukte, farbenByProdukt).slice(0, 5)
    const beliebt = expandiereFarbvarianten(beliebtProdukte, farbenByProdukt).slice(0, 5)

    if (neueContainer) {
      neueContainer.innerHTML = neu.length > 0
        ? neu.map((e) => produktKarte(e.produkt, ratings, wunschlisteIds, e.farbe)).join('')
        : '<p class="empty-state">Noch keine neuen Produkte.</p>'
    }

    if (beliebtContainer) {
      beliebtContainer.innerHTML = beliebt.length > 0
        ? beliebt.map((e) => produktKarte(e.produkt, ratings, wunschlisteIds, e.farbe)).join('')
        : '<p class="empty-state">Noch keine Aufrufe gesammelt.</p>'
    }

    initWunschlisteButtons(supabase)

  } catch (err) {
    console.error('Produkte konnten nicht geladen werden:', err)
    const msg = '<p class="empty-state">Produkte konnten gerade nicht geladen werden.</p>'
    if (neueContainer)    neueContainer.innerHTML    = msg
    if (beliebtContainer) beliebtContainer.innerHTML = msg
  }
}

// ── Newsletter-Anmeldung im Hero ──
function isValidEmail (email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

async function initHeroNewsletter () {
  const form = document.getElementById('hero-newsletter-form')
  const feedback = document.getElementById('hero-newsletter-feedback')
  if (!form) return

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    feedback.innerHTML = ''
    const email = form.email.value.trim().toLowerCase()

    if (!isValidEmail(email)) {
      feedback.innerHTML = '<div class="error-msg">Bitte gib eine gültige E-Mail-Adresse ein.</div>'
      return
    }

    const submitBtn = form.querySelector('button[type="submit"]')
    submitBtn.disabled = true
    submitBtn.textContent = 'Wird angemeldet…'

    try {
      const { error } = await supabase
        .from('newsletter_abonnenten')
        .insert({ email, aktiv: true })

      if (error) {
        if (error.code === '23505') {
          form.innerHTML = '<div class="success-msg">✓ Du bist bereits angemeldet.</div>'
          return
        }
        throw error
      }
      form.innerHTML = '<div class="success-msg">✓ Du bist dabei! Ab dem nächsten Newsletter hörst du von uns.</div>'
    } catch (err) {
      console.error('Newsletter:', err)
      feedback.innerHTML = '<div class="error-msg">Anmeldung fehlgeschlagen. Bitte versuche es später erneut.</div>'
      submitBtn.disabled = false
      submitBtn.textContent = 'Newsletter abonnieren'
    }
  })
}

initMobileMenu()
initHeaderSearch()
ladeKategorien()
ladeProdukte()
initHeroNewsletter()
