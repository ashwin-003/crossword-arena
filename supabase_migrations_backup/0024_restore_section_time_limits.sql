-- ============================================================================
-- Migration 0024: Restore individual section time limits
-- ============================================================================
-- Re-adds time_limit_seconds to game_sections so each section has its own
-- independent time limit (e.g. 5m, 10m, 15m, 7m).
-- Re-adds is_locked to section_timers so expired sections are locked.
-- ============================================================================

-- Re-add time_limit_seconds to game_sections
alter table public.game_sections
  add column if not exists time_limit_seconds integer not null default 600 check (time_limit_seconds >= 10);

-- Re-add is_locked to section_timers
alter table public.section_timers
  add column if not exists is_locked boolean not null default false;

-- Allow games.time_limit_seconds to be 0 or any non-negative integer for multi-section games
alter table public.games alter column time_limit_seconds set default 600;
alter table public.games drop constraint if exists games_time_limit_seconds_check;
alter table public.games add constraint games_time_limit_seconds_check check (time_limit_seconds >= 0);
