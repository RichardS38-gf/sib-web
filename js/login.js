// js/login.js — SIB Anmelden (Käufer + Händler)
// Authentifizierung via Supabase Auth (E-Mail + Passwort).
// Toggle bestimmt die Weiterleitung nach erfolgreichem Login.

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'

let aktiveRolle = 'kunde'

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

function setzeRolle (rolle) {
  aktiveRolle = rolle === 'haendler' ? 'haendler' : 'kunde'

  document.querySelectorAll('.rollen-toggle__btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.rolle === aktiveRolle)
  })

  const headline = document.getElementById('login-headline')
  const subtext = document.getElementById('login-subtext')
  const registerLink = document.getElementById('login-register-link')

  if (aktiveRolle === 'haendler') {
    headline.textContent = 'Händler-Login'
    subtext.textContent = 'Melde dich an, um deine Produkte und Reservierungen zu verwalten.'
    registerLink.href = 'haendler-werden.html?rolle=haendler'
  } else {
    headline.textContent = 'Willkommen zurück'
    subtext.textContent = 'Melde dich an, um deine Reservierungen, Bewertungen und Wunschliste zu sehen.'
    registerLink.href = 'haendler-werden.html?rolle=kunde'
  }
}

function initRollenToggle () {
  document.querySelectorAll('.rollen-toggle__btn').forEach((btn) => {
    btn.addEventListener('click', () => setzeRolle(btn.dataset.rolle))
  })

  // Rolle aus URL-Parameter vorbelegen
  const params = new URLSearchParams(window.location.search)
  const rolleParam = params.get('rolle')
  setzeRolle(rolleParam === 'haendler' ? 'haendler' : 'kunde')
}

// Bereits eingeloggt? -> passendes Ziel je nach Account-Typ
async function redirectIfLoggedIn () {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return

  // Prüfen ob ein Shop (Händler) verknüpft ist
  const { data: shop } = await supabase.from('shops').select('id').eq('user_id', session.user.id).maybeSingle()
  if (shop) { window.location.replace('dashboard.html'); return }

  window.location.replace('konto.html')
}

function initLogin () {
  const form = document.getElementById('login-form')
  const feedback = document.getElementById('login-feedback')
  if (!form) return

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    feedback.innerHTML = ''

    const email = form.email.value.trim()
    const password = form.password.value

    if (!email || !password) {
      feedback.innerHTML = '<div class="error-msg">Bitte E-Mail und Passwort eingeben.</div>'
      return
    }

    const submitBtn = form.querySelector('button[type="submit"]')
    submitBtn.disabled = true
    submitBtn.textContent = 'Wird angemeldet…'

    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      // Weiterleitung je nach gewähltem Toggle
      window.location.replace(aktiveRolle === 'haendler' ? 'dashboard.html' : 'konto.html')
    } catch (err) {
      console.error('Login fehlgeschlagen:', err)
      feedback.innerHTML = '<div class="error-msg">Anmeldung fehlgeschlagen. Bitte prüfe E-Mail und Passwort.</div>'
      submitBtn.disabled = false
      submitBtn.textContent = 'Anmelden'
    }
  })
}

initMobileMenu()
initHeaderSearch()
initRollenToggle()
redirectIfLoggedIn()
initLogin()
