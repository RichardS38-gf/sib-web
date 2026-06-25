-- SIB — Komplettes Datenbank-Setup (Phase 3)
-- ============================================================
-- Zusammenführung von rls-grants.sql + dashboard-setup.sql + admin-setup.sql
-- in der korrekten Ausführungsreihenfolge. Idempotent (mehrfach ausführbar).
--
-- AUSFÜHREN im Supabase-Dashboard:  SQL Editor → New query → einfügen → Run
-- (DDL/GRANTs gehen NUR über den SQL Editor oder psql, nicht über den API-Key.)
--
-- Hintergrund: Ein direkter Test gegen die REST-API ergab anfangs für ALLE
-- Rollen "permission denied for table" (42501) — den Tabellen fehlten die
-- Privilegien komplett. Dieses Skript vergibt Rechte, aktiviert RLS und legt
-- alle Policies an (öffentlich lesen/schreiben, Händler, Admin).
--
-- Inhalt:
--   0) Schema-Änderungen (shops.user_id, admins, is_admin)
--   1) Privilegien (GRANTs)
--   2) Row Level Security aktivieren
--   3) Policies (öffentlich lesen → öffentlich schreiben → Händler → Admin)
--   4) Indizes
--   5) Manuelle Schritte (Admin/Händler verknüpfen)


-- ============================================================
-- 0) Schema-Änderungen
-- ============================================================

-- Verknüpfung Händler <-> Shop: Spalte user_id in shops
-- (referenziert den eingeloggten Auth-User)
alter table public.shops
  add column if not exists user_id uuid references auth.users (id) on delete set null;

-- Freigabe-System: neue Produkte müssen vom Admin freigegeben werden,
-- bevor sie öffentlich erscheinen (Admin-Produkte werden direkt true gesetzt).
alter table public.produkte
  add column if not exists freigegeben boolean not null default false;

-- Reservierungen: gewählte Größe (Variante) mitspeichern
alter table public.reservierungen
  add column if not exists groesse text;

-- Reservierungs-Status inkl. "abgeholt" und "storniert" erlauben
alter table public.reservierungen drop constraint if exists reservierungen_status_check;
alter table public.reservierungen add constraint reservierungen_status_check
  check (status in ('offen', 'bestaetigt', 'abgeholt', 'abgelaufen', 'storniert'));

-- Produkt-Varianten: Größen + Stückzahlen je Produkt
create table if not exists public.produkt_varianten (
  id uuid primary key default gen_random_uuid(),
  produkt_id uuid references public.produkte (id) on delete cascade,
  groesse text not null,
  stueckzahl integer not null default 1,
  erstellt_am timestamptz not null default now()
);

create index if not exists produkt_varianten_produkt_id_idx
  on public.produkt_varianten (produkt_id);

-- Händler-Registrierungsanfragen (von der Seite haendler-werden.html)
create table if not exists public.haendler_anfragen (
  id uuid primary key default gen_random_uuid(),
  vorname text,
  nachname text,
  email text,
  telefon text,
  geschaeft_name text,
  adresse text,
  beschreibung text,
  logo_url text,
  erstellt_am timestamptz not null default now()
);

-- Bewertungen (Kundenbewertungen je Shop)
create table if not exists public.bewertungen (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid references public.shops (id) on delete cascade,
  autor_name text not null,
  autor_email text not null,
  sterne integer not null check (sterne between 1 and 5),
  text text,
  erstellt_am timestamptz default now()
);

create index if not exists bewertungen_shop_id_idx on public.bewertungen (shop_id);

-- Admin-Registry: Auth-Konten mit Vollzugriff
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  erstellt_am timestamptz not null default now()
);

-- is_admin(): läuft als Owner (security definer), umgeht RLS auf admins.
-- Bewusst KEINE Policy auf admins -> normale Rollen können die Tabelle nicht
-- lesen/ändern; Zugriff nur über diese Funktion.
create or replace function public.is_admin ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;


-- ============================================================
-- 1) Privilegien (GRANTs)
-- ============================================================

-- Schema-Nutzung sicherstellen
grant usage on schema public to anon, authenticated, service_role;

-- anon (nicht eingeloggte Besucher): öffentlich lesen …
grant select on public.kategorien to anon;
grant select on public.produkte   to anon;
grant select on public.shops      to anon;

-- … und öffentlich schreiben, wo nötig (Reservierung + Newsletter-Anmeldung)
grant insert on public.reservierungen        to anon;
grant insert on public.newsletter_abonnenten to anon;
-- Kunde darf seine Reservierung per id-Link ansehen + stornieren
grant select, update on public.reservierungen to anon;

