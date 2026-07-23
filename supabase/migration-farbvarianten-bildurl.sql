-- SIB — Migration: Farbvarianten bekommen ein eigenes Foto (bild_url)
-- Ergänzt migration-farbvarianten.sql. Ersetzt den ursprünglichen Ansatz über
-- bild_index (Verweis auf Position im Fotos-Array) durch eine direkte
-- Bild-URL -- robuster, weil unabhängig von der Reihenfolge der Fotos.
-- bild_index bleibt in der Tabelle bestehen, wird aber nicht mehr befüllt.
-- EINMALIG im Supabase SQL Editor ausführen (setzt migration-farbvarianten.sql voraus).

alter table public.produkt_farben
  add column if not exists bild_url text;

comment on column public.produkt_farben.bild_url is 'Direkte Bild-URL der Farbvariante (ersetzt bild_index)';
