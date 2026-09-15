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

// Interne Benachrichtigung, wenn ein Haendler bezahlt hat. Laeuft hier auf
// Vercel, nutzt daher die dortige Variable SIB_Mail (Resend API-Key).
const RESEND_API_KEY = process.env.SIB_Mail || process.env.RESEND_API_KEY
const MAIL_FROM = 'Shoppen in Braunschweig <info@shoppeninbraunschweig.de>'
const ADMIN_EMAIL = 'info@shoppeninbraunschweig.de'

async function meldeNeuenHaendler (shopId) {
  if (!RESEND_API_KEY || !shopId) return
  try {
    const { data: shop } = await supabase
      .from('shops')
      .select('name, email, adresse')
      .eq('id', shopId)
      .maybeSingle()
    if (!shop) return

    const html = `<!DOCTYPE html><html lang="de"><body style="margin:0;padding:24px;background:#FAFAF8">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#0F0F0F">
    <p style="margin:0 0 16px 0"><strong>Neuer Händler hat bezahlt</strong></p>
    <p style="margin:0 0 16px 0">Geschäft: ${shop.name || ''}</p>
    <p style="margin:0 0 16px 0">E-Mail: ${shop.email || ''}</p>
    <p style="margin:0 0 16px 0">Adresse: ${shop.adresse || ''}</p>
    <p style="margin:0 0 16px 0">Das Abo ist aktiv, der Shop ist damit öffentlich sichtbar.</p>
    <p style="margin:24px 0 0 0"><a href="https://www.shoppeninbraunschweig.de/admin.html" style="display:inline-block;background:#0F0F0F;color:#FAFAF8;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">Zum Admin-Bereich</a></p>
  </div>
</body></html>`

    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: MAIL_FROM,
        to: [ADMIN_EMAIL],
        subject: `Neuer Händler: ${shop.name || 'unbekannt'}`,
        text: `Neuer Händler hat bezahlt.\n\nGeschäft: ${shop.name || ''}\nE-Mail: ${shop.email || ''}\nAdresse: ${shop.adresse || ''}`,
        html
      })
    })
  } catch (err) {
    // Eine fehlgeschlagene Benachrichtigung darf den Webhook nie scheitern lassen.
    console.error('Haendler-Benachrichtigung fehlgeschlagen:', err)
  }
}

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
        await meldeNeuenHaendler(shopId)
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
