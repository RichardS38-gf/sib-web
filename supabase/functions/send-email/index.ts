// supabase/functions/send-email/index.ts
// SIB — E-Mail-Benachrichtigungen via Resend.com
//
// Ein Endpunkt, viele Anlaesse. Der Typ steckt im Feld "type".
//
// An Kundinnen und Kunden:
//   reservierung             Bestaetigung direkt nach dem Reservieren
//   abholbereit              Haendler hat die Reservierung bestaetigt
//   reservierung_abgelaufen  48 Stunden verstrichen, Reservierung verfallen
//
// An Haendler:
//   reservierung_haendler    Neue Reservierung im eigenen Shop
//   reservierung_storniert   Kunde hat storniert
//   neue_bewertung           Neue Bewertung zu einem Produkt
//   neue_nachricht           Neue Nachricht im Chat
//
// An uns (info@shoppeninbraunschweig.de):
//   kontakt                  Neue Nachricht ueber das Kontaktformular
//   neues_produkt            Produkt eingepflegt, Freigabe noetig
//   neuer_haendler           Haendler hat bezahlt und ist jetzt aktiv
//
// SICHERHEIT: Bei allen Typen, die an uns gehen, wird der Empfaenger im Code
// festgelegt und NICHT aus dem Request uebernommen. Sonst waere die Function
// ein offener Mail-Versender.
//
// Secrets (Supabase -> Edge Functions -> send-email -> Secrets):
//   RESEND_API_KEY   Pflicht
//   RESEND_FROM      optional, Default siehe unten
//   ADMIN_EMAIL      optional, Default info@shoppeninbraunschweig.de

const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
const FROM = Deno.env.get('RESEND_FROM') ||
  'Shoppen in Braunschweig <info@shoppeninbraunschweig.de>'
const ADMIN_EMAIL = Deno.env.get('ADMIN_EMAIL') || 'info@shoppeninbraunschweig.de'

// Wie lange eine Reservierung gilt. Muss zum Cron-Job in
// migration-reservierung-ablauf.sql passen.
const GUELTIGKEIT_TEXT = '48 Stunden'

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

