// js/faq.js — SIB FAQ-Seite
// Akkordeon: nur eine Antwort gleichzeitig offen.

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

function initAkkordeon () {
  const fragen = Array.from(document.querySelectorAll('.faq-question'))

  fragen.forEach((frage) => {
    frage.addEventListener('click', () => {
      const offen = frage.getAttribute('aria-expanded') === 'true'

      // Alle schließen
      fragen.forEach((f) => {
        f.setAttribute('aria-expanded', 'false')
        const a = f.nextElementSibling
        if (a) a.hidden = true
      })

      // Geklickte öffnen, wenn sie vorher zu war
      if (!offen) {
        frage.setAttribute('aria-expanded', 'true')
        const antwort = frage.nextElementSibling
        if (antwort) antwort.hidden = false
      }
    })
  })
}

initMobileMenu()
initHeaderSearch()
initAkkordeon()
