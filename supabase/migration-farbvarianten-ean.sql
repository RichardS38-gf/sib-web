-- SIB — Migration: Farbvarianten bekommen eine eigene EAN
-- Bei Produkten mit mehreren Farben hat jede Farbvariante ihre eigene EAN
-- (unterschiedliche Barcodes pro Farbe). Die globale produkte.ean bleibt für
-- Produkte OHNE Farbvarianten weiterhin nutzbar.
-- EINMALIG im Supabase SQL Editor ausführen.

alter table public.produkt_farben
  add column if not exists ean text;

comment on column public.produkt_farben.ean is 'EAN dieser Farbvariante (nur bei Produkten mit Farbvarianten befüllt)';
