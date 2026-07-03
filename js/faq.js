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

// Hover auf Desktop, Klick auf Touch
const isTouch = () => window.matchMedia('(hover: none)').matches

function openItem (btn) {
  const panel = btn.closest('.faq-panel')
  panel.querySelectorAll('.faq-question[aria-expanded="true"]').forEach(other => {
    if (other !== btn) {
      other.setAttribute('aria-expanded', 'false')
      other.nextElementSibling.hidden = true
    }
  })
  btn.setAttribute('aria-expanded', 'true')
  btn.nextElementSibling.hidden = false
}

function closeItem (btn) {
  btn.setAttribute('aria-expanded', 'false')
  btn.nextElementSibling.hidden = true
}

document.querySelectorAll('.faq-question').forEach(btn => {
  // Touch: Klick toggelt
  btn.addEventListener('click', () => {
    if (isTouch()) {
      const expanded = btn.getAttribute('aria-expanded') === 'true'
      expanded ? closeItem(btn) : openItem(btn)
    }
  })

  // Desktop: Hover oeffnet/schliesst
  btn.addEventListener('mouseenter', () => {
    if (!isTouch()) openItem(btn)
  })

  btn.closest('.faq-item').addEventListener('mouseleave', () => {
    if (!isTouch()) closeItem(btn)
  })
})
