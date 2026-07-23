-- SIB — Migration: Kaskadierendes Löschen für Shops
-- ============================================================
-- Stellt sicher, dass beim Löschen eines Händlers (shops) auch alle seine
-- Produkte automatisch mit gelöscht werden (und darüber deren Varianten,
-- da produkt_varianten bereits "on delete cascade" auf produkte hat).
-- EINMALIG im Supabase SQL Editor ausführen.

alter table public.produkte drop constraint if exists produkte_shop_id_fkey;
alter table public.produkte add constraint produkte_shop_id_fkey
  foreign key (shop_id) references public.shops (id) on delete cascade;
