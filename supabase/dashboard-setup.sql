-- SIB — Dashboard-/Auth-Setup (Phase 3: login.html + dashboard.html)
-- ============================================================
-- AUSFÜHREN im Supabase-Dashboard:  SQL Editor → New query → einfügen → Run
-- Baut auf supabase/rls-grants.sql auf (öffentlicher Lesezugriff).

-- 1) Verknüpfung Händler <-> Shop: Spalte user_id in shops
--    (referenziert den eingeloggten Auth-User)
alter table public.shops
  add column if not exists user_id uuid references auth.users (id) on delete set null;

create index if not exists shops_user_id_idx on public.shops (user_id);

-- 2) Tabellen-Privilegien für eingeloggte Händler
grant select, update on public.shops               to authenticated;
grant select, insert, update, delete on public.produkte      to authenticated;
grant select, update on public.reservierungen      to authenticated;
grant select on public.kategorien                  to authenticated;

-- RLS auf reservierungen aktivieren (falls noch nicht)
alter table public.reservierungen enable row level security;

-- 3) RLS-Policies — jeder Händler sieht/ändert NUR seine eigenen Daten
--    (DROP zuerst, damit das Skript wiederholbar bleibt)

-- shops: eigenen Shop lesen/ändern
drop policy if exists "Haendler liest eigenen Shop"   on public.shops;
drop policy if exists "Haendler aendert eigenen Shop"  on public.shops;
create policy "Haendler liest eigenen Shop"
  on public.shops for select to authenticated using (user_id = auth.uid());
create policy "Haendler aendert eigenen Shop"
  on public.shops for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- produkte: nur Produkte des eigenen Shops anlegen/ändern/löschen
drop policy if exists "Haendler verwaltet eigene Produkte" on public.produkte;
create policy "Haendler verwaltet eigene Produkte"
  on public.produkte for all to authenticated
  using (shop_id in (select id from public.shops where user_id = auth.uid()))
  with check (shop_id in (select id from public.shops where user_id = auth.uid()));

-- reservierungen: Händler sieht/bestätigt Reservierungen seiner Produkte
drop policy if exists "Haendler liest eigene Reservierungen"   on public.reservierungen;
drop policy if exists "Haendler aendert eigene Reservierungen"  on public.reservierungen;
create policy "Haendler liest eigene Reservierungen"
  on public.reservierungen for select to authenticated
  using (produkt_id in (
    select p.id from public.produkte p
    join public.shops s on s.id = p.shop_id
    where s.user_id = auth.uid()));
create policy "Haendler aendert eigene Reservierungen"
  on public.reservierungen for update to authenticated
  using (produkt_id in (
    select p.id from public.produkte p
    join public.shops s on s.id = p.shop_id
    where s.user_id = auth.uid()));

-- 4) Öffentliche Schreib-Policies (Besucher ohne Account)
--    Reservierung anlegen (Produktseite) + Newsletter-Anmeldung
grant insert on public.reservierungen        to anon, authenticated;
grant insert on public.newsletter_abonnenten to anon, authenticated;

alter table public.newsletter_abonnenten enable row level security;

drop policy if exists "Oeffentlich reservieren"      on public.reservierungen;
drop policy if exists "Oeffentlich Newsletter-Anmeldung" on public.newsletter_abonnenten;
create policy "Oeffentlich reservieren"
  on public.reservierungen for insert to anon, authenticated with check (true);
create policy "Oeffentlich Newsletter-Anmeldung"
  on public.newsletter_abonnenten for insert to anon, authenticated with check (true);

-- 5) Newsletter: E-Mail eindeutig (für "bereits angemeldet"-Erkennung, Code 23505)
create unique index if not exists newsletter_abonnenten_email_key
  on public.newsletter_abonnenten (lower(email));

-- Händler anlegen (Beispiel, manuell im Dashboard/SQL):
--   1. Auth-User erstellen (Authentication → Add user)
--   2. shops.user_id auf dessen UID setzen:
--      update public.shops set user_id = '<auth-user-uid>' where slug = '<shop-slug>';
