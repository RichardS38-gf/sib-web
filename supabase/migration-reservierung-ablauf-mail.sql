-- migration-reservierung-ablauf-mail.sql
-- ============================================================
-- Benachrichtigung, wenn eine Reservierung nach 48 Stunden verfaellt.
--
-- Bisher setzte der Cron-Job (migration-reservierung-ablauf.sql) den Status
-- still auf 'abgelaufen'. Der Kunde erfuhr nichts und wartete moeglicherweise
-- weiter auf die Abholbereit-Mail.
--
-- Diese Migration erweitert die Aufraeum-Funktion: Vor dem Statuswechsel wird
-- fuer jede betroffene Reservierung die Edge Function send-email aufgerufen
-- (type: reservierung_abgelaufen).
--
-- Technik: pg_net schickt HTTP-Requests aus Postgres heraus, ohne auf die
-- Antwort zu warten. Faellt der Versand aus, laeuft der Statuswechsel trotzdem
-- durch -- die Datenbank soll nie am Mailversand haengen.
--
-- VORAUSSETZUNGEN
--   1. migration-reservierung-ablauf.sql wurde bereits ausgefuehrt
--   2. Erweiterung pg_net aktiviert (Database -> Extensions -> pg_net)
--   3. Der anon-Key steht als Datenbank-Einstellung bereit (siehe Schritt 2)
--
-- EINMALIG im Supabase SQL Editor ausfuehren.

-- 1) Erweiterung fuer HTTP-Aufrufe aus der Datenbank
create extension if not exists pg_net;

-- 2) Projekt-URL und anon-Key hinterlegen.
--    Der anon-Key ist oeffentlich (er steht auch im Frontend), deshalb ist das
--    hier unbedenklich. ANON_KEY_HIER durch den echten Wert ersetzen.
alter database postgres set app.supabase_url = 'https://ezruwstzpncunbjzwdfk.supabase.co';
alter database postgres set app.supabase_anon_key = 'ANON_KEY_HIER';

-- 3) Aufraeum-Funktion mit Mailversand
create or replace function public.reservierungen_ablaufen_lassen ()
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  anzahl integer := 0;
  eintrag record;
  basis_url text := current_setting('app.supabase_url', true);
  anon_key text := current_setting('app.supabase_anon_key', true);
begin
  -- Erst sammeln und benachrichtigen, dann den Status setzen.
  for eintrag in
    select r.id, r.kunde_name, r.kunde_email, p.titel as produkt_titel, s.name as shop_name
    from public.reservierungen r
    left join public.produkte p on p.id = r.produkt_id
    left join public.shops s on s.id = p.shop_id
    where r.status in ('offen', 'bestaetigt')
      and r.erstellt_am < now() - interval '48 hours'
  loop
    if basis_url is not null and anon_key is not null and eintrag.kunde_email is not null then
      begin
        perform net.http_post(
          url := basis_url || '/functions/v1/send-email',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'Authorization', 'Bearer ' || anon_key
          ),
          body := jsonb_build_object(
            'type', 'reservierung_abgelaufen',
            'empfaenger_email', eintrag.kunde_email,
            'kunde_name', coalesce(eintrag.kunde_name, ''),
            'produkt_titel', coalesce(eintrag.produkt_titel, 'dein Artikel'),
            'shop_name', coalesce(eintrag.shop_name, 'dem Geschäft')
          )
        );
      exception when others then
        -- Mailversand darf den Statuswechsel nie verhindern.
        raise warning 'Ablauf-Mail fehlgeschlagen fuer %: %', eintrag.id, sqlerrm;
      end;
    end if;
  end loop;

  update public.reservierungen
  set status = 'abgelaufen'
  where status in ('offen', 'bestaetigt')
    and erstellt_am < now() - interval '48 hours';

  get diagnostics anzahl = row_count;
  return anzahl;
end;
$$;

comment on function public.reservierungen_ablaufen_lassen () is
  'Setzt Reservierungen aelter als 48 Stunden auf abgelaufen und benachrichtigt die Kundschaft per E-Mail. Wird stuendlich per pg_cron aufgerufen.';

-- ============================================================
-- Kontrolle
-- ============================================================
-- Funktion einmal von Hand ausfuehren:
--   select public.reservierungen_ablaufen_lassen();
--
-- Verschickte HTTP-Requests ansehen:
--   select id, created, status_code, content
--   from net._http_response order by created desc limit 10;
--
-- Eingestellte Werte pruefen:
--   select current_setting('app.supabase_url', true);
