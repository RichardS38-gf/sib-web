-- SIB — Migration: Newsletter-Kuratierung durch Händler
-- ============================================================
-- EINMALIG auf der bestehenden Datenbank ausführen (SQL Editor → Run).
--
-- Hintergrund: Händler können im Dashboard (neuer Reiter "Newsletter")
-- auswählen, welche ihrer Artikel in der nächsten Newsletter-Ausgabe unter
-- "Neu eingetroffen" bzw. "Sonderangebote & Sale" erscheinen. Die Ausgabe
-- (Monat/Jahr) wird NICHT hier gespeichert, sondern rein aus dem heutigen
-- Datum berechnet (siehe js/newsletter-zeitraum.js) — die Spalte "monat"
-- dient nur dazu, einen Eintrag einem Kalendermonat zuzuordnen.

-- 0) Absicherung: shops.erstellt_am muss existieren, damit "Neu beigetreten"
--    auf newsletter.html danach filtern kann. Falls die Spalte schon
--    existiert, passiert nichts (IF NOT EXISTS).
alter table public.shops
  add column if not exists erstellt_am timestamptz not null default now();

-- 1) Tabelle
create table if not exists public.newsletter_eintraege (
  id uuid primary key default gen_random_uuid(),
  produkt_id uuid not null references public.produkte (id) on delete cascade,
  shop_id uuid not null references public.shops (id) on delete cascade,
  typ text not null check (typ in ('neu', 'sale')),
  monat date not null, -- immer der 1. des Zielmonats, z.B. 2026-08-01
  erstellt_am timestamptz not null default now(),
  unique (produkt_id, typ, monat)
);

create index if not exists newsletter_eintraege_monat_idx
  on public.newsletter_eintraege (monat);
create index if not exists newsletter_eintraege_shop_id_idx
  on public.newsletter_eintraege (shop_id);

-- 2) Privilegien
grant select on public.newsletter_eintraege to anon;
grant select, insert, update, delete on public.newsletter_eintraege to authenticated;
grant all on public.newsletter_eintraege to service_role;

-- 3) Row Level Security + Policies
alter table public.newsletter_eintraege enable row level security;

drop policy if exists "Oeffentliches Lesen newsletter_eintraege"     on public.newsletter_eintraege;
drop policy if exists "Haendler verwaltet eigene Newsletter-Eintraege" on public.newsletter_eintraege;
drop policy if exists "Admin Vollzugriff newsletter_eintraege"       on public.newsletter_eintraege;

-- Öffentlich lesbar (die öffentliche Newsletter-Seite filtert selbst nach
-- Monat + freigegeben/verfuegbar der verknüpften Produkte).
create policy "Oeffentliches Lesen newsletter_eintraege"
  on public.newsletter_eintraege for select using (true);

-- Händler verwaltet nur Einträge zu Produkten seines eigenen Shops.
create policy "Haendler verwaltet eigene Newsletter-Eintraege"
  on public.newsletter_eintraege for all to authenticated
  using (produkt_id in (
    select p.id from public.produkte p
    join public.shops s on s.id = p.shop_id
    where s.user_id = auth.uid()))
  with check (produkt_id in (
    select p.id from public.produkte p
    join public.shops s on s.id = p.shop_id
    where s.user_id = auth.uid()));

-- Admin Vollzugriff
create policy "Admin Vollzugriff newsletter_eintraege"
  on public.newsletter_eintraege for all to authenticated
  using (public.is_admin()) with check (public.is_admin());
