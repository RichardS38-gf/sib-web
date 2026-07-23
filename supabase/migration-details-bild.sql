-- SIB — Migration: Details-Bild-Spalte sicherstellen
-- Hintergrund: Der Code zum Speichern von details_bild_url war lange
-- auskommentiert, weil unklar war, ob die Spalte existiert. Dieses Skript
-- legt sie (idempotent) an, falls sie fehlt.
-- EINMALIG im Supabase SQL Editor ausführen.

alter table public.produkte
  add column if not exists details_bild_url text;

comment on column public.produkte.details_bild_url is 'Bild, das in der Details-Sektion der Produktseite neben den Features angezeigt wird';
