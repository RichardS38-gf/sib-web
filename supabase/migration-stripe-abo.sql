-- SIB — Migration: Stripe-Abo-Felder für Händler-Anfragen
-- ============================================================
-- EINMALIG auf der bestehenden Datenbank ausführen (SQL Editor → Run).

alter table public.haendler_anfragen
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_checkout_session_id text,
  add column if not exists abo_status text not null default 'ausstehend',
  -- 'ausstehend' | 'aktiv' | 'gekuendigt' | 'zahlung_fehlgeschlagen'
  add column if not exists abo_aktualisiert_am timestamptz;

-- Der Service-Role-Key (nur im Stripe-Webhook, nie im Frontend) braucht
-- Schreibrechte auf diese Spalten -- läuft ohnehin an RLS vorbei, aber zur
-- Klarheit: normale anon/authenticated Nutzer dürfen diese Felder nicht
-- direkt verändern, nur per INSERT anlegen (Standardwert 'ausstehend').

create index if not exists haendler_anfragen_stripe_customer_idx
  on public.haendler_anfragen (stripe_customer_id);

create index if not exists haendler_anfragen_stripe_session_idx
  on public.haendler_anfragen (stripe_checkout_session_id);
