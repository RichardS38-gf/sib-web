// js/ueber-uns.js -- SIB Ueber-uns-Seite

import { initHeaderSearch } from './header.js'

function initMobileMenu () {
  const burger = document.querySelector('.site-header__burger')
  const menu = document.getElementById('mobile-menu')
  if (!burger || !menu) return
  burger.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') === 'true'
    burger.setAttribute('aria-expanded', String(!open))
    menu.hidden = open
  })
}

function initHighlight () {
  const el = document.querySelector('.ueber-problem__highlight')
  if (!el) return
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        setTimeout(() => el.classList.add('is-visible'), 300)
        observer.disconnect()
      }
    })
  }, { threshold: 0.5 })
  observer.observe(el)
}

initMobileMenu()
initHeaderSearch()
initHighlight()
