// js/faq.js v2 -- SIB FAQ zweispaltig

// Mobile-Menue
const burger = document.querySelector('.site-header__burger')
const mobileMenu = document.getElementById('mobile-menu')
if (burger && mobileMenu) {
  burger.addEventListener('click', () => {
    const open = burger.getAttribute('aria-expanded') === 'true'
    burger.setAttribute('aria-expanded', String(!open))
    mobileMenu.hidden = open
  })
}

// Tab-Navigation
const navBtns = document.querySelectorAll('.faq-nav__item')
const panels = document.querySelectorAll('.faq-panel')

navBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const cat = btn.dataset.category

    navBtns.forEach(b => b.classList.remove('is-active'))
    btn.classList.add('is-active')

    panels.forEach(p => {
      const isTarget = p.id === `faq-${cat}`
      p.hidden = !isTarget
      p.classList.toggle('is-active', isTarget)
    })
  })
})

// Akkordeon
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    const expanded = btn.getAttribute('aria-expanded') === 'true'
    const answer = btn.nextElementSibling

    // Schliesse alle anderen in diesem Panel
    const panel = btn.closest('.faq-panel')
    panel.querySelectorAll('.faq-question[aria-expanded="true"]').forEach(other => {
      if (other !== btn) {
        other.setAttribute('aria-expanded', 'false')
        other.nextElementSibling.hidden = true
      }
    })

    btn.setAttribute('aria-expanded', String(!expanded))
    answer.hidden = expanded
  })
})
