-- SIB — Migration: Freigabe-System für produkte
-- ============================================================
-- EINMALIG auf der bestehenden Datenbank ausführen (SQL Editor → Run).
-- setup.sql enthält denselben Endzustand für Neuinstallationen.
--
-- Achtung: Schritt 2 (UPDATE) ist eine EINMALIGE Datenmigration — nicht
-- erneut ausführen, sonst werden auch zwischenzeitlich nicht freigegebene
-- Produkte pauschal freigegeben.

-- 1) Spalte ergänzen (Default false: neue Produkte sind erst ausstehend)
alter table public.produkte
  add column if not exists freigegeben boolean not null default false;

-- 2) Bestehende Produkte alle freigeben
update public.produkte set freigegeben = true;

-- 3) Öffentliche Lese-Policy anpassen: sichtbar nur, wenn verfügbar UND freigegeben
drop policy if exists "Oeffentliches Lesen produkte" on public.produkte;
create policy "Oeffentliches Lesen produkte"
  on public.produkte for select using (verfuegbar = true and freigegeben = true);
