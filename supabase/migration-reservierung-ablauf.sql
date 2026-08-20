-- migration-reservierung-ablauf.sql
-- ============================================================
-- Reservierungen laufen nach 48 Stunden automatisch ab.
--
-- Bisher war die Frist nur Text auf der Website (FAQ, Datenschutz), es gab
-- keine Automatik. Dieses Skript setzt sie tatsaechlich um:
--   1. Funktion, die abgelaufene Reservierungen auf 'abgelaufen' setzt
--   2. Stuendlicher Cron-Job, der diese Funktion aufruft
--
-- Betroffen sind nur Reservierungen im Status 'offen' oder 'bestaetigt'.
-- Bereits abgeholte oder stornierte bleiben unberuehrt.
--
-- EINMALIG im Supabase SQL Editor ausfuehren.

-- 1) Voraussetzung: Die Erweiterung pg_cron muss im Projekt aktiviert sein.
--    Am zuverlaessigsten geht das im Supabase-Dashboard unter
--    Database -> Extensions -> pg_cron -> Enable.
--    Danach existiert das Schema "cron".
--    Alternativ hier per SQL (legt das Schema cron selbst an):
create extension if not exists pg_cron;

-- 2) Die eigentliche Aufraeum-Funktion.
--    security definer, damit sie unabhaengig von RLS arbeiten kann.
create or replace function public.reservierungen_ablaufen_lassen ()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  anzahl integer;
begin
  update public.reservierungen
  set status = 'abgelaufen'
  where status in ('offen', 'bestaetigt')
    and erstellt_am < now() - interval '48 hours';

  get diagnostics anzahl = row_count;
  return anzahl;
end;
$$;

comment on function public.reservierungen_ablaufen_lassen () is
  'Setzt offene und bestaetigte Reservierungen aelter als 48 Stunden auf abgelaufen. Wird stuendlich per pg_cron aufgerufen.';

-- 3) Stuendlichen Job einrichten.
--    Erst entfernen, damit das Skript mehrfach ausfuehrbar bleibt.
select cron.unschedule('reservierungen-ablauf')
where exists (select 1 from cron.job where jobname = 'reservierungen-ablauf');

select cron.schedule(
  'reservierungen-ablauf',
  '0 * * * *',
  $$select public.reservierungen_ablaufen_lassen();$$
);

-- 4) Einmal direkt ausfuehren, damit Altbestaende sofort bereinigt sind.
select public.reservierungen_ablaufen_lassen() as sofort_abgelaufen;

-- ============================================================
-- Kontrolle
-- ============================================================
-- Geplanten Job pruefen:
--   select jobname, schedule, active from cron.job;
--
-- Letzte Laeufe ansehen:
--   select * from cron.job_run_details order by start_time desc limit 10;
--
-- Job wieder entfernen:
--   select cron.unschedule('reservierungen-ablauf');
