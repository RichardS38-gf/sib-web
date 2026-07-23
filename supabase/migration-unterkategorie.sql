-- SIB — Migration: Unterkategorie für Mode & Accessoires (steuert die
-- passenden Größensets: Oberteile, Hosen, Kinderkleidung, Schuhe, Taschen)
-- EINMALIG im Supabase SQL Editor ausführen.

alter table public.produkte
  add column if not exists unterkategorie text;

create index if not exists produkte_unterkategorie_idx on public.produkte (unterkategorie);
