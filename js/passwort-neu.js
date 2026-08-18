// js/passwort-neu.js — SIB Passwort zuruecksetzen (Schritt 2)
//
// Auf diese Seite fuehrt der Link aus der Supabase-Reset-Mail. Supabase haengt
// die Sitzungsdaten an die URL an, der Supabase-Client liest sie beim Start
// automatisch aus (detectSessionInUrl ist standardmaessig aktiv) und legt eine
// temporaere Sitzung an. Nur mit dieser Sitzung darf das Passwort geaendert
// werden.

import { supabase } from './supabase.js'
import { initHeaderSearch } from './header.js'

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

const subtext = document.getElementById('pw-subtext')
const form = document.getElementById('pw-form')
const fehler = document.getElementById('pw-fehler')
const feedback = document.getElementById('pw-feedback')

function zeigeFormular () {
  subtext.textContent = 'Wähle ein neues Passwort mit mindestens 8 Zeichen.'
  form.hidden = false
  document.getElementById('pw-neu').focus()
}

function zeigeFehler () {
  subtext.hidden = true
  fehler.hidden = false
}

// Der Client braucht einen Moment, um die Sitzung aus der URL zu lesen.
// Deshalb hoeren wir auf das Auth-Ereignis und pruefen zusaetzlich nach einer
// kurzen Wartezeit, falls die Sitzung schon vorher stand.
let fertig = false

supabase.auth.onAuthStateChange((event, session) => {
  if (fertig) return
  if (event === 'PASSWORD_RECOVERY' || session) {
    fertig = true
    zeigeFormular()
  }
})

setTimeout(async () => {
  if (fertig) return
  const { data: { session } } = await supabase.auth.getSession()
  fertig = true
  if (session) zeigeFormular()
  else zeigeFehler()
}, 1500)

form.addEventListener('submit', async (e) => {
  e.preventDefault()
  feedback.innerHTML = ''

  const neu = form.passwort.value
  const wdh = form.wiederholung.value

  if (neu.length < 8) {
    feedback.innerHTML = '<div class="error-msg">Das Passwort muss mindestens 8 Zeichen lang sein.</div>'
    return
  }
  if (neu !== wdh) {
    feedback.innerHTML = '<div class="error-msg">Die beiden Passwörter stimmen nicht überein.</div>'
    return
  }

  const btn = form.querySelector('button[type="submit"]')
  btn.disabled = true
  btn.textContent = 'Wird gespeichert…'

  try {
    const { error } = await supabase.auth.updateUser({ password: neu })
    if (error) throw error

    // Nach der Änderung bewusst abmelden, damit die Anmeldung einmal frisch
    // mit dem neuen Passwort erfolgt.
    await supabase.auth.signOut()

    form.innerHTML = '<div class="success-msg">Dein Passwort wurde geändert. Du kannst dich jetzt damit anmelden.</div>' +
      '<p class="login__switch"><a href="haendler-login.html">Zur Anmeldung</a></p>'
    subtext.hidden = true
  } catch (err) {
    console.error('Passwort konnte nicht geändert werden:', err)
    feedback.innerHTML = '<div class="error-msg">Das hat nicht geklappt. Der Link ist möglicherweise abgelaufen. Fordere bitte einen neuen an.</div>'
    btn.disabled = false
    btn.textContent = 'Passwort speichern'
  }
})

initMobileMenu()
initHeaderSearch()
