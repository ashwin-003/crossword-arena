-- ----------------------------------------------------------------------------
-- removed_participants
-- Tracks participants removed/banned by the match creator from a specific match.
-- ----------------------------------------------------------------------------
create table if not exists public.removed_participants (
  game_id uuid not null references public.games(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  removed_at timestamptz not null default now(),
  primary key (game_id, user_id)
);

alter table public.removed_participants enable row level security;
-- No policies granted to anon/authenticated: this table is only ever
-- read/written by Edge Functions using the service-role admin client.
