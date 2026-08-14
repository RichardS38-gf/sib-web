// js/cookie-banner.js — SIB Cookie-Hinweis
//
// Warum es diesen Banner gibt:
// Technisch notwendige Speicherung (Anmelde-Sitzung, Chat) braucht nach
// § 25 Abs. 2 TDDDG keine Einwilligung. Einwilligungspflichtig ist bei uns
// allein das Nachladen der Google Fonts, weil dabei die IP-Adresse an einen
// Server von Google uebertragen wird.
//
// Deshalb: Die Schriften werden NICHT statisch im HTML eingebunden, sondern
// erst hier nachgeladen, sobald jemand zugestimmt hat. Ohne Zustimmung zeigt
// der Browser die System-Schriften. Die Seite bleibt voll benutzbar.
//
// Gespeichert wird die Entscheidung im Local Storage unter sib_cookie_consent
// mit den Werten "alle" oder "notwendig".

(function () {
  var SPEICHER_KEY = 'sib_cookie_consent'
  var SCHRIFTEN_URL = 'https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,700;1,400;1,700&family=Inter:wght@300;400;500;600;700;800&family=Pacifico&display=swap'

  function leseEntscheidung () {
    try { return localStorage.getItem(SPEICHER_KEY) } catch (e) { return null }
  }

  function speichereEntscheidung (wert) {
    try { localStorage.setItem(SPEICHER_KEY, wert) } catch (e) { /* Speicher gesperrt */ }
  }

  // Laedt die Google Fonts nach. Wird nur bei Zustimmung aufgerufen.
  function ladeSchriften () {
    if (document.getElementById('sib-google-fonts')) return

    var pre1 = document.createElement('link')
    pre1.rel = 'preconnect'
    pre1.href = 'https://fonts.googleapis.com'
    document.head.appendChild(pre1)

    var pre2 = document.createElement('link')
    pre2.rel = 'preconnect'
    pre2.href = 'https://fonts.gstatic.com'
    pre2.crossOrigin = 'anonymous'
    document.head.appendChild(pre2)

    var link = document.createElement('link')
    link.id = 'sib-google-fonts'
    link.rel = 'stylesheet'
    link.href = SCHRIFTEN_URL
    document.head.appendChild(link)
  }

  function fuegeStileEin () {
    if (document.getElementById('sib-cookie-styles')) return
    var s = document.createElement('style')
    s.id = 'sib-cookie-styles'
    s.textContent = [
      '.sib-cookie{position:fixed;left:1rem;right:1rem;bottom:1rem;z-index:1200;max-width:44rem;margin:0 auto;',
      'background:#fff;color:#0D0D0D;border:1px solid #e5e5e5;border-radius:14px;',
      'box-shadow:0 8px 40px rgba(0,0,0,.18);padding:1.25rem 1.25rem 1rem;',
      'font-family:inherit;animation:sibCookieIn .25s ease}',
      '@keyframes sibCookieIn{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}',
      '.sib-cookie[hidden]{display:none!important}',
      '.sib-cookie__title{font-weight:700;font-size:1rem;margin-bottom:.4rem}',
      '.sib-cookie__text{font-size:.85rem;line-height:1.6;color:#555;margin-bottom:1rem}',
      '.sib-cookie__text a{color:#0D0D0D;text-decoration:underline;text-underline-offset:3px}',
      '.sib-cookie__btns{display:flex;gap:.6rem;flex-wrap:wrap}',
      '.sib-cookie__btn{flex:1 1 12rem;padding:.7rem 1.2rem;border-radius:999px;font-size:.85rem;',
      'font-weight:600;cursor:pointer;font-family:inherit;transition:opacity .15s}',
      '.sib-cookie__btn:hover{opacity:.85}',
      '.sib-cookie__btn--primary{background:#0D0D0D;color:#fff;border:1px solid #0D0D0D}',
      '.sib-cookie__btn--ghost{background:transparent;color:#0D0D0D;border:1px solid #ccc}',
      '@media(max-width:520px){.sib-cookie{padding:1rem;left:.75rem;right:.75rem;bottom:.75rem}',
      '.sib-cookie__btn{flex:1 1 100%}}'
    ].join('')
    document.head.appendChild(s)
  }

  function zeigeBanner () {
    fuegeStileEin()

    var box = document.createElement('div')
    box.className = 'sib-cookie'
    box.setAttribute('role', 'dialog')
    box.setAttribute('aria-label', 'Hinweis zu Cookies')
    box.innerHTML =
      '<p class="sib-cookie__title">Kurz zu deinen Daten</p>' +
      '<p class="sib-cookie__text">Wir nutzen nur, was fürs Funktionieren nötig ist, etwa deine Anmeldung. ' +
      'Kein Tracking, keine Werbung. Zusätzlich laden wir gerne unsere Schriftarten von Google, dabei wird ' +
      'deine IP-Adresse an Google übertragen. Das machen wir nur, wenn du zustimmst. ' +
      'Mehr dazu in der <a href="datenschutz.html#cookies">Datenschutzerklärung</a>.</p>' +
      '<div class="sib-cookie__btns">' +
      '<button type="button" class="sib-cookie__btn sib-cookie__btn--ghost" data-wahl="notwendig">Nur Notwendiges</button>' +
      '<button type="button" class="sib-cookie__btn sib-cookie__btn--primary" data-wahl="alle">Einverstanden</button>' +
      '</div>'

    document.body.appendChild(box)

    box.querySelectorAll('[data-wahl]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var wahl = btn.dataset.wahl
        speichereEntscheidung(wahl)
        if (wahl === 'alle') ladeSchriften()
        box.remove()
      })
    })
  }

  function start () {
    var entscheidung = leseEntscheidung()
    if (entscheidung === 'alle') { ladeSchriften(); return }
    if (entscheidung === 'notwendig') return
    zeigeBanner()
  }

  // Erlaubt es, die Entscheidung spaeter zu aendern (z.B. ueber einen Link
  // in der Datenschutzerklaerung): window.sibCookieEinstellungen()
  window.sibCookieEinstellungen = function () {
    try { localStorage.removeItem(SPEICHER_KEY) } catch (e) { /* egal */ }
    if (!document.querySelector('.sib-cookie')) zeigeBanner()
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start)
  } else {
    start()
  }
})()
