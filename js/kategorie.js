// js/kategorie.js — SIB Kategorie-/Produktübersicht v7
// Filter clientseitig, Pagination (20 pro Seite), Sale-Filter

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'
import { renderProductCard, fetchProductRatings, initWunschlisteButtons, fetchWunschlisteIds } from './product-card.js'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const PAGE_SIZE = 20

function esc (value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function preisOf (p) {
  const n = Number(p.preis)
  return isNaN(n) ? 0 : n
}

function istNeu (p) {
  const t = new Date(p.freigegeben_am || p.erstellt_am || 0).getTime()
  return t > 0 && (Date.now() - t) < 7 * 24 * 60 * 60 * 1000
}

// Mobile-Menü
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

function getParams () {
  return new URLSearchParams(window.location.search)
}

// Zustand
let alleProdukte = []
let aktiverSlug = null
let haendlerById = {}
let shopRatings = {}
let wunschlisteIds = new Set()
let aktuelleSeite = 1

const state = {
  min: null,
  max: null,
  nurVerfuegbar: true,
  nurSale: false,
  haendler: '',
  sort: 'neu'
}

// Sidebar
function renderSidebar (kategorien, slug) {
  const nav = document.getElementById('kategorie-nav')
  const isNeu = slug === 'neu'
  const links = [
    `<a class="kategorie-sidebar__link${!slug ? ' is-active' : ''}" href="kategorie.html">Alle Produkte</a>`,
    `<a class="kategorie-sidebar__link${isNeu ? ' is-active' : ''}" href="kategorie.html?slug=neu">Neu</a>`,
    ...kategorien.map((k) => {
      const ks = encodeURIComponent(k.slug || k.id)
      const aktiv = slug && !isNeu && k.slug === slug
      return `<a class="kategorie-sidebar__link${aktiv ? ' is-active' : ''}" href="kategorie.html?slug=${ks}">${esc(k.name)}</a>`
    })
  ]
  nav.innerHTML = links.join('')
}

// Filtern + Sortieren
function gefilterteListe () {
  let list = alleProdukte.slice()

  if (aktiverSlug === 'neu') list = list.filter(istNeu)
  if (state.nurVerfuegbar) list = list.filter((p) => p.verfuegbar !== false)
  if (state.nurSale) list = list.filter((p) => p.angebot_preis != null && Number(p.angebot_preis) > 0)
  if (state.haendler) list = list.filter((p) => p.shop_id === state.haendler)
  if (state.min !== null) list = list.filter((p) => preisOf(p) >= state.min)
  if (state.max !== null) list = list.filter((p) => preisOf(p) <= state.max)

  if (state.sort === 'preis-asc') list.sort((a, b) => preisOf(a) - preisOf(b))
  else if (state.sort === 'preis-desc') list.sort((a, b) => preisOf(b) - preisOf(a))
  else list.sort((a, b) => String(b.erstellt_am || '').localeCompare(String(a.erstellt_am || '')))

  return list
}

// Rendern mit Pagination
function renderProdukte (produkte, seite) {
  const container = document.getElementById('produkte')
  const mehrBtn = document.getElementById('kat-mehr-btn')
  const mehrWrap = document.getElementById('kat-mehr-wrap')

  if (produkte.length === 0) {
    container.innerHTML = '<p class="kategorie-empty">Keine Produkte für diese Auswahl gefunden.</p>'
    if (mehrWrap) mehrWrap.hidden = true
    return
  }

  const sichtbar = produkte.slice(0, seite * PAGE_SIZE)
  const hatMehr = sichtbar.length < produkte.length

  container.innerHTML = sichtbar.map((p) => renderProductCard(
    p,
    p.shops?.name || 'Lokaler Händler',
    shopRatings[p.id] || null,
    wunschlisteIds.has(p.id)
  )).join('')
  initWunschlisteButtons(supabase, container)

  if (mehrWrap) mehrWrap.hidden = !hatMehr
  if (mehrBtn && hatMehr) {
    mehrBtn.textContent = `Mehr anzeigen (${produkte.length - sichtbar.length} weitere)`
  }
}

function renderTags () {
  const el = document.getElementById('filter-tags')
  const tags = []
  if (state.min !== null) tags.push({ key: 'min', label: `ab ${euro.format(state.min)}` })
  if (state.max !== null) tags.push({ key: 'max', label: `bis ${euro.format(state.max)}` })
  if (state.haendler) tags.push({ key: 'haendler', label: haendlerById[state.haendler] || 'Händler' })
  if (!state.nurVerfuegbar) tags.push({ key: 'verfuegbar', label: 'inkl. nicht verfügbare' })
  if (state.nurSale) tags.push({ key: 'sale', label: 'Sale' })

  el.innerHTML = tags.map((t) =>
    `<button class="kat-tag" type="button" data-remove="${t.key}">${esc(t.label)} <span aria-hidden="true">×</span></button>`
  ).join('')

  el.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', () => entferneFilter(btn.dataset.remove))
  })
}

