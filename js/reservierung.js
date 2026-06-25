// js/reservierung.js — SIB Reservierungs-Detailseite
// Kunde sieht seine Reservierung (per id-Link) und kann sie stornieren.

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

function formatDatum (value) {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return '—'
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
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

function getId () {
  return new URLSearchParams(window.location.search).get('id')
}

function statusBadge (status) {
  const map = {
    offen: ['badge--outline', 'Offen'],
    bestaetigt: ['badge', 'Bestätigt'],
    abgeholt: ['badge', 'Abgeholt'],
    abgelaufen: ['badge--muted', 'Abgelaufen'],
    storniert: ['badge--muted', 'Storniert']
  }
  const [cls, label] = map[status] || ['badge--muted', status || '—']
  return `<span class="badge ${cls}">${esc(label)}</span>`
}

function notFound (text) {
  document.getElementById('reservierung-inhalt').innerHTML = `
    <div class="reservierung-notfound">
      <h1>Reservierung nicht gefunden</h1>
      <p>${esc(text || 'Diese Reservierung existiert nicht.')}</p>
      <p style="margin-top:1.5rem"><a class="btn btn--primary" href="index.html">Zur Startseite</a></p>
    </div>`
}

let aktuelleReservierung = null

function render (r) {
  const el = document.getElementById('reservierung-inhalt')
  const produkt = r.produkte || null
  const shop = produkt?.shops || null
  const shopName = shop?.name || 'Lokaler Händler'

  const bilder = Array.isArray(produkt?.bilder) ? produkt.bilder.filter(Boolean) : []
  const bild = bilder[0]
    ? `<img class="reservierung__bild" src="${esc(bilder[0])}" alt="${esc(produkt?.titel || '')}">`
    : '<div class="reservierung__bild"></div>'

  const preis = (produkt && produkt.preis !== null && produkt.preis !== undefined)
    ? euro.format(produkt.preis) : ''

  const shopLink = shop?.slug
    ? `<a class="reservierung__shop" href="shop.html?slug=${encodeURIComponent(shop.slug)}">${esc(shopName)}</a>`
    : `<span class="reservierung__shop" style="text-decoration:none">${esc(shopName)}</span>`

  // Statusabhängiger Aktionsbereich
  let aktion = ''
  if (r.status === 'offen') {
    aktion = `
      <button class="btn btn--outline" id="storno-btn" type="button">Reservierung stornieren</button>
      <div id="storno-feedback" aria-live="polite"></div>`
  } else if (r.status === 'bestaetigt') {
    const adr = shop?.adresse ? `, ${esc(shop.adresse)}` : ''
    aktion = `<p class="reservierung__hinweis"><strong>Dein Artikel ist abholbereit!</strong> Hole ihn ab bei: ${esc(shopName)}${adr}</p>`
  } else if (r.status === 'abgelaufen') {
    aktion = '<p class="reservierung__hinweis">Diese Reservierung ist abgelaufen.</p>'
  } else if (r.status === 'storniert') {
    aktion = '<p class="reservierung__hinweis">Diese Reservierung wurde storniert.</p>'
  } else if (r.status === 'abgeholt') {
    aktion = '<p class="reservierung__hinweis">Dieser Artikel wurde bereits abgeholt.</p>'
  }

  el.innerHTML = `
    <div class="reservierung">
      <div class="reservierung__status">${statusBadge(r.status)}</div>

      <div class="reservierung__produkt">
        ${produkt && produkt.id ? `<a href="produkt.html?id=${encodeURIComponent(produkt.id)}">${bild}</a>` : bild}
        <div class="reservierung__info">
          ${shopLink}
          <h1 class="reservierung__titel">${esc(produkt?.titel || 'Produkt')}</h1>
          <p class="reservierung__preis">${esc(preis)}</p>
          ${r.groesse ? `<p class="reservierung__groesse">Größe: ${esc(r.groesse)}</p>` : ''}
        </div>
      </div>

      <hr>

      <div class="reservierung__details">
        <p><strong>Reserviert am:</strong> ${formatDatum(r.erstellt_am)}</p>
        <p><strong>Gültig bis:</strong> ${formatDatum(r.ablauf_am)}</p>
        <p><strong>Name:</strong> ${esc(r.kunde_name)}</p>
      </div>

      <div class="reservierung__aktion">${aktion}</div>
    </div>`

  if (r.status === 'offen') {
    document.getElementById('storno-btn').addEventListener('click', () => storniere(r))
  }
}

async function storniere (r) {
  if (!window.confirm('Möchtest du die Reservierung wirklich stornieren?')) return

  const btn = document.getElementById('storno-btn')
  const feedback = document.getElementById('storno-feedback')
  btn.disabled = true
  btn.textContent = 'Wird storniert…'

  try {
    const { error } = await supabase
      .from('reservierungen')
      .update({ status: 'storniert' })
      .eq('id', r.id)
    if (error) throw error

    aktuelleReservierung = { ...r, status: 'storniert' }
    render(aktuelleReservierung)
    document.querySelector('.reservierung__aktion').insertAdjacentHTML('afterbegin',
      '<div class="success-msg" style="margin-bottom:1rem">Deine Reservierung wurde storniert.</div>')
  } catch (err) {
    console.error('Stornierung fehlgeschlagen:', err)
    feedback.innerHTML = '<div class="error-msg">Die Reservierung konnte nicht storniert werden. Bitte versuche es später erneut.</div>'
    btn.disabled = false
    btn.textContent = 'Reservierung stornieren'
  }
}

// ── Init ──
async function init () {
  initMobileMenu()
  initHeaderSearch()

  const id = getId()
  if (!id) {
    notFound('Keine Reservierung angegeben.')
    return
  }

  try {
    const { data, error } = await supabase
      .from('reservierungen')
      .select('*, produkte(id, titel, preis, bilder, shops(name, slug, adresse))')
      .eq('id', id)
      .maybeSingle()

    if (error) throw error
    if (!data) {
      notFound()
      return
    }

    aktuelleReservierung = data
    render(data)
  } catch (err) {
    console.error('Reservierung konnte nicht geladen werden:', err)
    notFound('Die Reservierung konnte gerade nicht geladen werden.')
  }
}

init()
