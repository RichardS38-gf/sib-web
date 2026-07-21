// api/create-checkout-session.js — Vercel Function
// Erstellt eine Stripe-Checkout-Session (Abo, 20 €/Monat) für eine
// Händler-Registrierungsanfrage und gibt die Checkout-URL zurück.
//
// Benötigte Umgebungsvariablen (in Vercel → Settings → Environment Variables):
//   STRIPE_SECRET_KEY   — sk_live_... oder sk_test_...
//   STRIPE_PRICE_ID     — price_... (wiederkehrender Preis, 20 EUR / Monat)
//   PUBLIC_SITE_URL     — z.B. https://shoppeninbraunschweig.de

import Stripe from 'stripe'

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { anfrageId, email, geschaeftName } = req.body || {}

    if (!anfrageId || !email) {
      return res.status(400).json({ error: 'anfrageId und email sind erforderlich' })
    }

    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
    const siteUrl = process.env.PUBLIC_SITE_URL || 'https://shoppeninbraunschweig.de'

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer_email: email,
      line_items: [
        {
          price: process.env.STRIPE_PRICE_ID,
          quantity: 1
        }
      ],
      metadata: {
        anfrage_id: anfrageId,
        geschaeft_name: geschaeftName || ''
      },
      subscription_data: {
        metadata: {
          anfrage_id: anfrageId
        }
      },
      success_url: `${siteUrl}/haendler-werden.html?rolle=haendler&zahlung=erfolg&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/haendler-werden.html?rolle=haendler&zahlung=abgebrochen`
    })

    return res.status(200).json({ url: session.url })
  } catch (err) {
    console.error('Stripe Checkout Session Fehler:', err)
    return res.status(500).json({ error: 'Checkout-Session konnte nicht erstellt werden' })
  }
}