function esc (value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatDatumZeit (iso: unknown): string {
  if (!iso) return ''
  const d = new Date(String(iso))
  if (isNaN(d.getTime())) return ''
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} um ${p(d.getHours())}:${p(d.getMinutes())} Uhr`
}

// Schlichtes Schwarz/Weiss-HTML, passend zur Seite.
function htmlMail (absaetze: string[], cta?: { text: string; url: string }, fusszeile?: string): string {
  const body = absaetze
    .filter(Boolean)
    .map((a) => `<p style="margin:0 0 16px 0">${a}</p>`)
    .join('')
  const button = cta
    ? `<p style="margin:24px 0 0 0"><a href="${esc(cta.url)}" style="display:inline-block;background:#0F0F0F;color:#FAFAF8;text-decoration:none;padding:12px 22px;border-radius:999px;font-weight:600">${esc(cta.text)}</a></p>`
    : ''
  const extra = fusszeile
    ? `<p style="margin:12px 0 0 0;color:#777777;font-size:12px">${fusszeile}</p>`
    : ''
  return `<!DOCTYPE html><html lang="de"><body style="margin:0;padding:24px;background:#FAFAF8">
  <div style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:14px;padding:28px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:#0F0F0F">
    ${body}
    ${button}
    <p style="margin:28px 0 0 0;color:#777777;font-size:13px">Shoppen in Braunschweig. Lokale Händler. Einzigartige Produkte.</p>
    ${extra}
  </div>
</body></html>`
}

const BASIS_URL = 'https://www.shoppeninbraunschweig.de'

interface Payload {
  type?: string
  // Empfaenger bei Kunden- und Haendlermails
  empfaenger_email?: string
  kunde_email?: string
  // Inhalte
  kunde_name?: string
  produkt_titel?: string
  shop_name?: string
  shop_adresse?: string
  groesse?: string
  farbe?: string
  reservierung_id?: string
  ablauf_am?: string
  absender_name?: string
  absender_email?: string
  nachricht?: string
  betreff?: string
  sterne?: number
  abmelde_token?: string
  anzahl_artikel?: number
}

interface Mail { an: string; subject: string; html: string; text: string }

function baueMail (p: Payload): Mail | null {
  const name = p.kunde_name || 'zusammen'
  const titel = p.produkt_titel || 'dein Artikel'
  const shop = p.shop_name || 'dem Geschäft'
  const adresse = p.shop_adresse || ''
  const variante = [p.farbe, p.groesse].filter(Boolean).join(', ')
  const kundenMail = p.empfaenger_email || p.kunde_email || ''

  const reservierungLink = p.reservierung_id
    ? `${BASIS_URL}/reservierung.html?id=${encodeURIComponent(p.reservierung_id)}`
    : ''

  switch (p.type) {
    // ── An Kundinnen und Kunden ──────────────────────────────────────────
    case 'reservierung': {
      const ablauf = formatDatumZeit(p.ablauf_am)
      const abs = [
        `Hallo ${esc(name)},`,
        `du hast <strong>${esc(titel)}</strong>${variante ? ` (${esc(variante)})` : ''} bei <strong>${esc(shop)}</strong> reserviert.`,
        adresse ? `Abholadresse: ${esc(adresse)}` : '',
        `Deine Reservierung gilt ${GUELTIGKEIT_TEXT}${ablauf ? `, also bis zum ${esc(ablauf)}` : ''}.`,
        'Wir melden uns, sobald der Artikel abholbereit ist.'
      ]
      return {
        an: kundenMail,
        subject: `Deine Reservierung bei ${shop}`,
        html: htmlMail(abs, reservierungLink ? { text: 'Reservierung ansehen', url: reservierungLink } : undefined),
        text: `Hallo ${name},\n\ndu hast "${titel}"${variante ? ` (${variante})` : ''} bei ${shop} reserviert.\n${adresse ? `Abholadresse: ${adresse}\n` : ''}Deine Reservierung gilt ${GUELTIGKEIT_TEXT}${ablauf ? `, also bis zum ${ablauf}` : ''}.\n${reservierungLink ? `\n${reservierungLink}\n` : ''}\nViele Grüße\nShoppen in Braunschweig`
      }
    }

    case 'abholbereit': {
      const abs = [
        `Hallo ${esc(name)},`,
        `<strong>${esc(titel)}</strong>${variante ? ` (${esc(variante)})` : ''} liegt für dich bereit.`,
        `Abholen bei:<br><strong>${esc(shop)}</strong>${adresse ? `<br>${esc(adresse)}` : ''}`,
        `Bitte hole den Artikel innerhalb von ${GUELTIGKEIT_TEXT} ab.`
      ]
      return {
        an: kundenMail,
        subject: `Abholbereit: ${titel}`,
        html: htmlMail(abs, reservierungLink ? { text: 'Reservierung ansehen', url: reservierungLink } : undefined),
        text: `Hallo ${name},\n\n"${titel}"${variante ? ` (${variante})` : ''} liegt für dich bereit.\n\nAbholen bei:\n${shop}${adresse ? `\n${adresse}` : ''}\n\nBitte hole den Artikel innerhalb von ${GUELTIGKEIT_TEXT} ab.\n\nViele Grüße\nShoppen in Braunschweig`
      }
    }

    case 'reservierung_abgelaufen': {
      const abs = [
        `Hallo ${esc(name)},`,
        `deine Reservierung für <strong>${esc(titel)}</strong> bei <strong>${esc(shop)}</strong> ist abgelaufen.`,
        `Reservierungen gelten ${GUELTIGKEIT_TEXT}. Der Artikel steht jetzt wieder für andere bereit.`,
        'Falls du ihn trotzdem noch möchtest, schau gern nach, ob er noch verfügbar ist.'
      ]
      return {
        an: kundenMail,
        subject: `Reservierung abgelaufen: ${titel}`,
        html: htmlMail(abs, { text: 'Zu den Produkten', url: `${BASIS_URL}/kategorie.html` }),
        text: `Hallo ${name},\n\ndeine Reservierung für "${titel}" bei ${shop} ist abgelaufen.\nReservierungen gelten ${GUELTIGKEIT_TEXT}.\n\nViele Grüße\nShoppen in Braunschweig`
      }
    }

    // ── An Händler ───────────────────────────────────────────────────────
    case 'reservierung_haendler': {
      const abs = [
        'Hallo,',
        `es gibt eine neue Reservierung für <strong>${esc(titel)}</strong>${variante ? ` (${esc(variante)})` : ''}.`,
        `Kundin oder Kunde: ${esc(name)}${p.kunde_email ? `, ${esc(p.kunde_email)}` : ''}`,
        `Bitte bestätige im Dashboard, sobald der Artikel bereitliegt. Die Reservierung verfällt nach ${GUELTIGKEIT_TEXT} automatisch.`
      ]
      return {
        an: kundenMail,
        subject: `Neue Reservierung: ${titel}`,
        html: htmlMail(abs, { text: 'Zum Dashboard', url: `${BASIS_URL}/dashboard.html` }),
        text: `Hallo,\n\nneue Reservierung für "${titel}"${variante ? ` (${variante})` : ''}.\nKundin oder Kunde: ${name}${p.kunde_email ? `, ${p.kunde_email}` : ''}\n\nBitte im Dashboard bestätigen: ${BASIS_URL}/dashboard.html`
      }
    }

    case 'reservierung_storniert': {
      const abs = [
        'Hallo,',
        `die Reservierung für <strong>${esc(titel)}</strong>${variante ? ` (${esc(variante)})` : ''} wurde storniert.`,
        `Storniert von: ${esc(name)}`,
        'Der Artikel steht wieder zum Verkauf bereit.'
      ]
      return {
        an: kundenMail,
        subject: `Reservierung storniert: ${titel}`,
        html: htmlMail(abs, { text: 'Zum Dashboard', url: `${BASIS_URL}/dashboard.html` }),
        text: `Hallo,\n\ndie Reservierung für "${titel}" wurde von ${name} storniert.`
      }
    }

    case 'neue_bewertung': {
      const sterne = typeof p.sterne === 'number' ? `${p.sterne} von 5 Sternen` : ''
      const abs = [
        'Hallo,',
        `es gibt eine neue Bewertung für <strong>${esc(titel)}</strong>.`,
        sterne ? `Bewertung: ${esc(sterne)}` : '',
        p.nachricht ? `„${esc(p.nachricht)}"` : ''
      ]
      return {
        an: kundenMail,
        subject: `Neue Bewertung: ${titel}`,
        html: htmlMail(abs, { text: 'Zum Dashboard', url: `${BASIS_URL}/dashboard.html` }),
        text: `Hallo,\n\nneue Bewertung für "${titel}".\n${sterne}\n${p.nachricht || ''}`
      }
    }

    case 'neue_nachricht': {
      const abs = [
        'Hallo,',
        `du hast eine neue Nachricht von <strong>${esc(p.absender_name || 'einer Kundin oder einem Kunden')}</strong>.`,
        p.nachricht ? `„${esc(p.nachricht)}"` : ''
      ]
      return {
        an: kundenMail,
        subject: 'Neue Nachricht bei Shoppen in Braunschweig',
        html: htmlMail(abs, { text: 'Nachricht öffnen', url: `${BASIS_URL}/dashboard.html` }),
        text: `Hallo,\n\ndu hast eine neue Nachricht von ${p.absender_name || 'einer Kundin oder einem Kunden'}.\n\n${p.nachricht || ''}`
      }
    }

    // ── An uns ───────────────────────────────────────────────────────────
    case 'kontakt': {
      const abs = [
        '<strong>Neue Nachricht über das Kontaktformular</strong>',
        `Von: ${esc(p.absender_name || '')} (${esc(p.absender_email || '')})`,
        p.betreff ? `Betreff: ${esc(p.betreff)}` : '',
        p.nachricht ? esc(p.nachricht).replace(/\n/g, '<br>') : ''
      ]
      return {
        an: ADMIN_EMAIL,
        subject: `Kontaktformular: ${p.betreff || 'Neue Nachricht'}`,
        html: htmlMail(abs),
        text: `Neue Nachricht über das Kontaktformular\n\nVon: ${p.absender_name} (${p.absender_email})\nBetreff: ${p.betreff || ''}\n\n${p.nachricht || ''}`
      }
    }

    case 'neues_produkt': {
      const abs = [
        '<strong>Neues Produkt wartet auf Freigabe</strong>',
        `Produkt: ${esc(titel)}`,
        `Händler: ${esc(shop)}`,
        'Bitte im Admin-Bereich prüfen und freigeben.'
      ]
      return {
        an: ADMIN_EMAIL,
        subject: `Freigabe nötig: ${titel}`,
        html: htmlMail(abs, { text: 'Zum Admin-Bereich', url: `${BASIS_URL}/admin.html` }),
        text: `Neues Produkt wartet auf Freigabe.\n\nProdukt: ${titel}\nHändler: ${shop}\n\n${BASIS_URL}/admin.html`
      }
    }

    case 'neuer_haendler': {
      const abs = [
        '<strong>Neuer Händler hat bezahlt</strong>',
        `Geschäft: ${esc(shop)}`,
        p.absender_email ? `E-Mail: ${esc(p.absender_email)}` : '',
        'Das Abo ist aktiv, der Shop ist damit öffentlich sichtbar.'
      ]
      return {
        an: ADMIN_EMAIL,
        subject: `Neuer Händler: ${shop}`,
        html: htmlMail(abs, { text: 'Zum Admin-Bereich', url: `${BASIS_URL}/admin.html` }),
        text: `Neuer Händler hat bezahlt.\n\nGeschäft: ${shop}\n${p.absender_email || ''}\n\n${BASIS_URL}/admin.html`
      }
    }

    case 'neuer_kaeufer': {
      const abs = [
        '<strong>Neues Käufer-Konto</strong>',
        `Name: ${esc(name)}`,
        p.absender_email ? `E-Mail: ${esc(p.absender_email)}` : ''
      ]
      return {
        an: ADMIN_EMAIL,
        subject: 'Neues Käufer-Konto',
        html: htmlMail(abs),
        text: `Neues Käufer-Konto.\n\nName: ${name}\n${p.absender_email || ''}`
      }
    }

    // ── Willkommensmails ────────────────────────────────────────
    case 'willkommen_haendler': {
      const abs = [
        `Hallo ${esc(name)},`,
        `schön, dass <strong>${esc(shop)}</strong> jetzt bei Shoppen in Braunschweig dabei ist. Deine Zahlung ist eingegangen, dein Geschäft ist freigeschaltet.`,
        'So legst du los:',
        '1. Shop-Profil vervollständigen: Logo, Beschreibung, Öffnungszeiten<br>2. Erste Produkte einstellen, gern mit mehreren Fotos<br>3. Wir prüfen neue Produkte kurz und geben sie frei',
        'Fragen? Antworte einfach auf diese E-Mail.'
      ]
      return {
        an: kundenMail,
        subject: 'Willkommen bei Shoppen in Braunschweig',
        html: htmlMail(abs, { text: 'Zum Dashboard', url: `${BASIS_URL}/dashboard.html` }),
        text: `Hallo ${name},\n\nschön, dass ${shop} jetzt bei Shoppen in Braunschweig dabei ist. Deine Zahlung ist eingegangen, dein Geschäft ist freigeschaltet.\n\nSo legst du los:\n1. Shop-Profil vervollständigen\n2. Erste Produkte einstellen\n3. Wir prüfen neue Produkte und geben sie frei\n\n${BASIS_URL}/dashboard.html`
      }
    }

    case 'willkommen_kaeufer': {
      const abs = [
        `Hallo ${esc(name)},`,
        'willkommen bei Shoppen in Braunschweig. Dein Konto ist fertig.',
        'Ab jetzt kannst du Produkte aus Braunschweiger Geschäften online reservieren und vor Ort abholen. Reservieren ist kostenlos, bezahlt wird erst im Laden.',
        'In deinem Konto findest du deine Reservierungen, deine Wunschliste und deine Nachrichten an Händler.'
      ]
      return {
        an: kundenMail,
        subject: 'Willkommen bei Shoppen in Braunschweig',
        html: htmlMail(abs, { text: 'Produkte entdecken', url: `${BASIS_URL}/kategorie.html` }),
        text: `Hallo ${name},\n\nwillkommen bei Shoppen in Braunschweig. Dein Konto ist fertig.\n\nAb jetzt kannst du Produkte aus Braunschweiger Geschäften online reservieren und vor Ort abholen.\n\n${BASIS_URL}/kategorie.html`
      }
    }

    case 'newsletter_anmeldung': {
      const abs = [
        'Hallo,',
        'danke für deine Anmeldung zum Prospekt von Shoppen in Braunschweig.',
        'Einmal im Monat schicken wir dir neue Produkte, Sonderangebote und frisch dazugekommene Geschäfte aus Braunschweig. Kurz und knapp, ohne Werbeflut.',
        'Abmelden kannst du dich jederzeit über den Link am Ende jeder Ausgabe.'
      ]
      return {
        an: kundenMail,
        subject: 'Du bist dabei: Prospekt von Shoppen in Braunschweig',
        html: htmlMail(abs, { text: 'Aktuelle Ausgabe ansehen', url: `${BASIS_URL}/newsletter.html` }),
        text: `Hallo,\n\ndanke für deine Anmeldung zum Prospekt von Shoppen in Braunschweig.\n\nEinmal im Monat schicken wir dir neue Produkte, Sonderangebote und frisch dazugekommene Geschäfte.\n\n${BASIS_URL}/newsletter.html`
      }
    }

    case 'prospekt': {
      const monate = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
        'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']
      const jetzt = new Date()
      const monatName = monate[jetzt.getMonth()]
      const anzahl = typeof p.anzahl_artikel === 'number' ? p.anzahl_artikel : 0
      const abmeldeUrl = p.abmelde_token
        ? `${BASIS_URL}/abmelden.html?token=${encodeURIComponent(p.abmelde_token)}`
        : ''

      const abs = [
        `<strong>Der Prospekt für ${esc(monatName)} ist da.</strong>`,
        anzahl > 0
          ? `Diesen Monat haben wir ${anzahl} Artikel aus Braunschweiger Geschäften für dich zusammengestellt: neu Eingetroffenes und aktuelle Sonderangebote.`
          : 'Diesen Monat haben wir wieder Neues aus Braunschweiger Geschäften für dich zusammengestellt.',
        'Reservieren kostet nichts, bezahlt wird erst im Laden.'
      ]

      const fusszeile = abmeldeUrl
        ? `Du willst den Prospekt nicht mehr erhalten? <a href="${esc(abmeldeUrl)}" style="color:#777777">Hier abmelden</a>.`
        : ''

      return {
        an: kundenMail,
        subject: `Der Prospekt für ${monatName} ist da`,
        html: htmlMail(abs, { text: 'Prospekt ansehen', url: `${BASIS_URL}/newsletter.html` }, fusszeile),
        text: `Der Prospekt für ${monatName} ist da.\n\n${anzahl > 0 ? `Diesen Monat haben wir ${anzahl} Artikel aus Braunschweiger Geschäften für dich zusammengestellt.` : 'Diesen Monat haben wir wieder Neues für dich zusammengestellt.'}\n\n${BASIS_URL}/newsletter.html\n\nAbmelden: ${abmeldeUrl}`
      }
    }

    default:
      return null
  }
}

Deno.serve(async (req: Request) => {
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

  const mail = baueMail(payload)
  if (!mail) {
    return jsonResponse({ error: `Unbekannter type: ${payload.type}` }, 400)
  }

  if (!mail.an) {
    return jsonResponse({ error: 'Kein Empfänger angegeben.' }, 400)
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
        to: [mail.an],
        subject: mail.subject,
        text: mail.text,
        html: mail.html
      })
    })

    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      // Nicht-fatal antworten: eine fehlgeschlagene Mail darf den Ablauf im
      // Frontend (Reservierung, Bewertung, Nachricht) nie abbrechen.
      console.error(`Resend-Fehler (${res.status}) an ${mail.an}:`, data)
      return jsonResponse({ ok: false, logged: true }, 200)
    }

    return jsonResponse({ ok: true, id: (data as { id?: string }).id })
  } catch (err) {
    console.error('Senden fehlgeschlagen:', err)
    return jsonResponse({ ok: false, logged: true }, 200)
  }
})