-- authenticated (Händler + Admin): volle Tabellen-Privilegien.
-- Die tatsächliche Einschränkung erfolgt über RLS (Abschnitt 3).
grant select, insert, update, delete on public.shops                 to authenticated;
grant select, insert, update, delete on public.produkte              to authenticated;
grant select, insert, update, delete on public.reservierungen        to authenticated;
grant select, insert, update, delete on public.newsletter_abonnenten to authenticated;
grant select, insert, update, delete on public.kategorien            to authenticated;

-- service_role (Edge Functions): Vollzugriff
grant all on public.kategorien to service_role;
grant all on public.produkte   to service_role;
grant all on public.shops      to service_role;

-- Produkt-Varianten: anon liest, authenticated verwaltet (per RLS eingegrenzt)
grant select on public.produkt_varianten to anon;
grant select, insert, update, delete on public.produkt_varianten to authenticated;
grant all on public.produkt_varianten to service_role;

-- Händler-Anfragen: anon darf anlegen, authenticated (Admin) verwaltet
grant insert on public.haendler_anfragen to anon, authenticated;
grant select, update, delete on public.haendler_anfragen to authenticated;
grant all on public.haendler_anfragen to service_role;

-- Bewertungen: anon liest + schreibt, authenticated (Admin) loescht
grant insert on public.bewertungen to anon;
grant select on public.bewertungen to anon, authenticated;
grant delete on public.bewertungen to authenticated;
grant all on public.bewertungen to service_role;

-- is_admin() ausführbar für eingeloggte Nutzer (und anon, schadet nicht)
grant execute on function public.is_admin () to anon, authenticated;


-- ============================================================
-- 2) Row Level Security aktivieren (je Tabelle genau einmal)
-- ============================================================
alter table public.kategorien            enable row level security;
alter table public.produkte              enable row level security;
alter table public.shops                 enable row level security;
alter table public.reservierungen        enable row level security;
alter table public.newsletter_abonnenten enable row level security;
alter table public.admins                enable row level security;
alter table public.produkt_varianten     enable row level security;
alter table public.haendler_anfragen     enable row level security;
alter table public.bewertungen           enable row level security;


-- ============================================================
-- 3) Policies
--    (DROP zuerst, damit das Skript mehrfach ausführbar bleibt.)
-- ============================================================

-- 3a) Öffentlich lesen ----------------------------------------
drop policy if exists "Oeffentliches Lesen kategorien" on public.kategorien;
drop policy if exists "Oeffentliches Lesen produkte"   on public.produkte;
drop policy if exists "Oeffentliches Lesen shops"      on public.shops;

create policy "Oeffentliches Lesen kategorien"
  on public.kategorien for select using (true);
-- Produkte öffentlich sichtbar, sobald vom Admin freigegeben.
-- (Verfügbarkeit wird im Frontend gefiltert; die Kategorieseite kann so auch
--  ausverkaufte Artikel anzeigen. Andere Seiten filtern verfuegbar=true selbst.)
create policy "Oeffentliches Lesen produkte"
  on public.produkte for select using (freigegeben = true);
create policy "Oeffentliches Lesen shops"
  on public.shops for select using (true);

-- 3b) Öffentlich schreiben (Besucher ohne Account) ------------
--     Reservierung anlegen (Produktseite) + Newsletter-Anmeldung
drop policy if exists "Oeffentlich reservieren"          on public.reservierungen;
drop policy if exists "Oeffentlich Newsletter-Anmeldung" on public.newsletter_abonnenten;

create policy "Oeffentlich reservieren"
  on public.reservierungen for insert to anon, authenticated with check (true);
create policy "Oeffentlich Newsletter-Anmeldung"
  on public.newsletter_abonnenten for insert to anon, authenticated with check (true);

-- Kunde sieht seine Reservierung (per id-Link) und darf sie stornieren.
-- Hinweis: USING (true) -> die UUID dient als nicht erratbarer Zugriffstoken.
drop policy if exists "reservierungen_ansehen"    on public.reservierungen;
drop policy if exists "reservierungen_stornieren" on public.reservierungen;
create policy "reservierungen_ansehen"
  on public.reservierungen for select to anon using (true);
create policy "reservierungen_stornieren"
  on public.reservierungen for update to anon
  using (true) with check (status = 'storniert');

-- 3c) Händler — sieht/ändert NUR seine eigenen Daten ----------
--     (Verknüpfung über shops.user_id = auth.uid())

-- shops: eigenen Shop lesen/ändern
drop policy if exists "Haendler liest eigenen Shop"   on public.shops;
drop policy if exists "Haendler aendert eigenen Shop" on public.shops;
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
drop policy if exists "Haendler liest eigene Reservierungen"  on public.reservierungen;
drop policy if exists "Haendler aendert eigene Reservierungen" on public.reservierungen;
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

