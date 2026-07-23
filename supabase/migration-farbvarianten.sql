-- SIB — Migration: Produkt-Farbvarianten (Farbe + Stückzahl + Bild-Zuordnung)
-- Analog zu migration-varianten.sql (Größen), nur für Farben.
-- EINMALIG im Supabase SQL Editor ausführen.

-- 1) Tabelle für Farbvarianten
create table if not exists public.produkt_farben (
  id uuid primary key default gen_random_uuid(),
  produkt_id uuid references public.produkte (id) on delete cascade,
  farbe text not null,
  bild_index integer,
  stueckzahl integer not null default 1,
  erstellt_am timestamptz not null default now()
);

create index if not exists produkt_farben_produkt_id_idx
  on public.produkt_farben (produkt_id);

-- 2) Reservierungen: gewählte Farbe mitspeichern
alter table public.reservierungen
  add column if not exists farbe text;

-- 3) Privilegien
grant select on public.produkt_farben to anon;
grant select, insert, update, delete on public.produkt_farben to authenticated;
grant all on public.produkt_farben to service_role;

-- 4) Row Level Security + Policies
alter table public.produkt_farben enable row level security;

drop policy if exists "Oeffentliches Lesen farben"      on public.produkt_farben;
drop policy if exists "Haendler verwaltet eigene Farben" on public.produkt_farben;
drop policy if exists "Admin Vollzugriff farben"        on public.produkt_farben;

-- Öffentlich lesbar nur für sichtbare Produkte
create policy "Oeffentliches Lesen farben"
  on public.produkt_farben for select using (
    produkt_id in (
      select id from public.produkte where verfuegbar = true and freigegeben = true));

-- Händler verwaltet die Farbvarianten seiner eigenen Produkte
create policy "Haendler verwaltet eigene Farben"
  on public.produkt_farben for all to authenticated
  using (produkt_id in (
    select p.id from public.produkte p
    join public.shops s on s.id = p.shop_id
    where s.user_id = auth.uid()))
  with check (produkt_id in (
    select p.id from public.produkte p
    join public.shops s on s.id = p.shop_id
    where s.user_id = auth.uid()));

-- Admin Vollzugriff
create policy "Admin Vollzugriff farben"
  on public.produkt_farben for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
