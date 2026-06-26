// js/header.js — SIB
// Füllt Suchfelder mit q-Parameter und lädt globalen Chat-Widget.

export function initHeaderSearch () {
  const q = new URLSearchParams(window.location.search).get('q')
  if (q) {
    document.querySelectorAll('input[name="q"]').forEach((input) => {
      input.value = q
    })
  }

  // Globaler Chat auf allen Seiten (chat-global.js skip auf shop.html selbst)
  import('./chat-global.js').catch(() => {})
}
