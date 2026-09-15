// js/abmelden.js — SIB Prospekt-Abmeldung
// Wird ueber den Abmeldelink am Ende jeder Prospekt-Mail aufgerufen:
//   abmelden.html?token=<uuid>
//
// Das Token steht je Abonnent in newsletter_abonnenten.abmelde_token.
// Die eigentliche Abmeldung macht die Datenbankfunktion newsletter_abmelden,
// damit anonyme Aufrufer keine Schreibrechte auf der Tabelle brauchen
// (siehe supabase/migration-prospekt-versand.sql).

import { supabase } from './supabase.js'

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

const status = document.getElementById('abmelden-status')

function zeige (html) {
  if (status) status.innerHTML = html
}

async function abmelden () {
  const token = new URLSearchParams(window.location.search).get('token')

  if (!token) {
    zeige('Dieser Link ist unvollständig. Bitte nutze den Abmeldelink direkt aus der E-Mail.')
    return
  }

  try {
    const { data, error } = await supabase.rpc('newsletter_abmelden', { token })
    if (error) throw error

    if (data === true) {
      zeige('Du bist abgemeldet. Du bekommst den Prospekt ab sofort nicht mehr.' +
        '<br><br>Schade, dass du gehst. Falls du es dir anders überlegst, kannst du dich jederzeit ' +
        'auf der <a href="index.html">Startseite</a> wieder anmelden.')
    } else {
      zeige('Zu diesem Link haben wir keine Anmeldung gefunden. Möglicherweise bist du bereits abgemeldet.')
    }
  } catch (err) {
    console.error('Abmeldung fehlgeschlagen:', err)
    zeige('Das hat gerade nicht geklappt. Bitte versuche es später noch einmal oder schreib uns an ' +
      '<a href="mailto:info@shoppeninbraunschweig.de">info@shoppeninbraunschweig.de</a>.')
  }
}

initMobileMenu()
abmelden()
