-- migration-kategorie-lebensmittel.sql
-- ============================================================
-- Neue Hauptkategorie "Lebensmittel".
--
-- Die zugehoerige Unterkategorie "Gewuerzmischungen" ist keine eigene
-- Tabellenzeile, sondern steckt als Textwert in produkte.unterkategorie.
-- Die Auswahlliste dafuer liegt im Frontend in js/groessen-config.js
-- (UNTERKATEGORIEN_NACH_KATEGORIE), dort ist auch das passende Groessenset
-- hinterlegt: "Klein (20 g)" und "Gross (80 g)".
--
-- EINMALIG im Supabase SQL Editor ausfuehren.

insert into public.kategorien (name, slug)
select 'Lebensmittel', 'lebensmittel'
where not exists (
  select 1 from public.kategorien where slug = 'lebensmittel'
);

-- Kontrolle
select id, name, slug from public.kategorien order by name;
