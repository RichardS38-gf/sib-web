-- SIB — Migration: Größen-Varianten können jetzt an eine Farbvariante gebunden sein
-- Ergänzt migration-varianten.sql. Ohne Farbvarianten bleibt farbe = NULL (wie
-- bisher) -- ein Produkt kann also weiterhin ganz normale, farblose Größen
-- haben. Bei Produkten MIT Farbvarianten bekommt jede Zeile zusätzlich die
-- zugehörige Farbe, sodass Größe UND Lagerbestand pro Farbe getrennt gepflegt
-- werden können.
-- EINMALIG im Supabase SQL Editor ausführen.

alter table public.produkt_varianten
  add column if not exists farbe text;

create index if not exists produkt_varianten_produkt_farbe_idx
  on public.produkt_varianten (produkt_id, farbe);

comment on column public.produkt_varianten.farbe is 'Farbe, zu der diese Größen-Variante gehört (NULL = farbloses Standalone-Produkt)';
