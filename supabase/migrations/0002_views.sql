-- ============================================================================
-- CROSSWORD ARENA — public views
-- ============================================================================
-- questions_public exposes everything a player's client needs to render and
-- play the puzzle (clue text, position, numbering, expected word length) but
-- NEVER the answer column itself. It is filtered to rows the caller is
-- allowed to see (a participant or the creator of that game) directly in the
-- view definition, so it is safe to grant broad SELECT on the view while the
-- underlying questions table stays locked down to service_role only.
--
-- Deliberately NOT security_invoker: the whole point of this view is that
-- `authenticated` has zero grants on the underlying public.questions table
-- (see 0004_rls_policies.sql, "revoke all ... from authenticated, anon"),
-- so answer text can never leak through a direct query. A security_invoker
-- view checks the CALLER's privileges against that same locked-down base
-- table and would fail with "permission denied for table questions" for
-- every authenticated user — verified locally. Leaving security_invoker
-- unset uses Postgres's classic view semantics (checked against the VIEW
-- OWNER's privileges), which is exactly the "permission wrapper" pattern
-- this view exists for: the owner can read questions in full, the WHERE
-- clause below does the real row-level filtering via auth.uid(), and only
-- the answer-free column list is ever exposed.
-- ============================================================================

create view public.questions_public
as
select
  q.id,
  q.game_id,
  q.direction,
  q.clue,
  q.number,
  q.row_index,
  q.col_index,
  char_length(q.answer) as answer_length
from public.questions q
where
  exists (
    select 1
    from public.participants p
    where p.game_id = q.game_id
      and p.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.games g
    where g.id = q.game_id
      and g.creator_id = auth.uid()
  );

comment on view public.questions_public is 'Answer-free projection of questions, self-filtered to participants/creator. Safe to expose to the authenticated role.';

grant select on public.questions_public to authenticated;
