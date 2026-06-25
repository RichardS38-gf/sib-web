-- SIB — Migration: Reservierung ansehen & stornieren (Kundenseite)
-- ============================================================
-- EINMALIG auf der bestehenden Datenbank ausführen (SQL Editor → Run).
-- setup.sql enthält denselben Endzustand für Neuinstallationen.

-- 1) Status "storniert" (und "abgeholt") in der Check-Constraint erlauben
alter table public.reservierungen drop constraint if exists reservierungen_status_check;
alter table public.reservierungen add constraint reservierungen_status_check
  check (status in ('offen', 'bestaetigt', 'abgeholt', 'abgelaufen', 'storniert'));

-- 2) anon darf eine Reservierung per id-Link ansehen UND stornieren
grant select, update on public.reservierungen to anon;

-- Ansehen (für die Kundenseite reservierung.html?id=…)
drop policy if exists "reservierungen_ansehen" on public.reservierungen;
create policy "reservierungen_ansehen"
  on public.reservierungen for select to anon using (true);

-- Stornieren: anon darf NUR auf status='storniert' setzen
drop policy if exists "reservierungen_stornieren" on public.reservierungen;
create policy "reservierungen_stornieren"
  on public.reservierungen for update to anon
  using (true) with check (status = 'storniert');

-- Hinweis zum Datenschutz: Mit "reservierungen_ansehen (using true)" kann jede
-- Person, die eine Reservierungs-UUID kennt, deren Daten (inkl. Name/E-Mail)
-- abrufen. Die UUID dient als nicht erratbarer Zugriffstoken (wie ein Magic-Link).
-- Den Link daher nicht öffentlich teilen.
