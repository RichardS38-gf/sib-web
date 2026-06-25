// js/newsletter.js — SIB Newsletter-Anmeldung
// Speichert E-Mail-Adressen in der Tabelle newsletter_abonnenten.

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'

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

function isValidEmail (email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function initNewsletter () {
  const form = document.getElementById('newsletter-form')
  const feedback = document.getElementById('newsletter-feedback')
  if (!form) return

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    feedback.innerHTML = ''

    const email = form.email.value.trim().toLowerCase()

    if (!isValidEmail(email)) {
      feedback.innerHTML = '<div class="error-msg">Bitte gib eine gültige E-Mail-Adresse ein.</div>'
      return
    }

    const submitBtn = form.querySelector('button[type="submit"]')
    submitBtn.disabled = true
    submitBtn.textContent = 'Wird gesendet…'

    try {
      const { error } = await supabase
        .from('newsletter_abonnenten')
        .insert({ email, aktiv: true })

      if (error) {
        // 23505 = unique_violation -> E-Mail bereits vorhanden
        if (error.code === '23505') {
          form.innerHTML = '<div class="success-msg">Du bist bereits angemeldet.</div>'
          return
        }
        throw error
      }

      form.innerHTML = '<div class="success-msg">Du bist dabei! Du erhältst ab dem nächsten Newsletter neue Produkte aus Braunschweig.</div>'
    } catch (err) {
      console.error('Newsletter-Anmeldung fehlgeschlagen:', err)
      feedback.innerHTML = '<div class="error-msg">Die Anmeldung konnte nicht gespeichert werden. Bitte versuche es später erneut.</div>'
      submitBtn.disabled = false
      submitBtn.textContent = 'Anmelden'
    }
  })
}

initMobileMenu()
initHeaderSearch()
initNewsletter()
