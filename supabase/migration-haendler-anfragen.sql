-- SIB — Migration: Händler-Registrierungsanfragen
-- ============================================================
-- EINMALIG auf der bestehenden Datenbank ausführen (SQL Editor → Run).
-- setup.sql enthält denselben Endzustand für Neuinstallationen.

-- 1) Tabelle für Registrierungsanfragen
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

-- 2) Anonyme Besucher dürfen Anfragen anlegen (nur INSERT)
grant insert on public.haendler_anfragen to anon, authenticated;

alter table public.haendler_anfragen enable row level security;

drop policy if exists "anfragen_insert" on public.haendler_anfragen;
create policy "anfragen_insert"
  on public.haendler_anfragen for insert to anon, authenticated with check (true);

-- Admin (is_admin) darf Anfragen lesen/verwalten
grant select, update, delete on public.haendler_anfragen to authenticated;
drop policy if exists "Admin Vollzugriff haendler_anfragen" on public.haendler_anfragen;
create policy "Admin Vollzugriff haendler_anfragen"
  on public.haendler_anfragen for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 3) Storage-Bucket "haendler-logos" (privat) anlegen
insert into storage.buckets (id, name, public)
values ('haendler-logos', 'haendler-logos', false)
on conflict (id) do nothing;

-- 4) Storage-Policy: anon darf in haendler-logos hochladen
drop policy if exists "haendler-logos anon upload" on storage.objects;
create policy "haendler-logos anon upload"
  on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'haendler-logos');

-- Hinweis: Der Bucket ist privat. Zum Ansehen der Logos im Admin-Bereich
-- entweder über das Supabase-Dashboard (Storage) gehen oder bei Bedarf
-- eine Lese-Policy für Admins ergänzen, z. B.:
--   create policy "haendler-logos admin read"
--     on storage.objects for select to authenticated
--     using (bucket_id = 'haendler-logos' and public.is_admin());
