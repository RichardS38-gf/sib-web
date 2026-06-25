# Edge Function: send-email (SIB)

E-Mail-Benachrichtigungen via [Resend](https://resend.com) für:

- **Reservierungsbestätigung** (`type: "reservierung"`) — direkt nach dem Reservieren an den Kunden
- **Abholbereit** (`type: "abholbereit"`) — wenn der Händler im Dashboard „Bestätigen" klickt

Aufruf aus dem Frontend über `supabase.functions.invoke('send-email', { body })`
(siehe `js/produkt.js` und `js/dashboard.js`). CORS ist in der Function gesetzt.

---

## 1. Resend einrichten

1. Konto auf <https://resend.com> anlegen.
2. **API-Key** erstellen: Resend → *API Keys* → *Create API Key* → Wert kopieren.
3. Domain (empfohlen für den Echtbetrieb): Resend → *Domains* → `shoppeninbraunschweig.de`
   hinzufügen und die angezeigten DNS-Einträge (SPF/DKIM) setzen. Bis die Domain
   verifiziert ist, kann als Absender `onboarding@resend.dev` genutzt werden.

## 2. Supabase CLI installieren & anmelden

```bash
npm install -g supabase
supabase login
supabase link --project-ref ezruwstzpncunbjzwdfk
```

## 3. Secrets (Umgebungsvariablen) setzen

```bash
# Pflicht: Resend API-Key
supabase secrets set RESEND_API_KEY=re_xxxxxxxxxxxxxxxxxxxx

# Optional: Absender (sobald die Domain verifiziert ist)
supabase secrets set RESEND_FROM="Shoppen in Braunschweig <noreply@shoppeninbraunschweig.de>"
```

Ohne `RESEND_FROM` nutzt die Function automatisch
`Shoppen in Braunschweig <onboarding@resend.dev>`.

Die Secrets lassen sich alternativ im Dashboard setzen:
**Supabase → Edge Functions → send-email → Secrets**.

## 4. Function deployen

```bash
supabase functions deploy send-email
```

> Hinweis: Die Function wird vom Browser mit dem anon-Key aufgerufen
> (`supabase.functions.invoke` setzt den Authorization-Header automatisch).
> Falls der Aufruf 401 liefert, die Function ohne JWT-Pflicht deployen:
>
> ```bash
> supabase functions deploy send-email --no-verify-jwt
> ```

## 5. Testen

```bash
curl -i -X POST \
  "https://ezruwstzpncunbjzwdfk.supabase.co/functions/v1/send-email" \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{
    "type": "reservierung",
    "kunde_name": "Max Mustermann",
    "kunde_email": "deine@email.de",
    "produkt_titel": "Test-Artikel",
    "shop_name": "Amelie Fair Fashion",
    "shop_adresse": "Musterstraße 1, 38100 Braunschweig",
    "ablauf_am": "2026-07-02T10:00:00Z"
  }'
```

Erwartet: `{"ok":true,"id":"..."}` und eine E-Mail im Postfach.
