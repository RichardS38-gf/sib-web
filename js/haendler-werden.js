// js/haendler-werden.js — SIB Händler-Registrierung
// Speichert die Anfrage in der Tabelle haendler_anfragen; optionales Logo
// wird in den Storage-Bucket "haendler-logos" hochgeladen.

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'

const LOGO_BUCKET = 'haendler-logos'

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

// Logo hochladen -> öffentliche URL (oder null bei Fehler/ohne Datei)
async function ladeLogoHoch (file) {
  if (!file) return null
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const path = `anfragen/${Date.now()}-${safeName}`
  const { error } = await supabase.storage.from(LOGO_BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false
  })
  if (error) {
    console.error('Logo-Upload fehlgeschlagen:', error)
    return null
  }
  const { data } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path)
  return data?.publicUrl || path
}

function initFormular () {
  const form = document.getElementById('haendler-form')
  const feedback = document.getElementById('hw-feedback')
  if (!form) return

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    feedback.innerHTML = ''

    const vorname = form.vorname.value.trim()
    const nachname = form.nachname.value.trim()
    const email = form.email.value.trim()
    const telefon = form.telefon.value.trim()
    const geschaeftName = form.geschaeft_name.value.trim()
    const adresse = form.adresse.value.trim()
    const beschreibung = form.beschreibung.value.trim()

    if (!vorname || !nachname || !email || !telefon || !geschaeftName || !adresse) {
      feedback.innerHTML = '<div class="error-msg">Bitte fülle alle Pflichtfelder aus.</div>'
      return
    }
    if (!isValidEmail(email)) {
      feedback.innerHTML = '<div class="error-msg">Bitte gib eine gültige E-Mail-Adresse ein.</div>'
      return
    }
    if (!form.datenschutz.checked) {
      feedback.innerHTML = '<div class="error-msg">Bitte akzeptiere die Datenschutzerklärung.</div>'
      return
    }

    const submitBtn = form.querySelector('button[type="submit"]')
    submitBtn.disabled = true
    submitBtn.textContent = 'Wird gesendet…'

    try {
      // Optionales Logo hochladen (scheitert nicht-fatal)
      const logoUrl = await ladeLogoHoch(form.logo.files[0])

      const { error } = await supabase.from('haendler_anfragen').insert({
        vorname,
        nachname,
        email,
        telefon,
        geschaeft_name: geschaeftName,
        adresse,
        beschreibung: beschreibung || null,
        logo_url: logoUrl
      })

      if (error) throw error

      // Formular durch Erfolgsmeldung ersetzen
      form.innerHTML = '<div class="success-msg">Vielen Dank! Wir melden uns innerhalb von 2 Werktagen bei dir.</div>'
    } catch (err) {
      console.error('Registrierung fehlgeschlagen:', err)
      feedback.innerHTML = '<div class="error-msg">Die Registrierung konnte nicht gesendet werden. Bitte versuche es später erneut.</div>'
      submitBtn.disabled = false
      submitBtn.textContent = 'Registrierung absenden'
    }
  })
}

initMobileMenu()
initHeaderSearch()
initFormular()
