-- SIB — Migration: Händler-Selbstregistrierung (eigenen Shop anlegen)
-- ============================================================
-- Bisher konnte NUR der Admin einen Shop anlegen (RLS: "Admin Vollzugriff
-- shops"). Damit die Registrierung über haendler-werden.html direkt einen
-- nutzbaren Account erzeugt (Passwort selbst festlegen -> sofort eigener
-- Shop, ohne dass jemand manuell user_id in der DB verknüpfen muss), braucht
-- ein frisch eingeloggter Händler-Account das Recht, GENAU EINEN eigenen
-- Shop anzulegen.
--
-- EINMALIG im Supabase SQL Editor ausführen (Dashboard -> SQL Editor -> Run).

drop policy if exists "Haendler legt eigenen Shop an" on public.shops;
create policy "Haendler legt eigenen Shop an"
  on public.shops for insert to authenticated
  with check (
    user_id = auth.uid()
    and not exists (select 1 from public.shops s where s.user_id = auth.uid())
  );
