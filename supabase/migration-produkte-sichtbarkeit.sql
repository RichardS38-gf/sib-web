-- SIB — Migration: Produkt-Sichtbarkeit für den Verfügbarkeits-Filter
-- ============================================================
-- EINMALIG auf der bestehenden Datenbank ausführen (SQL Editor → Run).
--
-- Hintergrund: Die Kategorieseite hat jetzt einen Verfügbarkeits-Filter
-- ("Nur verfügbare Artikel"). Damit auch ausverkaufte (aber freigegebene)
-- Produkte angezeigt werden können, wenn der Filter abgewählt ist, muss die
-- öffentliche Lese-Policy ausverkaufte Produkte zulassen.
--
-- Auswirkung: anon kann freigegebene Produkte unabhängig von verfuegbar lesen.
-- Start-, Shop- und Suchseite filtern verfuegbar=true weiterhin in ihren
-- eigenen Queries — dort ändert sich nichts. Nur die Kategorieseite zeigt
-- ausverkaufte Artikel (mit Hinweis "Nicht verfügbar"), wenn gewünscht.

drop policy if exists "Oeffentliches Lesen produkte" on public.produkte;
create policy "Oeffentliches Lesen produkte"
  on public.produkte for select using (freigegeben = true);
