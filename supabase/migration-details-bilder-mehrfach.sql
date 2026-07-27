-- SIB — Migration: Mehrere Details-Bilder statt nur einem
-- Ergänzt migration-details-bild.sql. Das neue Array details_bilder ersetzt
-- details_bild_url als primäres Feld -- bei mehr als einem Bild zeigt die
-- Produktseite einen durchklickbaren Slider. details_bild_url bleibt zur
-- Abwärtskompatibilität mit altem Code erhalten, wird aber nicht mehr befüllt.
-- EINMALIG im Supabase SQL Editor ausführen.

alter table public.produkte
  add column if not exists details_bilder text[];

comment on column public.produkte.details_bilder is 'Bilder für die Details-Sektion (neben Features) in Anzeige-Reihenfolge; bei mehr als einem Bild als Slider dargestellt';
