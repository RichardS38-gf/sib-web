// js/footer.js — Footer-Spalten (details/summary) sind im Markup per open-Attribut
// aufgeklappt. Auf Desktop (>=900px) bleiben sie immer offen und nicht klickbar
// (siehe components.css). Unterhalb 900px klappen wir sie hier zu Dropdowns zu.

(function () {
  var desktop = window.matchMedia('(min-width: 900px)')

  function sync () {
    var cols = document.querySelectorAll('.site-footer__col')
    cols.forEach(function (col) {
      // Desktop: immer offen. Mobile: eingeklappt starten, Nutzer kann toggeln.
      col.open = desktop.matches
    })
  }

  sync()

  // Bei Wechsel zwischen Mobile/Desktop erneut angleichen.
  if (desktop.addEventListener) {
    desktop.addEventListener('change', sync)
  } else if (desktop.addListener) {
    desktop.addListener(sync) // Fallback für ältere Browser
  }
})()
