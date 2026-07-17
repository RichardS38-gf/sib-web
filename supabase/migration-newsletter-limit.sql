-- SIB — Migration: Newsletter-Limit (max. 3 Artikel pro Shop und Ausgabe)
-- ============================================================
-- EINMALIG auf der bestehenden Datenbank ausführen (SQL Editor → Run).
--
-- Hintergrund: Ein Händler darf pro Monat/Ausgabe insgesamt höchstens
-- 3 verschiedene Artikel im Newsletter platzieren — egal ob unter
-- "Neu eingetroffen", "Sonderangebot" oder beides zugleich (ein Artikel,
-- der in beiden Rubriken auftaucht, zählt nur einmal). Das Dashboard prüft
-- das schon selbst und blendet weitere Auswahl aus, aber dieser Trigger
-- verhindert das Limit auch dann zuverlässig, falls z.B. zwei Browser-Tabs
-- gleichzeitig offen sind.

create or replace function public.pruefe_newsletter_limit()
returns trigger as $$
declare
  bestehende_anzahl integer;
begin
  select count(distinct produkt_id) into bestehende_anzahl
  from public.newsletter_eintraege
  where shop_id = new.shop_id
    and monat = new.monat
    and produkt_id <> new.produkt_id;

  if bestehende_anzahl >= 3 then
    raise exception 'newsletter_limit_erreicht: maximal 3 Artikel pro Ausgabe und Shop'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists newsletter_eintraege_limit on public.newsletter_eintraege;

create trigger newsletter_eintraege_limit
  before insert on public.newsletter_eintraege
  for each row execute function public.pruefe_newsletter_limit();
