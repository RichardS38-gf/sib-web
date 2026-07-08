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

function initTimeline () {
  const progress = document.getElementById('timeline-progress')
  const dots = [document.getElementById('dot-1'), document.getElementById('dot-2'), document.getElementById('dot-3')]
  const steps = document.querySelectorAll('.ueber-timeline__step')
  if (!progress || !dots[0]) return

  const STEP_DURATION = 1200
  const PAUSE = 600
  const widths = ['0%', '50%', '100%']

  function activate (index) {
    dots.forEach((d, i) => {
      d.classList.toggle('is-active', i <= index)
      steps[i].classList.toggle('is-active', i <= index)
    })
    progress.style.width = widths[index]
  }

  function runLoop () {
    activate(0)
    setTimeout(() => activate(1), STEP_DURATION)
    setTimeout(() => activate(2), STEP_DURATION * 2)
    setTimeout(() => {
      progress.style.transition = 'none'
      progress.style.width = '0%'
      dots.forEach(d => d.classList.remove('is-active'))
      steps.forEach(s => s.classList.remove('is-active'))
      setTimeout(() => {
        progress.style.transition = 'width 0.6s cubic-bezier(0.4,0,0.2,1)'
        runLoop()
      }, 100)
    }, STEP_DURATION * 2 + PAUSE * 3)
  }

  runLoop()
}

function initHighlight () {
  const el = document.querySelector('.ueber-problem__highlight')
  if (!el) return
  function pulse () {
    el.classList.remove('is-visible')
    setTimeout(() => el.classList.add('is-visible'), 400)
  }
  pulse()
  setInterval(pulse, 2500)
}

initMobileMenu()
initHeaderSearch()
initTimeline()
initHighlight()
