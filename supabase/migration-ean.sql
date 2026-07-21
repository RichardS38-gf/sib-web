-- SIB — Migration: EAN-Feld für Produkte
-- ============================================================
-- EINMALIG auf der bestehenden Datenbank ausführen (SQL Editor → Run).

alter table public.produkte
  add column if not exists ean text;

create index if not exists produkte_ean_idx on public.produkte (ean);
