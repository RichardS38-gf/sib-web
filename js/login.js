// js/login.js — SIB Anmelden (Käufer + Händler)
// Authentifizierung via Supabase Auth (E-Mail + Passwort).
// Toggle bestimmt die Weiterleitung nach erfolgreichem Login.
// Optionaler "weiter"-Parameter leitet nach dem Login zurück zur Ursprungsseite
// (z.B. wenn jemand von "Bewertung schreiben" hierher geschickt wurde).

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'
import { stelleHaendlerShopSicher } from './haendler-shop-setup.js'

let aktiveRolle = 'kunde'

function esc (value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function getZielUrl () {
  const params = new URLSearchParams(window.location.search)
  const weiter = params.get('weiter')
  if (weiter && weiter.startsWith(window.location.origin)) return weiter
  return aktiveRolle === 'haendler' ? 'dashboard.html' : 'konto.html'
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

// Hinweistext anzeigen, falls man von einer Aktion hierher weitergeleitet wurde
// (z.B. "Melde dich an, um eine Bewertung zu schreiben")
function zeigeHinweis () {
  const params = new URLSearchParams(window.location.search)
  const hinweis = params.get('hinweis')
  if (!hinweis) return
  const subtext = document.getElementById('login-subtext')
  if (subtext) subtext.innerHTML = `<span class="login__hinweis">${esc(hinweis)}</span>`
}

// Bereits eingeloggt? -> passendes Ziel je nach Account-Typ (oder "weiter"-Ziel)
async function redirectIfLoggedIn () {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return

  const params = new URLSearchParams(window.location.search)
  const weiter = params.get('weiter')
  if (weiter && weiter.startsWith(window.location.origin)) {
    window.location.replace(weiter)
    return
  }

  // Shop laden -- legt ihn bei Bedarf gleich an (falls Registrierung erst
  // jetzt per E-Mail-Bestaetigung abgeschlossen wurde).
  const shop = await stelleHaendlerShopSicher(supabase, session.user)
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
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      // Shop bei Bedarf jetzt anlegen (falls Registrierung erst per
      // E-Mail-Bestätigung abgeschlossen wurde und noch kein Shop existiert).
      await stelleHaendlerShopSicher(supabase, data.user)

      window.location.replace(getZielUrl())
    } catch (err) {
      console.error('Login fehlgeschlagen:', err)
      feedback.innerHTML = '<div class="error-msg">Anmeldung fehlgeschlagen. Bitte prüfe E-Mail und Passwort.</div>'
      submitBtn.disabled = false
      submitBtn.textContent = 'Anmelden'
    }
  })
}

// ── Passwort vergessen ──
// Supabase schickt eine E-Mail mit einem Link auf passwort-neu.html. Dort wird
// die Sitzung aus der URL erkannt und das neue Passwort gesetzt.
function initPasswortVergessen () {
  const loginForm = document.getElementById('login-form')
  const resetForm = document.getElementById('reset-form')
  const oeffnen = document.getElementById('passwort-vergessen')
  const abbrechen = document.getElementById('reset-abbrechen')
  const registerZeile = document.getElementById('login-register-zeile')
  const feedback = document.getElementById('reset-feedback')
  const toggle = document.querySelector('.rollen-toggle')
  if (!loginForm || !resetForm || !oeffnen) return

  const oeffnenZeile = oeffnen.closest('.login__switch')

  function zeigeReset (an) {
    loginForm.hidden = an
    resetForm.hidden = !an
    if (oeffnenZeile) oeffnenZeile.hidden = an
    if (registerZeile) registerZeile.hidden = an
    if (toggle) toggle.hidden = an

    const headline = document.getElementById('login-headline')
    const subtext = document.getElementById('login-subtext')
    if (an) {
      headline.textContent = 'Passwort zurücksetzen'
      subtext.textContent = 'Gib deine E-Mail-Adresse ein. Wir schicken dir einen Link, mit dem du ein neues Passwort vergeben kannst.'
      const login = document.getElementById('login-email')
      const reset = document.getElementById('reset-email')
      if (login && login.value) reset.value = login.value
      reset.focus()
    } else {
      setzeRolle(aktiveRolle)
      feedback.innerHTML = ''
    }
  }

  oeffnen.addEventListener('click', () => zeigeReset(true))
  if (abbrechen) abbrechen.addEventListener('click', () => zeigeReset(false))

  resetForm.addEventListener('submit', async (e) => {
    e.preventDefault()
    feedback.innerHTML = ''

    const email = resetForm.email.value.trim()
    if (!email) {
      feedback.innerHTML = '<div class="error-msg">Bitte gib deine E-Mail-Adresse ein.</div>'
      return
    }

    const btn = resetForm.querySelector('button[type="submit"]')
    btn.disabled = true
    btn.textContent = 'Wird gesendet…'

    try {
      await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/passwort-neu.html`
      })
    } catch (err) {
      console.error('Passwort-Reset fehlgeschlagen:', err)
    }

    // Bewusst immer dieselbe Meldung: sonst liesse sich herausfinden, welche
    // E-Mail-Adressen bei uns registriert sind.
    resetForm.innerHTML = '<div class="success-msg">Wenn es zu dieser Adresse ein Konto gibt, ist die E-Mail unterwegs. Schau auch im Spam-Ordner nach.</div>' +
      '<p class="login__switch"><a href="haendler-login.html">Zurück zur Anmeldung</a></p>'
  })
}

initMobileMenu()
initHeaderSearch()
initRollenToggle()
zeigeHinweis()
redirectIfLoggedIn()
initLogin()
initPasswortVergessen()
