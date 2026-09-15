-- migration-prospekt-versand.sql
-- ============================================================
-- Monatlicher Prospekt-Versand an alle Abonnenten.
--
-- Ablauf: Am 1. jedes Monats um 09:00 laeuft ein Cron-Job. Er prueft, ob fuer
-- den laufenden Monat ueberhaupt Artikel eingetragen sind. Nur dann wird
-- verschickt, sonst bekaeme niemand eine leere Ausgabe.
--
-- Jede Mail enthaelt einen persoenlichen Abmeldelink. Der ist rechtlich
-- Pflicht. Dafuer bekommt jeder Abonnent ein Token.
--
-- VORAUSSETZUNGEN
--   pg_cron und pg_net sind aktiviert (Database -> Extensions)
--
-- EINMALIG im Supabase SQL Editor ausfuehren.

-- 1) Token und Abmeldezeitpunkt je Abonnent
alter table public.newsletter_abonnenten
  add column if not exists abmelde_token uuid default gen_random_uuid(),
  add column if not exists abgemeldet_am timestamptz;

-- Bestandsabonnenten nachtraeglich mit Token versorgen
update public.newsletter_abonnenten
set abmelde_token = gen_random_uuid()
where abmelde_token is null;

create unique index if not exists newsletter_abonnenten_token_idx
  on public.newsletter_abonnenten (abmelde_token);

-- 2) Abmeldung. Wird von abmelden.html per RPC aufgerufen.
--    security definer, damit anonyme Aufrufer abmelden koennen, ohne
--    Schreibrechte auf der Tabelle zu haben.
create or replace function public.newsletter_abmelden (token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  treffer integer;
begin
  update public.newsletter_abonnenten
  set aktiv = false,
      abgemeldet_am = now()
  where abmelde_token = token;

  get diagnostics treffer = row_count;
  return treffer > 0;
end;
$$;

grant execute on function public.newsletter_abmelden (uuid) to anon, authenticated;

-- 3) Versandfunktion
create or replace function public.versende_prospekt ()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  anzahl integer := 0;
  abo record;
  eintraege integer;
  monat_start date := date_trunc('month', now())::date;
  basis_url text := 'https://ezruwstzpncunbjzwdfk.supabase.co';
  anon_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV6cnV3c3R6cG5jdW5ianp3ZGZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODIyOTk4NDAsImV4cCI6MjA5Nzg3NTg0MH0.ema49XcFgwUrUMHsPZFgx5Aqoiyqsj1khjd0qnmAvhM';
begin
  -- Nur verschicken, wenn die Ausgabe auch Inhalt hat.
  select count(*) into eintraege
  from public.newsletter_eintraege
  where monat = monat_start;

  if eintraege = 0 then
    raise notice 'Kein Prospekt-Versand: keine Artikel fuer %', monat_start;
    return 0;
  end if;

  for abo in
    select email, abmelde_token
    from public.newsletter_abonnenten
    where aktiv = true and email is not null
  loop
    begin
      perform net.http_post(
        url := basis_url || '/functions/v1/send-email',
        headers := jsonb_build_object(
          'Content-Type', 'application/json',
          'Authorization', 'Bearer ' || anon_key
        ),
        body := jsonb_build_object(
          'type', 'prospekt',
          'empfaenger_email', abo.email,
          'abmelde_token', abo.abmelde_token::text,
          'anzahl_artikel', eintraege
        )
      );
      anzahl := anzahl + 1;
    exception when others then
      raise warning 'Prospekt-Mail fehlgeschlagen fuer %: %', abo.email, sqlerrm;
    end;
  end loop;

  return anzahl;
end;
$$;

comment on function public.versende_prospekt () is
  'Verschickt den monatlichen Prospekt an alle aktiven Abonnenten. Wird am 1. jedes Monats per pg_cron aufgerufen.';

-- 4) Cron-Job: jeden 1. des Monats um 09:00
select cron.unschedule('prospekt-versand')
where exists (select 1 from cron.job where jobname = 'prospekt-versand');

select cron.schedule(
  'prospekt-versand',
  '0 9 1 * *',
  $$select public.versende_prospekt();$$
);

-- ============================================================
-- Kontrolle
-- ============================================================
-- Von Hand testen (verschickt wirklich!):
--   select public.versende_prospekt();
--
-- Geplante Jobs:
--   select jobname, schedule, active from cron.job;
--
-- Abonnenten und Tokens:
--   select email, aktiv, abmelde_token from public.newsletter_abonnenten;
