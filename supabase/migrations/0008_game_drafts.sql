-- ============================================================================
-- Migration 0008: Game Drafts table
-- ============================================================================
-- Allows creators to save partially-built crosswords (title, time limit, clues)
-- privately and return to edit/publish them as live matches later.
-- ============================================================================

create table public.game_drafts (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references public.users (id) on delete cascade,
  title text not null default '',
  time_limit_seconds integer not null default 600 check (time_limit_seconds between 60 and 10800),
  clues jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index game_drafts_creator_id_idx on public.game_drafts (creator_id);

create trigger game_drafts_set_updated_at
  before update on public.game_drafts
  for each row execute function public.set_updated_at();

alter table public.game_drafts enable row level security;

create policy game_drafts_owner_all
on public.game_drafts for all
to authenticated
using (creator_id = auth.uid())
with check (creator_id = auth.uid());