function entferneFilter (key) {
  if (key === 'min') { state.min = null; document.getElementById('filter-min').value = '' }
  else if (key === 'max') { state.max = null; document.getElementById('filter-max').value = '' }
  else if (key === 'haendler') { state.haendler = ''; document.getElementById('filter-haendler').value = '' }
  else if (key === 'verfuegbar') { state.nurVerfuegbar = true; document.getElementById('filter-verfuegbar').checked = true }
  else if (key === 'sale') { state.nurSale = false; document.getElementById('filter-sale').checked = false }
  anwenden()
}

function updateURL () {
  const params = new URLSearchParams()
  if (aktiverSlug) params.set('slug', aktiverSlug)
  if (state.min !== null) params.set('min', String(state.min))
  if (state.max !== null) params.set('max', String(state.max))
  if (!state.nurVerfuegbar) params.set('verf', '0')
  if (state.nurSale) params.set('sale', '1')
  if (state.haendler) params.set('shop', state.haendler)
  if (state.sort !== 'neu') params.set('sort', state.sort)
  const qs = params.toString()
  window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
}

function anwenden (resetSeite = true) {
  if (resetSeite) aktuelleSeite = 1
  const liste = gefilterteListe()
  document.getElementById('kategorie-anzahl').textContent =
    `${liste.length} ${liste.length === 1 ? 'Produkt' : 'Produkte'}`
  renderProdukte(liste, aktuelleSeite)
  renderTags()
  updateURL()
}

function fuelleHaendler () {
  const select = document.getElementById('filter-haendler')
  const seen = {}
  alleProdukte.forEach((p) => {
    if (p.shop_id && p.shops?.name && !seen[p.shop_id]) {
      seen[p.shop_id] = true
      haendlerById[p.shop_id] = p.shops.name
    }
  })
  const namen = Object.keys(haendlerById).sort((a, b) => haendlerById[a].localeCompare(haendlerById[b]))
  namen.forEach((id) => {
    const opt = document.createElement('option')
    opt.value = id
    opt.textContent = haendlerById[id]
    select.appendChild(opt)
  })
  select.value = state.haendler || ''
}

