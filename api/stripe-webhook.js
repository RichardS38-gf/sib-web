// api/stripe-webhook.js — Vercel Function
// Empfaengt Stripe-Webhook-Events und pflegt den Abo-Status in der Tabelle
// public.shops. Erst nach erfolgreicher Zahlung wird ein Shop freigeschaltet
// (aktiv = true), vorher ist er weder oeffentlich sichtbar noch nutzbar.
//
// Zuordnung Zahlung -> Shop:
//   Der Payment Link wird beim Registrieren mit ?client_reference_id=<shop_id>
//   aufgerufen (siehe js/haendler-werden.js). Stripe reicht diesen Wert im
//   Event checkout.session.completed als session.client_reference_id durch.
//   Fuer spaetere Events (Kuendigung, fehlgeschlagene Zahlung) merken wir uns
//   die subscription_id am Shop und suchen darueber.
//
// Benoetigte Umgebungsvariablen (Vercel -> Settings -> Environment Variables):
//   STRIPE_SECRET_KEY          sk_live_... oder sk_test_...
//   STRIPE_WEBHOOK_SECRET      whsec_... (Stripe Dashboard -> Webhooks)
//   SUPABASE_URL               https://ezruwstzpncunbjzwdfk.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY  service_role Key (NIE im Frontend verwenden)
//
// Voraussetzung: migration-stripe-abo.sql wurde im Supabase SQL Editor
// ausgefuehrt.

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

// Setzt den Abo-Status. `aktiv` steuert die oeffentliche Sichtbarkeit und wird
// bewusst mitgefuehrt: nur ein bezahltes Abo macht den Shop sichtbar.
async function setzeAboStatus (filter, { status, customerId, subscriptionId }) {
  const update = {
    abo_status: status,
    aktiv: status === 'aktiv',
    abo_aktualisiert_am: new Date().toISOString()
  }
  if (customerId) update.stripe_customer_id = customerId
  if (subscriptionId) update.stripe_subscription_id = subscriptionId

  let query = supabase.from('shops').update(update)
  query = filter.shopId
    ? query.eq('id', filter.shopId)
    : query.eq('stripe_subscription_id', filter.subscriptionId)

  const { data, error } = await query.select('id')
  if (error) {
    console.error('Shop-Update fehlgeschlagen:', error)
    return
  }
  if (!data || data.length === 0) {
    console.warn('Kein Shop zu diesem Event gefunden:', filter)
  }
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
    console.error('Webhook-Signatur ungueltig:', err.message)
    return res.status(400).send(`Webhook Error: ${err.message}`)
  }

  try {
    switch (event.type) {
      // Zahlung erfolgreich -> Shop freischalten
      case 'checkout.session.completed': {
        const session = event.data.object
        const shopId = session.client_reference_id
        if (!shopId) {
          console.warn('checkout.session.completed ohne client_reference_id:', session.id)
          break
        }
        await setzeAboStatus({ shopId }, {
          status: 'aktiv',
          customerId: session.customer,
          subscriptionId: session.subscription
        })
        break
      }

      // Statusaenderungen am Abo (z.B. Zahlung ueberfaellig, reaktiviert)
      case 'customer.subscription.updated': {
        const sub = event.data.object
        const status = sub.status === 'active' || sub.status === 'trialing'
          ? 'aktiv'
          : sub.status === 'past_due' || sub.status === 'unpaid'
            ? 'zahlung_fehlgeschlagen'
            : sub.status === 'canceled'
              ? 'gekuendigt'
              : sub.status
        await setzeAboStatus({ subscriptionId: sub.id }, { status, subscriptionId: sub.id })
        break
      }

      // Abo beendet -> Shop wieder sperren
      case 'customer.subscription.deleted': {
        const sub = event.data.object
        await setzeAboStatus({ subscriptionId: sub.id }, { status: 'gekuendigt', subscriptionId: sub.id })
        break
      }

      // Wiederkehrende Zahlung fehlgeschlagen
      case 'invoice.payment_failed': {
        const invoice = event.data.object
        const subId = invoice.subscription
        if (subId) {
          await setzeAboStatus({ subscriptionId: subId }, { status: 'zahlung_fehlgeschlagen', subscriptionId: subId })
        }
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
