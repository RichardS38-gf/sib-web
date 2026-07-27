-- SIB — Migration: Mehrere Fotos pro Farbvariante
-- Ersetzt das einzelne bild_url-Feld durch ein Array (bild_urls), damit pro
-- Farbe mehrere Fotos hinterlegt werden können. Sie werden in der Galerie in
-- der gespeicherten Reihenfolge nacheinander angezeigt; das erste Foto ist
-- das, zu dem die Produktseite springt, wenn die Farbe ausgewählt wird.
-- bild_url bleibt zur Abwärtskompatibilität mit altem Code erhalten, wird
-- aber nicht mehr befüllt.
-- EINMALIG im Supabase SQL Editor ausführen.

alter table public.produkt_farben
  add column if not exists bild_urls text[];

comment on column public.produkt_farben.bild_urls is 'Fotos dieser Farbvariante in Anzeige-Reihenfolge (erstes Foto = Sprungziel bei Farbauswahl)';
