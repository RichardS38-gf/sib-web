-- SIB — Migration: Bewertungssystem für Händler
-- ============================================================
-- EINMALIG auf der bestehenden Datenbank ausführen (SQL Editor → Run).
-- setup.sql enthält denselben Endzustand für Neuinstallationen.

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

grant insert on public.bewertungen to anon;
grant select on public.bewertungen to anon, authenticated, service_role;
grant all on public.bewertungen to service_role;
-- Admin darf Bewertungen löschen
grant delete on public.bewertungen to authenticated;

alter table public.bewertungen enable row level security;

drop policy if exists "bewertungen_lesen"   on public.bewertungen;
drop policy if exists "bewertungen_schreiben" on public.bewertungen;
drop policy if exists "Admin Vollzugriff bewertungen" on public.bewertungen;

-- Öffentlich lesbar
create policy "bewertungen_lesen"
  on public.bewertungen for select using (true);

-- Anonyme dürfen Bewertungen schreiben
create policy "bewertungen_schreiben"
  on public.bewertungen for insert to anon with check (true);

-- Admin darf alles (insb. löschen)
create policy "Admin Vollzugriff bewertungen"
  on public.bewertungen for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
