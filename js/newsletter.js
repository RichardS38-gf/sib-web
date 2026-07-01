// js/newsletter.js v3 — SIB Monatsausgabe (kein Formular)

// Mobile-Menue
const burger = document.querySelector('.site-header__burger')
const mobileMenu = document.getElementById('mobile-menu')
if (burger && mobileMenu) {
  burger.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') === 'true'
    burger.setAttribute('aria-expanded', String(!open))
    burger.setAttribute('aria-label', open ? 'Menue oeffnen' : 'Menue schliessen')
    mobileMenu.hidden = open
  })
}
