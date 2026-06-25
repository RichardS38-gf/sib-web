-- SIB — Migration: Produkt-Varianten (Größen + Stückzahlen)
-- ============================================================
-- EINMALIG auf der bestehenden Datenbank ausführen (SQL Editor → Run).
-- setup.sql enthält denselben Endzustand für Neuinstallationen.

-- 1) Tabelle für Varianten
create table if not exists public.produkt_varianten (
  id uuid primary key default gen_random_uuid(),
  produkt_id uuid references public.produkte (id) on delete cascade,
  groesse text not null,
  stueckzahl integer not null default 1,
  erstellt_am timestamptz not null default now()
);

create index if not exists produkt_varianten_produkt_id_idx
  on public.produkt_varianten (produkt_id);

-- 2) Reservierungen: gewählte Größe mitspeichern
alter table public.reservierungen
  add column if not exists groesse text;

-- 3) Privilegien
grant select on public.produkt_varianten to anon;
grant select, insert, update, delete on public.produkt_varianten to authenticated;
grant all on public.produkt_varianten to service_role;

-- 4) Row Level Security + Policies
alter table public.produkt_varianten enable row level security;

drop policy if exists "Oeffentliches Lesen varianten"      on public.produkt_varianten;
drop policy if exists "Haendler verwaltet eigene Varianten" on public.produkt_varianten;
drop policy if exists "Admin Vollzugriff varianten"        on public.produkt_varianten;

-- Öffentlich lesbar nur für sichtbare Produkte
create policy "Oeffentliches Lesen varianten"
  on public.produkt_varianten for select using (
    produkt_id in (
      select id from public.produkte where verfuegbar = true and freigegeben = true));

-- Händler verwaltet die Varianten seiner eigenen Produkte
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

-- Admin Vollzugriff
create policy "Admin Vollzugriff varianten"
  on public.produkt_varianten for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
