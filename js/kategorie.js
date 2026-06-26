// js/kategorie.js — SIB Kategorie-/Produktübersicht mit Filtern
// Produkte einer Kategorie (?slug=XXX) bzw. alle Produkte; Filter clientseitig,
// Zustand in URL-Parametern.

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

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

// "Neu"-Badge: nur für verfügbare, freigegebene Produkte < 7 Tage alt
function neuBadge (p) {
  if (p.verfuegbar === false || p.freigegeben !== true) return ''
  const t = new Date(p.freigegeben_am || p.erstellt_am || 0).getTime()
  if (!t) return ''
  return (Date.now() - t) < 7 * 24 * 60 * 60 * 1000
    ? '<span class="product-card__badge">NEU</span>'
    : ''
}

function istNeu (p) {
  const t = new Date(p.freigegeben_am || p.erstellt_am || 0).getTime()
  return t > 0 && (Date.now() - t) < 7 * 24 * 60 * 60 * 1000
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

function getParams () {
  return new URLSearchParams(window.location.search)
}

// Zustand
let alleProdukte = []
let aktiverSlug = null
let haendlerById = {} // shop_id -> name
const state = {
  min: null,
  max: null,
  nurVerfuegbar: true,
  haendler: '',
  sort: 'neu'
}

// ── Sidebar mit allen Kategorien ──
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

// ── Filter anwenden ──
function gefilterteListe () {
  let list = alleProdukte.slice()

  // Virtuelle "Neu"-Kategorie: nur Produkte < 7 Tage
  if (aktiverSlug === 'neu') list = list.filter(istNeu)

  if (state.nurVerfuegbar) list = list.filter((p) => p.verfuegbar !== false)
  if (state.haendler) list = list.filter((p) => p.shop_id === state.haendler)
  if (state.min !== null) list = list.filter((p) => preisOf(p) >= state.min)
  if (state.max !== null) list = list.filter((p) => preisOf(p) <= state.max)

  if (state.sort === 'preis-asc') list.sort((a, b) => preisOf(a) - preisOf(b))
  else if (state.sort === 'preis-desc') list.sort((a, b) => preisOf(b) - preisOf(a))
  else list.sort((a, b) => String(b.erstellt_am || '').localeCompare(String(a.erstellt_am || '')))

  return list
}

function renderProdukte (produkte) {
  const container = document.getElementById('produkte')
  if (produkte.length === 0) {
    container.innerHTML = '<p class="kategorie-empty">Keine Produkte für diese Auswahl gefunden.</p>'
    return
  }
  container.innerHTML = produkte.map((p) => {
    const id = encodeURIComponent(p.id)
    const bilder = Array.isArray(p.bilder) ? p.bilder.filter(Boolean) : []
    const bild = bilder[0]
      ? `<img class="product-card__image" src="${esc(bilder[0])}" alt="${esc(p.titel)}" loading="lazy">`
      : '<div class="product-card__image"></div>'
    const shopName = p.shops?.name || 'Lokaler Händler'
    const preis = (p.preis !== null && p.preis !== undefined) ? euro.format(p.preis) : ''
    const soldout = p.verfuegbar === false
      ? '<span class="product-card__soldout">Nicht verfügbar</span>'
      : ''
    return `
      <a class="product-card" href="produkt.html?id=${id}">
        ${neuBadge(p)}${bild}
        <span class="product-card__shop">${esc(shopName)}</span>
        <span class="product-card__title">${esc(p.titel)}</span>
        <span class="product-card__price">${esc(preis)}${soldout}</span>
      </a>`
  }).join('')
}

function renderTags () {
  const el = document.getElementById('filter-tags')
  const tags = []
  if (state.min !== null) tags.push({ key: 'min', label: `ab ${euro.format(state.min)}` })
  if (state.max !== null) tags.push({ key: 'max', label: `bis ${euro.format(state.max)}` })
  if (state.haendler) tags.push({ key: 'haendler', label: haendlerById[state.haendler] || 'Händler' })
  if (!state.nurVerfuegbar) tags.push({ key: 'verfuegbar', label: 'inkl. nicht verfügbare' })

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
  anwenden()
}

// Zustand -> URL
function updateURL () {
  const params = new URLSearchParams()
  if (aktiverSlug) params.set('slug', aktiverSlug)
  if (state.min !== null) params.set('min', String(state.min))
  if (state.max !== null) params.set('max', String(state.max))
  if (!state.nurVerfuegbar) params.set('verf', '0')
  if (state.haendler) params.set('shop', state.haendler)
  if (state.sort !== 'neu') params.set('sort', state.sort)
  const qs = params.toString()
  window.history.replaceState(null, '', qs ? `?${qs}` : window.location.pathname)
}

function anwenden () {
  const liste = gefilterteListe()
  document.getElementById('kategorie-anzahl').textContent =
    `${liste.length} ${liste.length === 1 ? 'Produkt' : 'Produkte'}`
  renderProdukte(liste)
  renderTags()
  updateURL()
}

// Händler-Dropdown aus den geladenen Produkten füllen
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
  const haendler = document.getElementById('filter-haendler')
  const sort = document.getElementById('filter-sort')

  document.getElementById('preis-anwenden').addEventListener('click', () => {
    const minV = parseFloat(min.value)
    const maxV = parseFloat(max.value)
    state.min = isNaN(minV) ? null : minV
    state.max = isNaN(maxV) ? null : maxV
    anwenden()
  })

  document.getElementById('filter-reset').addEventListener('click', () => {
    state.min = null; state.max = null; state.nurVerfuegbar = true; state.haendler = ''; state.sort = 'neu'
    min.value = ''; max.value = ''; verf.checked = true; haendler.value = ''; sort.value = 'neu'
    anwenden()
  })

  verf.addEventListener('change', () => { state.nurVerfuegbar = verf.checked; anwenden() })
  haendler.addEventListener('change', () => { state.haendler = haendler.value; anwenden() })
  sort.addEventListener('change', () => { state.sort = sort.value; anwenden() })

  // Mobile: Filter-Panel auf-/zuklappen
  const toggle = document.getElementById('filter-toggle')
  const sidebar = document.getElementById('kategorie-sidebar')
  toggle.addEventListener('click', () => {
    const open = sidebar.classList.toggle('is-open')
    toggle.setAttribute('aria-expanded', String(open))
  })
}

