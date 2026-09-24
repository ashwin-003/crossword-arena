-- ============================================================================
-- 0002_student_batch_auth.sql
-- ============================================================================
-- Drop foreign keys referencing auth.users on gameplay tables so that student
-- sessions (identified by deterministic student UUIDs without Supabase Auth accounts)
-- can participate in games, timers, answers, and results.
-- Mentors continue to store their auth.users UUIDs.
-- ============================================================================

-- 1. Participants
alter table public.participants drop constraint if exists participants_user_id_fkey;

-- 2. Section Timers
alter table public.section_timers drop constraint if exists section_timers_user_id_fkey;

-- 3. Answers
alter table public.answers drop constraint if exists answers_user_id_fkey;

-- 4. Section Results
alter table public.section_results drop constraint if exists section_results_user_id_fkey;

-- 5. Results
alter table public.results drop constraint if exists results_user_id_fkey;

-- 6. Game Events
alter table public.game_events drop constraint if exists game_events_user_id_fkey;

-- 7. Removed Participants
alter table public.removed_participants drop constraint if exists removed_participants_user_id_fkey;

-- 8. Enable RLS on students and revoke direct access from anon / authenticated
alter table public.students enable row level security;
drop policy if exists students_select_authenticated on public.students;
revoke all on public.students from anon, authenticated;

-- 9. Allow anon and authenticated to read games, game_sections, questions_public,
-- participants, section_timers, answers, section_results, results (since game security
-- and answer correctness are verified by server-side Edge Functions / security definer RPCs).
drop policy if exists games_select_authenticated on public.games;
create policy games_select_all on public.games for select to anon, authenticated using (true);

drop policy if exists game_sections_select_authenticated on public.game_sections;
create policy game_sections_select_all on public.game_sections for select to anon, authenticated using (true);

drop policy if exists participants_select_authenticated on public.participants;
create policy participants_select_all on public.participants for select to anon, authenticated using (true);

drop policy if exists section_timers_select_authenticated on public.section_timers;
create policy section_timers_select_all on public.section_timers for select to anon, authenticated using (true);

drop policy if exists section_results_select_authenticated on public.section_results;
create policy section_results_select_all on public.section_results for select to anon, authenticated using (true);

drop policy if exists results_select_authenticated on public.results;
create policy results_select_all on public.results for select to anon, authenticated using (true);

drop policy if exists answers_select_own on public.answers;
create policy answers_select_all on public.answers for select to anon, authenticated using (true);

drop policy if exists answers_insert_own on public.answers;
create policy answers_insert_all on public.answers for insert to anon, authenticated with check (true);

drop policy if exists answers_update_own on public.answers;
create policy answers_update_all on public.answers for update to anon, authenticated using (true);

grant select on public.questions_public to anon, authenticated;
