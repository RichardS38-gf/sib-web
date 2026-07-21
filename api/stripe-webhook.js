// api/stripe-webhook.js — Vercel Function
// Empfängt Stripe-Webhook-Events und pflegt den Abo-Status in Supabase.
//
// Benötigte Umgebungsvariablen:
//   STRIPE_SECRET_KEY          — sk_live_... oder sk_test_...
//   STRIPE_WEBHOOK_SECRET      — whsec_... (aus Stripe Dashboard → Webhooks)
//   SUPABASE_URL               — https://ezruwstzpncunbjzwdfk.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  — service_role Key (NIE im Frontend verwenden)
//
// Wichtig in Vercel: für diese Route bodyParser deaktivieren (siehe config
// unten), da Stripe die rohen Bytes für die Signaturprüfung braucht.

import Stripe from 'stripe'
import { createClient } from '@supabase/supabase-js'
import { buffer } from 'micro'

export const config = {
  api: {
    bodyParser: false
  }
}

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

async function setzeAboStatus ({ anfrageId, status, customerId, subscriptionId, sessionId }) {
  if (!anfrageId) return
  const update = {
    abo_status: status,
    abo_aktualisiert_am: new Date().toISOString()
  }
  if (customerId) update.stripe_customer_id = customerId
  if (subscriptionId) update.stripe_subscription_id = subscriptionId
  if (sessionId) update.stripe_checkout_session_id = sessionId

  const { error } = await supabase
    .from('haendler_anfragen')
    .update(update)
    .eq('id', anfrageId)

  if (error) console.error('Supabase-Update fehlgeschlagen:', error)
}

export default async function handler (req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).end('Method not allowed')
  }

  let event
  try {
    const rawBody = await buffer(req)
    const signature = req.headers['stripe-signature']
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET)
  } catch (err) {
    console.error('Webhook-Signatur ungültig:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        await setzeAboStatus({
          anfrageId: session.metadata?.anfrage_id,
          status: 'aktiv',
          customerId: session.customer,
          subscriptionId: session.subscription,
          sessionId: session.id
        })
        break
      }
      case 'customer.subscription.updated': {
        const sub = event.data.object
        await setzeAboStatus({
          anfrageId: sub.metadata?.anfrage_id,
          status: sub.status === 'active' ? 'aktiv' : sub.status === 'past_due' ? 'zahlung_fehlgeschlagen' : sub.status,
          subscriptionId: sub.id
        })
        break
      }
      case 'customer.subscription.deleted': {
        const sub = event.data.object
        await setzeAboStatus({
          anfrageId: sub.metadata?.anfrage_id,
          status: 'gekuendigt',
          subscriptionId: sub.id
        })
        break
      }
      case 'invoice.payment_failed': {
        const invoice = event.data.object
        // Bei Bedarf: anfrage_id über die Subscription nachschlagen und Status setzen.
        console.warn('Zahlung fehlgeschlagen für Subscription:', invoice.subscription)
        break
      }
      default:
        // Andere Events ignorieren wir bewusst.
        break
    }

    return res.status(200).json({ received: true })
  } catch (err) {
    console.error('Webhook-Verarbeitung fehlgeschlagen:', err)
    return res.status(500).json({ error: 'Webhook-Verarbeitung fehlgeschlagen' })
  }
}
