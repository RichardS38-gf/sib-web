-- SIB — Berechtigungen & RLS für öffentlichen Lesezugriff
-- ============================================================
-- Problem (Phase 3): kategorien/produkte luden nicht. Ein direkter Test gegen
-- die REST-API ergab für ALLE Rollen (anon, authenticated, service_role):
--   {"code":"42501","message":"permission denied for table kategorien"}
-- Den Tabellen fehlen also die SELECT-Rechte komplett (kein reines RLS-Problem).
--
-- AUSFÜHREN im Supabase-Dashboard:  SQL Editor  →  New query  →  einfügen  →  Run
-- (Das geht NICHT über den anon/service_role-API-Key, sondern nur per SQL Editor
--  oder psql, da es sich um DDL/GRANTs handelt.)

-- 1) Schema-Nutzung sicherstellen
grant usage on schema public to anon, authenticated, service_role;

-- 2) Tabellen-Privilegien
--    Öffentlich nur lesen (anon = nicht eingeloggte Besucher).
grant select on public.kategorien to anon, authenticated;
grant select on public.produkte  to anon, authenticated;
grant select on public.shops     to anon, authenticated;

--    service_role (Edge Functions / Admin) braucht Vollzugriff.
grant all on public.kategorien to service_role;
grant all on public.produkte  to service_role;
grant all on public.shops     to service_role;

-- 3) Row Level Security aktivieren …
alter table public.kategorien enable row level security;
alter table public.produkte  enable row level security;
alter table public.shops     enable row level security;

-- 4) … und öffentliche Lese-Policies anlegen.
--    (DROP zuerst, damit das Skript mehrfach ausführbar bleibt.)
drop policy if exists "Oeffentliches Lesen kategorien" on public.kategorien;
drop policy if exists "Oeffentliches Lesen produkte"  on public.produkte;
drop policy if exists "Oeffentliches Lesen shops"     on public.shops;

create policy "Oeffentliches Lesen kategorien"
  on public.kategorien for select using (true);

create policy "Oeffentliches Lesen produkte"
  on public.produkte for select using (true);

create policy "Oeffentliches Lesen shops"
  on public.shops for select using (true);

-- Test danach (sollte JSON statt 42501 liefern):
--   curl "https://ezruwstzpncunbjzwdfk.supabase.co/rest/v1/kategorien?select=*" \
--     -H "apikey: <ANON_KEY>" -H "Authorization: Bearer <ANON_KEY>"
