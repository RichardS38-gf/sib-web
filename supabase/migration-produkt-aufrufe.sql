-- SIB — Migration: Klick-/Aufruf-Zähler für Produkte
-- "Braunschweigs Favoriten" auf der Startseite soll auf tatsächlichen
-- Aufrufen basieren, nicht auf Bewertungen. Jeder Besuch der Produktseite
-- erhöht den Zähler per RPC-Funktion (SECURITY DEFINER), damit anonyme
-- Besucher zählen können, ohne direkten UPDATE-Zugriff auf die Tabelle zu
-- benötigen.
-- EINMALIG im Supabase SQL Editor ausführen.

alter table public.produkte
  add column if not exists aufrufe integer not null default 0;

create index if not exists produkte_aufrufe_idx on public.produkte (aufrufe desc);

create or replace function public.increment_produkt_aufrufe(pid uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.produkte set aufrufe = aufrufe + 1 where id = pid;
end;
$$;

grant execute on function public.increment_produkt_aufrufe(uuid) to anon, authenticated;