// Filter-Controls aus URL/State vorbelegen
function syncControlsFromState () {
  document.getElementById('filter-min').value = state.min !== null ? state.min : ''
  document.getElementById('filter-max').value = state.max !== null ? state.max : ''
  document.getElementById('filter-verfuegbar').checked = state.nurVerfuegbar
  document.getElementById('filter-sort').value = state.sort
}

function leseStateAusURL (params) {
  const min = parseFloat(params.get('min'))
  const max = parseFloat(params.get('max'))
  state.min = isNaN(min) ? null : min
  state.max = isNaN(max) ? null : max
  state.nurVerfuegbar = params.get('verf') !== '0'
  state.haendler = params.get('shop') || ''
  const sort = params.get('sort')
  state.sort = ['preis-asc', 'preis-desc'].includes(sort) ? sort : 'neu'
}

// ── Init ──
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
    titelEl.textContent = isNeu ? 'Neue Produkte' : (aktiveKat ? aktiveKat.name : (slug ? 'Kategorie' : 'Alle Produkte'))
    if (isNeu) document.title = 'Neue Produkte — Shoppen in Braunschweig'
    else if (slug && aktiveKat) document.title = `${aktiveKat.name} — Shoppen in Braunschweig`

    // Alle freigegebenen Produkte der Kategorie laden (Verfügbarkeit clientseitig)
    let query = supabase
      .from('produkte')
      .select('*, shops(name, slug)')
      .eq('freigegeben', true)
      .order('erstellt_am', { ascending: false })

    if (aktiveKat) query = query.eq('kategorie_id', aktiveKat.id)
    else if (slug && !isNeu) query = query.eq('kategorie_id', '00000000-0000-0000-0000-000000000000')
    // isNeu: keine Kategorie-Einschränkung — alle Produkte laden, clientseitig filtern

    const { data, error } = await query
    if (error) throw error
    alleProdukte = data || []

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
