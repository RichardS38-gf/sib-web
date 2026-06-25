// js/header.js — SIB
// Gemeinsame Header-Hilfen: füllt alle Suchfelder (Header + Hero) mit dem
// q-Parameter aus der URL vor, damit der Suchbegriff sichtbar bleibt.

export function initHeaderSearch () {
  const q = new URLSearchParams(window.location.search).get('q')
  if (!q) return
  document.querySelectorAll('input[name="q"]').forEach((input) => {
    input.value = q
  })
}