function initFilterControls () {
  const min = document.getElementById('filter-min')
  const max = document.getElementById('filter-max')
  const verf = document.getElementById('filter-verfuegbar')
  const sale = document.getElementById('filter-sale')
  const haendler = document.getElementById('filter-haendler')
  const sort = document.getElementById('filter-sort')
  const mehrBtn = document.getElementById('kat-mehr-btn')

  document.getElementById('preis-anwenden').addEventListener('click', () => {
    state.min = isNaN(parseFloat(min.value)) ? null : parseFloat(min.value)
    state.max = isNaN(parseFloat(max.value)) ? null : parseFloat(max.value)
    anwenden()
  })

  ;[min, max].forEach(el => {
    el.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById('preis-anwenden').click()
    })
  })

  document.getElementById('filter-reset').addEventListener('click', () => {
    state.min = null; state.max = null; state.nurVerfuegbar = true
    state.nurSale = false; state.haendler = ''; state.sort = 'neu'
    min.value = ''; max.value = ''; verf.checked = true
    sale.checked = false; haendler.value = ''; sort.value = 'neu'
    anwenden()
  })

  verf.addEventListener('change', () => { state.nurVerfuegbar = verf.checked; anwenden() })
  sale.addEventListener('change', () => { state.nurSale = sale.checked; anwenden() })
  haendler.addEventListener('change', () => { state.haendler = haendler.value; anwenden() })
  sort.addEventListener('change', () => { state.sort = sort.value; anwenden() })

  if (mehrBtn) {
    mehrBtn.addEventListener('click', () => {
      aktuelleSeite++
      renderProdukte(gefilterteListe(), aktuelleSeite)
    })
  }

  const toggle = document.getElementById('filter-toggle')
  const sidebar = document.getElementById('kategorie-sidebar')
  toggle.addEventListener('click', () => {
    const open = sidebar.classList.toggle('is-open')
    toggle.setAttribute('aria-expanded', String(open))
  })
}

function syncControlsFromState () {
  document.getElementById('filter-min').value = state.min !== null ? state.min : ''
  document.getElementById('filter-max').value = state.max !== null ? state.max : ''
  document.getElementById('filter-verfuegbar').checked = state.nurVerfuegbar
  document.getElementById('filter-sale').checked = state.nurSale
  document.getElementById('filter-sort').value = state.sort
}

function leseStateAusURL (params) {
  const min = parseFloat(params.get('min'))
  const max = parseFloat(params.get('max'))
  state.min = isNaN(min) ? null : min
  state.max = isNaN(max) ? null : max
  state.nurVerfuegbar = params.get('verf') !== '0'
  state.nurSale = params.get('sale') === '1'
  state.haendler = params.get('shop') || ''
  const sort = params.get('sort')
  state.sort = ['preis-asc', 'preis-desc'].includes(sort) ? sort : 'neu'
}

// Init
async function init () {
  initMobileMenu()
  initHeaderSearch()

  const params = getParams()
  const slug = params.get('slug')
  aktiverSlug = slug || null
  leseStateAusURL(params)
  initFilterControls()
  syncControlsFromState()

  const titelEl = document.getElementById('kategorie-titel')

  try {
    const { data: katData } = await supabase
      .from('kategorien')
      .select('id, name, slug')
      .order('name')
    const kategorien = katData || []
    renderSidebar(kategorien, slug)

    let aktiveKat = null
    if (slug) aktiveKat = kategorien.find((k) => k.slug === slug) || null

    const isNeu = slug === 'neu'
    titelEl.textContent = isNeu
      ? 'Neue Produkte'
      : (aktiveKat ? aktiveKat.name : (slug ? 'Kategorie' : 'Alle Produkte'))
    if (isNeu) document.title = 'Neue Produkte — Shoppen in Braunschweig'
    else if (slug && aktiveKat) document.title = `${aktiveKat.name} — Shoppen in Braunschweig`

    let query = supabase
      .from('produkte')
      .select('*, shops(name, slug)')
      .eq('freigegeben', true)
      .order('erstellt_am', { ascending: false })

    if (aktiveKat) query = query.eq('kategorie_id', aktiveKat.id)
    else if (slug && !isNeu) query = query.eq('kategorie_id', '00000000-0000-0000-0000-000000000000')

    const { data, error } = await query
    if (error) throw error
    alleProdukte = data || []

    const produktIds = alleProdukte.map(p => p.id)
    ;[shopRatings, wunschlisteIds] = await Promise.all([
      fetchProductRatings(supabase, produktIds),
      fetchWunschlisteIds(supabase)
    ])

    fuelleHaendler()
    anwenden()
  } catch (err) {
    console.error('Produkte konnten nicht geladen werden:', err)
    document.getElementById('kategorie-anzahl').textContent = ''
    document.getElementById('produkte').innerHTML =
      '<p class="kategorie-empty">Produkte konnten gerade nicht geladen werden.</p>'
  }
}

init()
