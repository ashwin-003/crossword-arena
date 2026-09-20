-- ============================================================================
-- Migration 0009: Set REPLICA IDENTITY FULL on Realtime publication tables
-- ============================================================================
-- Required for Supabase Realtime Postgres Changes:
-- 1. Enables filtering on non-primary key columns (e.g. participants.game_id).
-- 2. Ensures the full row (including unchanged columns like games.creator_id
--    and grid_layout) is emitted in WAL UPDATE/DELETE records.
-- 3. Allows Realtime RLS evaluation to inspect related columns.
-- ============================================================================

alter table public.games replica identity full;
alter table public.participants replica identity full;
alter table public.answers replica identity full;
