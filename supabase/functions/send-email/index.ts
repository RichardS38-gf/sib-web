// supabase/functions/send-email/index.ts
// SIB — E-Mail-Benachrichtigungen via Resend.com
//
// Zwei Typen:
//   type: "reservierung"  -> Reservierungsbestätigung an Kunden
//   type: "abholbereit"   -> Abholbereit-Benachrichtigung an Kunden
//
// Aufruf aus dem Frontend via supabase.functions.invoke('send-email', { body: {...} })
//
// Umgebungsvariablen (in Supabase als Secrets setzen):
//   RESEND_API_KEY  (Pflicht)  — API-Key von resend.com
//   RESEND_FROM     (optional) — Absender, z. B.
//                                "Shoppen in Braunschweig <noreply@shoppeninbraunschweig.de>"
//                                Default: "Shoppen in Braunschweig <onboarding@resend.dev>"

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
// Vorübergehend Resends Test-Absender: funktioniert ohne Domain-Verifizierung,
// darf aber NUR an die eigene Resend-Account-E-Mail senden (siehe unten).
// Sobald die Domain verifiziert ist: RESEND_FROM-Secret setzen.
const FROM = Deno.env.get('RESEND_FROM') || 'onboarding@resend.dev'

// Resend erlaubt im Test-Modus (ohne verifizierte Domain) nur den Versand an
// die eigene Account-Adresse. An andere Empfänger wird trotzdem versucht zu
// senden — etwaige Fehler werden nur still geloggt, nicht als Fehler gemeldet.
const TEST_EMPFAENGER = 'richardschilling@maneri.de'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
}

function jsonResponse (body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
  })
}

// HTML-Escaping für Werte aus Nutzereingaben
function esc (value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

// Datum -> DD.MM.YYYY
function formatDatum (iso: unknown): string {
  if (!iso) return ''
  const d = new Date(String(iso))
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()}`
}

// Schlichtes Schwarz/Weiß-HTML aus Text-Absätzen
function htmlMail (absaetze: string[]): string {
  const body = absaetze
    .map((a) => `<p style="margin:0 0 16px 0">${a}</p>`)
    .join('')
  return `<!DOCTYPE html><html lang="de"><body style="margin:0;padding:24px;background:#ffffff">
  <div style="max-width:520px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#0F0F0F">
    ${body}
    <p style="margin:24px 0 0 0;color:#777777;font-size:13px">Shoppen in Braunschweig — Lokale Händler. Einzigartige Produkte.</p>
  </div>
</body></html>`
}

interface Payload {
  type?: string
  kunde_name?: string
  kunde_email?: string
  produkt_titel?: string
  shop_name?: string
  shop_adresse?: string
  reservierung_id?: string
  ablauf_am?: string
}

function baueMail (p: Payload): { subject: string; text: string; html: string } | null {
  const name = p.kunde_name || 'zusammen'
  const titel = p.produkt_titel || 'dein Artikel'
  const shop = p.shop_name || 'dem Geschäft'
  const adresse = p.shop_adresse || ''

  if (p.type === 'reservierung') {
    const ablauf = formatDatum(p.ablauf_am)
    const subject = `Deine Reservierung bei ${shop}`
    const text = [
      `Hallo ${name},`,
      `du hast "${titel}" bei ${shop} reserviert.`,
      adresse ? `Adresse: ${adresse}` : '',
      `Deine Reservierung ist 7 Tage gültig${ablauf ? ` – bis ${ablauf}` : ''}.`,
      'Wir benachrichtigen dich per E-Mail, sobald der Artikel abholbereit ist.',
      'Viele Grüße\nShoppen in Braunschweig'
    ].filter(Boolean).join('\n\n')
    const html = htmlMail([
      `Hallo ${esc(name)},`,
      `du hast <strong>${esc(titel)}</strong> bei <strong>${esc(shop)}</strong> reserviert.`,
      adresse ? `Adresse: ${esc(adresse)}` : '',
      `Deine Reservierung ist 7 Tage gültig${ablauf ? ` – bis <strong>${esc(ablauf)}</strong>` : ''}.`,
      'Wir benachrichtigen dich per E-Mail, sobald der Artikel abholbereit ist.'
    ].filter(Boolean))
    return { subject, text, html }
  }

  if (p.type === 'abholbereit') {
    const subject = `Dein Artikel ist abholbereit — ${shop}`
    const text = [
      `Hallo ${name},`,
      `dein reservierter Artikel "${titel}" ist jetzt abholbereit.`,
      `Hole ihn ab bei:\n${shop}${adresse ? `\n${adresse}` : ''}`,
      'Bitte hole den Artikel innerhalb der nächsten 7 Tage ab.',
      'Viele Grüße\nShoppen in Braunschweig'
    ].join('\n\n')
    const html = htmlMail([
      `Hallo ${esc(name)},`,
      `dein reservierter Artikel <strong>${esc(titel)}</strong> ist jetzt abholbereit.`,
      `Hole ihn ab bei:<br><strong>${esc(shop)}</strong>${adresse ? `<br>${esc(adresse)}` : ''}`,
      'Bitte hole den Artikel innerhalb der nächsten 7 Tage ab.'
    ])
    return { subject, text, html }
  }

  return null
}

Deno.serve(async (req: Request) => {
  // CORS-Preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  if (!RESEND_API_KEY) {
    console.error('RESEND_API_KEY ist nicht gesetzt.')
    return jsonResponse({ error: 'E-Mail-Dienst nicht konfiguriert.' }, 500)
  }

  let payload: Payload
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'Ungültiger Request-Body.' }, 400)
  }

  if (!payload.kunde_email) {
    return jsonResponse({ error: 'kunde_email fehlt.' }, 400)
  }

  const mail = baueMail(payload)
  if (!mail) {
    return jsonResponse({ error: 'Unbekannter type (erwartet: reservierung | abholbereit).' }, 400)
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: FROM,
        to: [payload.kunde_email],
        subject: mail.subject,
        text: mail.text,
        html: mail.html
      })
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      // Im Test-Modus scheitert der Versand an fremde Adressen erwartungsgemäß.
      // Fehler nur still loggen und nicht-fatal antworten, damit der Frontend-
      // Ablauf (Reservierung/Bestätigung) nicht gestört wird.
      const fremderEmpfaenger = payload.kunde_email !== TEST_EMPFAENGER
      console.error(
        `Resend-Fehler (${res.status})${fremderEmpfaenger ? ' — Empfänger ist nicht der Test-Account, im Test-Modus erwartet' : ''}:`,
        data
      )
      return jsonResponse({ ok: false, logged: true }, 200)
    }

    return jsonResponse({ ok: true, id: (data as { id?: string }).id })
  } catch (err) {
    console.error('Senden fehlgeschlagen:', err)
    return jsonResponse({ ok: false, logged: true }, 200)
  }
})