-- 3d) Admin — Vollzugriff, sobald is_admin() = true -----------
--     (Mehrere permissive Policies werden mit ODER kombiniert; die Händler-
--      Policies oben bleiben für Nicht-Admins bestehen.)
drop policy if exists "Admin Vollzugriff shops"          on public.shops;
drop policy if exists "Admin Vollzugriff produkte"       on public.produkte;
drop policy if exists "Admin Vollzugriff reservierungen" on public.reservierungen;
drop policy if exists "Admin Vollzugriff newsletter"     on public.newsletter_abonnenten;
drop policy if exists "Admin Vollzugriff kategorien"     on public.kategorien;

create policy "Admin Vollzugriff shops"
  on public.shops for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admin Vollzugriff produkte"
  on public.produkte for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admin Vollzugriff reservierungen"
  on public.reservierungen for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admin Vollzugriff newsletter"
  on public.newsletter_abonnenten for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
create policy "Admin Vollzugriff kategorien"
  on public.kategorien for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 3e) Produkt-Varianten -----------------------------------------
-- Öffentlich lesbar nur für sichtbare Produkte; Händler verwalten ihre
-- eigenen; Admin Vollzugriff.
drop policy if exists "Oeffentliches Lesen varianten"      on public.produkt_varianten;
drop policy if exists "Haendler verwaltet eigene Varianten" on public.produkt_varianten;
drop policy if exists "Admin Vollzugriff varianten"        on public.produkt_varianten;

create policy "Oeffentliches Lesen varianten"
  on public.produkt_varianten for select using (
    produkt_id in (
      select id from public.produkte where verfuegbar = true and freigegeben = true));

create policy "Haendler verwaltet eigene Varianten"
  on public.produkt_varianten for all to authenticated
  using (produkt_id in (
    select p.id from public.produkte p
    join public.shops s on s.id = p.shop_id
    where s.user_id = auth.uid()))
  with check (produkt_id in (
    select p.id from public.produkte p
    join public.shops s on s.id = p.shop_id
    where s.user_id = auth.uid()));

create policy "Admin Vollzugriff varianten"
  on public.produkt_varianten for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 3f) Händler-Anfragen --------------------------------------------
-- Öffentlich anlegen (Registrierungsformular), Admin verwaltet alles.
drop policy if exists "anfragen_insert"                  on public.haendler_anfragen;
drop policy if exists "Admin Vollzugriff haendler_anfragen" on public.haendler_anfragen;

create policy "anfragen_insert"
  on public.haendler_anfragen for insert to anon, authenticated with check (true);

create policy "Admin Vollzugriff haendler_anfragen"
  on public.haendler_anfragen for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 3g) Bewertungen ------------------------------------------------
-- Öffentlich lesbar + von anon schreibbar; Admin verwaltet/löscht.
drop policy if exists "bewertungen_lesen"            on public.bewertungen;
drop policy if exists "bewertungen_schreiben"        on public.bewertungen;
drop policy if exists "Admin Vollzugriff bewertungen" on public.bewertungen;

create policy "bewertungen_lesen"
  on public.bewertungen for select using (true);
create policy "bewertungen_schreiben"
  on public.bewertungen for insert to anon with check (true);
create policy "Admin Vollzugriff bewertungen"
  on public.bewertungen for all to authenticated
  using (public.is_admin()) with check (public.is_admin());


-- ============================================================
-- 4) Indizes
-- ============================================================
create index if not exists shops_user_id_idx on public.shops (user_id);

-- Newsletter: E-Mail eindeutig (für "bereits angemeldet"-Erkennung, Code 23505)
create unique index if not exists newsletter_abonnenten_email_key
  on public.newsletter_abonnenten (lower(email));


-- ============================================================
-- 4b) Storage: Bucket für Händler-Logos
-- ============================================================
-- Privater Bucket; anonyme Besucher dürfen Logos beim Registrieren hochladen.
insert into storage.buckets (id, name, public)
values ('haendler-logos', 'haendler-logos', false)
on conflict (id) do nothing;

drop policy if exists "haendler-logos anon upload" on storage.objects;
create policy "haendler-logos anon upload"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'haendler-logos');


-- ============================================================
-- 5) Manuelle Schritte (nach diesem Skript)
-- ============================================================
-- Test öffentlicher Lesezugriff (sollte JSON statt 42501 liefern):
--   curl "https://ezruwstzpncunbjzwdfk.supabase.co/rest/v1/kategorien?select=*" \
--     -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
--
-- Admin (Florian) freischalten:
--   1. Auth-User anlegen (Authentication → Add user), E-Mail + Passwort vergeben
--   2. insert into public.admins (user_id)
--      values ('<auth-user-uid>')
--      on conflict do nothing;
--
-- Händler mit Shop verknüpfen:
--   update public.shops set user_id = '<auth-user-uid>' where slug = '<shop-slug>';
--
-- UID nachschlagen, falls unbekannt:
--   select id, email from auth.users order by created_at desc;
