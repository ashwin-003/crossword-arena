-- ============================================================================
-- Migration 0025: Fix questions unique constraint for multi-section games
-- ============================================================================
-- In migration 0001, questions had:
--   constraint questions_unique_slot unique (game_id, direction, row_index, col_index)
-- For multi-section games, each section has its own grid starting at (0, 0).
-- When section B has a clue at (row, col) that collides with section A's (row, col),
-- inserting section B fails with a unique constraint violation on questions_unique_slot!
--
-- We replace questions_unique_slot to include section_id (or replace it with
-- a unique constraint on (section_id, direction, row_index, col_index)).
-- ============================================================================

alter table public.questions drop constraint if exists questions_unique_slot;

-- Unique slot per section (and for backward-compat legacy games where section_id is null, per game)
create unique index if not exists questions_section_slot_idx
  on public.questions (section_id, direction, row_index, col_index)
  where section_id is not null;

create unique index if not exists questions_legacy_slot_idx
  on public.questions (game_id, direction, row_index, col_index)
  where section_id is null;
