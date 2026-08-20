-- migration-varianten-preis-ean.sql
-- ============================================================
-- Preis und EAN je Groesse.
--
-- Hintergrund: Bei Lebensmitteln (z.B. Gewuerzmischungen in "Klein (20 g)"
-- und "Gross (80 g)") unterscheiden sich Preis und EAN je Groesse. Bisher
-- hing der Preis nur am Produkt und die EAN am Produkt bzw. an der Farbe.
--
-- Beide Spalten sind optional:
--   preis = null  -> es gilt der Produktpreis (produkte.preis), wie bisher
--   ean   = null  -> es gilt die EAN am Produkt bzw. an der Farbvariante
--
-- Fuer Kleidung aendert sich damit nichts, dort bleiben beide Felder leer.
--
-- EINMALIG im Supabase SQL Editor ausfuehren.

alter table public.produkt_varianten
  add column if not exists preis numeric(10, 2),
  add column if not exists ean text;

comment on column public.produkt_varianten.preis is
  'Optionaler Preis je Groesse. Ist er leer, gilt produkte.preis.';
comment on column public.produkt_varianten.ean is
  'Optionale EAN je Groesse. Ist sie leer, gilt die EAN am Produkt bzw. an der Farbvariante.';

-- Kontrolle
select column_name, data_type, is_nullable
from information_schema.columns
where table_schema = 'public' and table_name = 'produkt_varianten'
order by ordinal_position;
