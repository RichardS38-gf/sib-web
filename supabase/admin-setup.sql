-- SIB — Admin-Setup (Phase 3: admin.html)
-- ============================================================
-- AUSFÜHREN im Supabase-Dashboard:  SQL Editor → New query → einfügen → Run
-- Baut auf rls-grants.sql + dashboard-setup.sql auf.
--
-- Sicheres Admin-Konzept: KEIN service_role im Frontend. Florian meldet sich
-- mit einem normalen Auth-Konto an; dieses Konto ist in public.admins
-- eingetragen und erhält per RLS Vollzugriff.

-- 1) Admin-Registry
create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  erstellt_am timestamptz not null default now()
);

alter table public.admins enable row level security;
-- Bewusst KEINE Policy auf admins -> normale Rollen können die Tabelle nicht
-- lesen/ändern. Zugriff nur über die SECURITY-DEFINER-Funktion unten.

-- 2) is_admin(): läuft als Owner (security definer), umgeht RLS auf admins
create or replace function public.is_admin ()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.admins where user_id = auth.uid());
$$;

grant execute on function public.is_admin () to anon, authenticated;

-- 3) Privilegien für eingeloggte Nutzer (RLS schränkt darüber hinaus ein)
grant select, insert, update, delete on public.shops                 to authenticated;
grant select, insert, update, delete on public.produkte              to authenticated;
grant select, insert, update, delete on public.reservierungen        to authenticated;
grant select, insert, update, delete on public.newsletter_abonnenten to authenticated;
grant select, insert, update, delete on public.kategorien            to authenticated;

-- 4) Admin-RLS-Policies — Vollzugriff, sobald is_admin() = true.
--    (Mehrere permissive Policies werden mit ODER kombiniert; die Händler-
--     Policies aus dashboard-setup.sql bleiben für Nicht-Admins bestehen.)

drop policy if exists "Admin Vollzugriff shops"        on public.shops;
drop policy if exists "Admin Vollzugriff produkte"     on public.produkte;
drop policy if exists "Admin Vollzugriff reservierungen" on public.reservierungen;
drop policy if exists "Admin Vollzugriff newsletter"   on public.newsletter_abonnenten;
drop policy if exists "Admin Vollzugriff kategorien"   on public.kategorien;

create policy "Admin Vollzugriff shops"
  on public.shops for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Admin Vollzugriff produkte"
  on public.produkte for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "Admin Vollzugriff reservierungen"
  on public.reservierungen for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- newsletter_abonnenten: RLS aktivieren (falls noch nicht) + Admin-Vollzugriff
alter table public.newsletter_abonnenten enable row level security;
create policy "Admin Vollzugriff newsletter"
  on public.newsletter_abonnenten for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- kategorien: RLS aktivieren (falls noch nicht) + Admin-Vollzugriff
alter table public.kategorien enable row level security;
create policy "Admin Vollzugriff kategorien"
  on public.kategorien for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 5) Florian als Admin eintragen:
--    a) Auth-User anlegen (Authentication → Add user), E-Mail + Passwort vergeben
--    b) UID eintragen:
--       insert into public.admins (user_id)
--       values ('<auth-user-uid>')
--       on conflict do nothing;
--
--    UID nachschlagen, falls unbekannt:
--       select id, email from auth.users order by created_at desc;
