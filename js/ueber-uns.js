// js/ueber-uns.js — SIB Über-uns-Seite
// Statische Seite — nur Mobile-Menü und Suchfeld-Vorausfüllung.

import { initHeaderSearch } from './header.js'

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

initMobileMenu()
initHeaderSearch()
