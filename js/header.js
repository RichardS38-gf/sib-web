// js/header.js — SIB
// Füllt Suchfelder mit q-Parameter, lädt globalen Chat-Widget und zeigt
// den Login-Status im Header an (Anmelden/Registrieren -> Mein Konto/Dashboard).

import { supabase } from './supabase.js'

export function initHeaderSearch () {
  const q = new URLSearchParams(window.location.search).get('q')
  if (q) {
    document.querySelectorAll('input[name="q"]').forEach((input) => {
      input.value = q
    })
  }

  // Globaler Chat auf allen Seiten (chat-global.js skip auf shop.html selbst)
  import('./chat-global.js').catch(() => {})

  initHeaderAuthState()
}

// Wenn eingeloggt: "Anmelden" -> "Mein Konto" / "Dashboard", "Registrieren" ausblenden
async function initHeaderAuthState () {
  try {
    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return

    const { data: shop } = await supabase.from('shops').select('id').eq('user_id', session.user.id).maybeSingle()
    const ziel = shop ? 'dashboard.html' : 'konto.html'
    const label = shop ? 'Dashboard' : 'Mein Konto'

    document.querySelectorAll('a[href="haendler-login.html"]').forEach((a) => {
      a.textContent = label
      a.href = ziel
    })
    document.querySelectorAll('a[href="haendler-werden.html"]').forEach((a) => {
      a.style.display = 'none'
    })
  } catch (err) {
    // Stumm scheitern — Header bleibt im Standardzustand
  }
}
