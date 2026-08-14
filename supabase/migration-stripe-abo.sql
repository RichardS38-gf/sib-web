-- migration-stripe-abo.sql
-- Abo-Verwaltung fuer Haendler ueber Stripe Payment Link.
--
-- Ablauf: Haendler registriert sich -> Shop wird mit aktiv = false und
-- abo_status = 'offen' angelegt -> Weiterleitung zum Stripe Payment Link ->
-- Stripe-Webhook setzt nach erfolgreicher Zahlung abo_status = 'aktiv'
-- und aktiv = true. Erst dann ist der Shop oeffentlich sichtbar und das
-- Dashboard nutzbar.
--
-- Einmalig im Supabase SQL Editor ausfuehren.

-- 1. Neue Spalten
alter table public.shops
  add column if not exists abo_status text not null default 'offen',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists abo_aktualisiert_am timestamptz;

comment on column public.shops.abo_status is
  'offen | aktiv | zahlung_fehlgeschlagen | gekuendigt';

-- 2. Bestandsshops nicht aussperren: alles was schon aktiv ist, gilt als bezahlt.
update public.shops
set abo_status = 'aktiv',
    abo_aktualisiert_am = now()
where aktiv = true
  and abo_status = 'offen';

-- 3. Index fuer die Webhook-Zuordnung ueber die Subscription
create index if not exists shops_stripe_subscription_id_idx
  on public.shops (stripe_subscription_id);

-- 4. Haendler duerfen ihren eigenen Abo-Status lesen, aber nicht selbst setzen.
--    Der Webhook schreibt mit dem service_role Key und umgeht RLS ohnehin.
--    Bestehende UPDATE-Policy fuer Haendler bleibt unveraendert; damit ein
--    Haendler sich nicht selbst freischalten kann, sperren wir die Spalten
--    per Trigger.
create or replace function public.schuetze_abo_spalten()
returns trigger
language plpgsql
security definer
as $$
begin
  -- service_role darf alles (Webhook)
  if current_setting('request.jwt.claims', true)::jsonb ->> 'role' = 'service_role' then
    return new;
  end if;

  new.abo_status := old.abo_status;
  new.aktiv := old.aktiv;
  new.stripe_customer_id := old.stripe_customer_id;
  new.stripe_subscription_id := old.stripe_subscription_id;
  new.abo_aktualisiert_am := old.abo_aktualisiert_am;
  return new;
end;
$$;

drop trigger if exists shops_abo_spalten_schutz on public.shops;
create trigger shops_abo_spalten_schutz
  before update on public.shops
  for each row
  execute function public.schuetze_abo_spalten();
