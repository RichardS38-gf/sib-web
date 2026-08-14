// js/haendler-werden.js — SIB Registrieren (Käufer + Händler)
// Käufer: echter Supabase-Auth-Account, sofort nutzbar.
// Händler: echter Supabase-Auth-Account, sofort nutzbar (Self-Service, keine
// manuelle Prüfung, kein Zahlungsschritt im Formular).

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'
import { stelleHaendlerShopSicher } from './haendler-shop-setup.js'

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

// ── Händler-Registrierung (echter Account, sofort nutzbar) ──
// Legt bei signUp() gleich einen Supabase-Auth-Account MIT selbst gewähltem
// Passwort an. Ist danach direkt eine Session vorhanden (keine E-Mail-
// Bestätigung nötig), wird sofort der Shop angelegt und man landet im
// Dashboard -- genau wie ein bestehender Händler-Account. Verlangt das
// Supabase-Projekt eine E-Mail-Bestätigung, wird der Shop automatisch beim
// ersten Login danach angelegt (siehe haendler-shop-setup.js).
async function ladeLogoHoch (file) {
  if (!file) return null
  const ext = file.name.split('.').pop().toLowerCase()
  const path = `shop-logos/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
  const { data, error } = await supabase.storage.from('produkt-bilder').upload(path, file, {
    cacheControl: '3600',
    upsert: false
  })
  if (error) {
    console.error('Logo-Upload fehlgeschlagen:', error)
    return null
  }
  const { data: { publicUrl } } = supabase.storage.from('produkt-bilder').getPublicUrl(data.path)
  return publicUrl
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
    const passwort = form.passwort.value
    const telefon = form.telefon.value.trim()
    const geschaeftName = form.geschaeft_name.value.trim()
    const strasse = form.strasse.value.trim()
    const hausnummer = form.hausnummer.value.trim()
    const plzOrt = form.plz_ort.value.trim()
    const beschreibung = form.beschreibung.value.trim()

    if (!vorname || !nachname || !email || !passwort || !telefon || !geschaeftName || !strasse || !hausnummer || !plzOrt) {
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

    const adresse = `${strasse} ${hausnummer}, ${plzOrt}`

    const submitBtn = form.querySelector('button[type="submit"]')
    submitBtn.disabled = true
    submitBtn.textContent = 'Wird erstellt…'

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password: passwort,
        options: {
          data: {
            vorname,
            nachname,
            rolle: 'haendler',
            geschaeft_name: geschaeftName,
            adresse,
            telefon,
            beschreibung: beschreibung || null
          }
        }
      })
      if (error) throw error

      if (data.session) {
        // Sofort eingeloggt -> Logo (falls gewählt) jetzt authentifiziert hochladen
        // und den Shop direkt anlegen.
        let logoUrl = null
        const logoFile = form.logo.files[0]
        if (logoFile) logoUrl = await ladeLogoHoch(logoFile)

        await stelleHaendlerShopSicher(supabase, data.user, logoUrl ? { logo_url: logoUrl } : {})
        window.location.replace('dashboard.html')
        return
      }

      form.innerHTML = '<div class="success-msg">Fast geschafft! Bitte bestätige deine E-Mail-Adresse über den Link, den wir dir gerade gesendet haben. Danach kannst du dich anmelden, dein Geschäft wird dabei automatisch eingerichtet.</div>'
    } catch (err) {
      console.error('Händler-Registrierung fehlgeschlagen:', err)
      const msg = err?.message?.includes('already registered') || err?.message?.includes('already exists')
        ? 'Für diese E-Mail-Adresse existiert bereits ein Konto.'
        : 'Die Registrierung konnte nicht abgeschlossen werden. Bitte versuche es später erneut.'
      feedback.innerHTML = `<div class="error-msg">${msg}</div>`
      submitBtn.disabled = false
      submitBtn.textContent = 'Händler-Account erstellen'
    }
  })
}

// ── Vorteils-Slider (nur Mobile sichtbar) ──
function initVorteileSlider () {
  const spur = document.querySelector('.hw-vorteile__grid')
  const zurueck = document.querySelector('.hw-slider-btn--prev')
  const weiter = document.querySelector('.hw-slider-btn--next')
  if (!spur || !zurueck || !weiter) return

  function schrittweite () {
    const karte = spur.querySelector('.hw-vorteil')
    if (!karte) return spur.clientWidth
    const abstand = parseFloat(window.getComputedStyle(spur).columnGap || 0) || 0
    return karte.getBoundingClientRect().width + abstand
  }

  function aktualisiereButtons () {
    const maximal = spur.scrollWidth - spur.clientWidth
    zurueck.disabled = spur.scrollLeft <= 2
    weiter.disabled = spur.scrollLeft >= maximal - 2
  }

  zurueck.addEventListener('click', () => { spur.scrollLeft -= schrittweite() })
  weiter.addEventListener('click', () => { spur.scrollLeft += schrittweite() })
  spur.addEventListener('scroll', aktualisiereButtons, { passive: true })
  window.addEventListener('resize', aktualisiereButtons)
  aktualisiereButtons()
}

initMobileMenu()
initHeaderSearch()
initRollenToggle()
initKundeForm()
initHaendlerForm()
initVorteileSlider()
