// js/haendler-shop-setup.js — Legt für einen frisch registrierten Händler
// automatisch seinen Shop an (einmalig), falls noch keiner existiert.
// Wird sowohl direkt nach der Registrierung (haendler-werden.js) als auch
// beim Login/Dashboard-Start aufgerufen (login.js, dashboard.js) -- idempotent.
// Deckt so auch den Fall ab, dass Supabase eine E-Mail-Bestätigung verlangt
// und der Shop erst beim ersten Login nach Bestätigung angelegt werden kann,
// weil die INSERT-Policy eine aktive Session (auth.uid()) voraussetzt.
//
// Voraussetzung: Migration "migration-haendler-selbstregistrierung.sql"
// wurde im Supabase SQL Editor ausgeführt (INSERT-Policy für Händler).

function slugify (text) {
  return (String(text || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')) || 'shop'
}

/**
 * @param {object} supabase - Supabase-Client
 * @param {object} user - auth.users-Objekt (z.B. session.user)
 * @param {object} overrides - optionale frische Werte (z.B. gerade hochgeladenes Logo),
 *                              überschreiben die in user_metadata gespeicherten Werte
 * @returns {Promise<object|null>} der (bestehende oder neu angelegte) Shop, oder null
 */
export async function stelleHaendlerShopSicher (supabase, user, overrides = {}) {
  if (!user) return null

  const { data: bestehend, error: selErr } = await supabase
    .from('shops').select('*').eq('user_id', user.id).maybeSingle()
  if (selErr) { console.error('Shop-Prüfung fehlgeschlagen:', selErr); return null }
  if (bestehend) return bestehend

  const meta = user.user_metadata || {}
  if (meta.rolle !== 'haendler' || !meta.geschaeft_name) return null // kein Haendler-Signup -> nichts zu tun

  const basisSlug = slugify(meta.geschaeft_name)

  for (let versuch = 0; versuch < 5; versuch++) {
    const slug = versuch === 0 ? basisSlug : `${basisSlug}-${Math.random().toString(36).slice(2, 6)}`
    const { data, error } = await supabase.from('shops').insert({
      user_id: user.id,
      name: meta.geschaeft_name,
      slug,
      adresse: meta.adresse || null,
      telefon: meta.telefon || null,
      email: user.email,
      beschreibung: meta.beschreibung || null,
      logo_url: overrides.logo_url ?? meta.logo_url ?? null,
      // Shop startet inaktiv und wird erst durch den Stripe-Webhook nach
      // erfolgreicher Zahlung freigeschaltet (siehe migration-stripe-abo.sql).
      aktiv: false,
      abo_status: 'offen'
    }).select('*').single()

    if (!error) return data
    if (error.code !== '23505') { console.error('Shop anlegen fehlgeschlagen:', error); return null }
    // 23505 = Slug bereits vergeben -> nochmal mit anderem Suffix versuchen
  }
  return null
}
