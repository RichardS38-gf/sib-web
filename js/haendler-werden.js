// js/haendler-werden.js — SIB Registrieren (Käufer + Händler)
// Käufer: echter Supabase-Auth-Account, sofort nutzbar.
// Händler: Anfrage-Formular (wird manuell geprüft, wie bisher).

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

// ── Rollen-Toggle ──
function setzeRolle (rolle) {
  const istHaendler = rolle === 'haendler'

  document.querySelectorAll('.rollen-toggle__btn').forEach((btn) => {
    btn.classList.toggle('is-active', btn.dataset.rolle === (istHaendler ? 'haendler' : 'kunde'))
  })

  document.getElementById('kunde-block').hidden = istHaendler
  document.getElementById('haendler-block').hidden = !istHaendler

  const heroHeadline = document.getElementById('hw-hero-headline')
  const heroSubtext = document.getElementById('hw-hero-subtext')
  if (istHaendler) {
    heroHeadline.innerHTML = 'Dein Geschäft.<br>Online sichtbar.'
    heroSubtext.textContent = 'Registriere dein Geschäft auf Shoppen in Braunschweig und erreiche tausende lokale Käufer.'
  } else {
    heroHeadline.innerHTML = '<em>Lokal</em> einkaufen.<br><em>Online</em> entdecken.'
    heroSubtext.textContent = 'Erstelle dein kostenloses Konto bei Shoppen in Braunschweig.'
  }
}

function initRollenToggle () {
  document.querySelectorAll('.rollen-toggle__btn').forEach((btn) => {
    btn.addEventListener('click', () => setzeRolle(btn.dataset.rolle))
  })

  const params = new URLSearchParams(window.location.search)
  setzeRolle(params.get('rolle') === 'haendler' ? 'haendler' : 'kunde')
}

// ── Käufer-Registrierung (echter Account) ──
function initKundeForm () {
  const form = document.getElementById('kunde-form')
  const feedback = document.getElementById('kf-feedback')
  if (!form) return

  form.addEventListener('submit', async (e) => {
    e.preventDefault()
    feedback.innerHTML = ''

    const vorname = form.vorname.value.trim()
    const nachname = form.nachname.value.trim()
    const email = form.email.value.trim()
    const passwort = form.passwort.value

    if (!vorname || !nachname || !email || !passwort) {
      feedback.innerHTML = '<div class="error-msg">Bitte fülle alle Pflichtfelder aus.</div>'
      return
    }
    if (!isValidEmail(email)) {
      feedback.innerHTML = '<div class="error-msg">Bitte gib eine gültige E-Mail-Adresse ein.</div>'
      return
    }
    if (passwort.length < 6) {
      feedback.innerHTML = '<div class="error-msg">Das Passwort muss mindestens 6 Zeichen lang sein.</div>'
      return
    }
    if (!form.datenschutz.checked) {
      feedback.innerHTML = '<div class="error-msg">Bitte akzeptiere die Datenschutzerklärung.</div>'
      return
    }

    const submitBtn = form.querySelector('button[type="submit"]')
    submitBtn.disabled = true
    submitBtn.textContent = 'Wird erstellt…'

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: passwort,
        options: { data: { vorname, nachname, rolle: 'kunde' } }
      })
      if (error) throw error

      // Kundenprofil anlegen (falls Session sofort vorhanden — abhängig von E-Mail-Bestätigung)
      if (data.user) {
        await supabase.from('kunden').insert({
          id: data.user.id,
          vorname,
          nachname,
          email
        })
      }

      if (data.session) {
        window.location.replace('konto.html')
      } else {
        form.innerHTML = '<div class="success-msg">Fast geschafft! Bitte bestätige deine E-Mail-Adresse über den Link, den wir dir gerade gesendet haben.</div>'
      }
    } catch (err) {
      console.error('Käufer-Registrierung fehlgeschlagen:', err)
      const msg = err?.message?.includes('already registered') || err?.message?.includes('already exists')
        ? 'Für diese E-Mail-Adresse existiert bereits ein Konto.'
        : 'Die Registrierung konnte nicht abgeschlossen werden. Bitte versuche es später erneut.'
      feedback.innerHTML = `<div class="error-msg">${msg}</div>`
      submitBtn.disabled = false
      submitBtn.textContent = 'Käufer-Account erstellen'
    }
  })
}

// ── Händler-Anfrage (wie bisher: Formular zur manuellen Prüfung) ──
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

function initHaendlerForm () {
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
      const logoUrl = await ladeLogoHoch(form.logo.files[0])

      const { data, error } = await supabase.from('haendler_anfragen').insert({
        vorname,
        nachname,
        email,
        telefon,
        geschaeft_name: geschaeftName,
        adresse,
        beschreibung: beschreibung || null,
        logo_url: logoUrl
      }).select('id').single()

      if (error) throw error

      // Stripe-Checkout: falls noch nicht konfiguriert (Keys fehlen) oder die
      // Session-Erstellung fehlschlägt, blockieren wir die Registrierung NICHT --
      // die Anfrage ist bereits gespeichert, Zahlung kann später nachgeholt werden.
      try {
        submitBtn.textContent = 'Weiterleitung zur Zahlung…'
        const res = await fetch('/api/create-checkout-session', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ anfrageId: data.id, email, geschaeftName })
        })
        const checkout = await res.json()

        if (res.ok && checkout.url) {
          window.location.href = checkout.url
          return
        }
        console.warn('Stripe-Checkout nicht verfügbar, Anfrage trotzdem gespeichert:', checkout.error)
      } catch (stripeErr) {
        console.warn('Stripe-Checkout nicht erreichbar, Anfrage trotzdem gespeichert:', stripeErr)
      }

      form.innerHTML = '<div class="success-msg">Vielen Dank! Wir melden uns innerhalb von 2 Werktagen bei dir, um auch die Zahlung abzuschließen.</div>'
    } catch (err) {
      console.error('Registrierung fehlgeschlagen:', err)
      feedback.innerHTML = '<div class="error-msg">Die Registrierung konnte nicht gesendet werden. Bitte versuche es später erneut.</div>'
      submitBtn.disabled = false
      submitBtn.textContent = 'Registrierung absenden'
    }
  })
}

// — Stripe-Rückkehr behandeln (Erfolg / Abbruch aus dem Checkout) —
function initStripeRueckkehr () {
  const params = new URLSearchParams(window.location.search)
  const zahlung = params.get('zahlung')
  const feedback = document.getElementById('hw-feedback')
  const haendlerBlock = document.getElementById('haendler-block')
  if (!zahlung || !feedback || !haendlerBlock) return

  if (zahlung === 'erfolg') {
    haendlerBlock.innerHTML = '<div class="success-msg">Zahlung erfolgreich! Deine Registrierung ist eingegangen — wir melden uns innerhalb von 2 Werktagen, sobald dein Account freigeschaltet ist.</div>'
  } else if (zahlung === 'abgebrochen') {
    feedback.innerHTML = '<div class="error-msg">Die Zahlung wurde abgebrochen. Deine Anfrage ist gespeichert — du kannst die Registrierung jederzeit erneut abschließen, indem du das Formular nochmal absendest.</div>'
  }
}

initMobileMenu()
initHeaderSearch()
initRollenToggle()
initKundeForm()
initHaendlerForm()
initStripeRueckkehr()
