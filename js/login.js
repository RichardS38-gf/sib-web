// js/login.js — SIB Händler-Login
// Authentifizierung via Supabase Auth (E-Mail + Passwort).

import { supabase } from './supabase.js'

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

// Bereits eingeloggt? -> direkt ins Dashboard
async function redirectIfLoggedIn () {
  const { data: { session } } = await supabase.auth.getSession()
  if (session) window.location.replace('dashboard.html')
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
      window.location.replace('dashboard.html')
    } catch (err) {
      console.error('Login fehlgeschlagen:', err)
      feedback.innerHTML = '<div class="error-msg">Anmeldung fehlgeschlagen. Bitte prüfe E-Mail und Passwort.</div>'
      submitBtn.disabled = false
      submitBtn.textContent = 'Anmelden'
    }
  })
}

initMobileMenu()
redirectIfLoggedIn()
initLogin()
