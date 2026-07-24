-- SIB — Migration: Telefonnummer + WhatsApp-Verweis für Geschäfte
-- Telefonnummer erscheint auf der Shop-Seite zwischen Adresse und E-Mail.
-- Ist whatsapp_aktiv gesetzt, wird daneben ein Link "Auch per WhatsApp
-- erreichbar" angezeigt, der dieselbe Nummer als wa.me-Link nutzt.
-- EINMALIG im Supabase SQL Editor ausführen.

alter table public.shops
  add column if not exists telefon text,
  add column if not exists whatsapp_aktiv boolean not null default false;

comment on column public.shops.telefon is 'Telefonnummer des Geschäfts, wird auf der Shop-Seite angezeigt';
comment on column public.shops.whatsapp_aktiv is 'Wenn true: Telefonnummer ist zusätzlich per WhatsApp erreichbar (wa.me-Link)';
