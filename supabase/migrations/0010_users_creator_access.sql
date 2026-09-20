-- ============================================================================
-- Migration 0010: Allow match creators to view profiles of their participants
-- ============================================================================
-- Matches participants_select_game_peers: a user can read player profiles if
-- they are in the same game as participants, OR if the user is the creator/host
-- of the game that the participant joined.
-- ============================================================================

drop policy if exists users_select_self_or_game_peers on public.users;

create policy users_select_self_or_game_peers
on public.users for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.participants theirs
    where theirs.user_id = public.users.id
      and (
        public.is_game_participant(theirs.game_id, auth.uid())
        or exists (
          select 1
          from public.games g
          where g.id = theirs.game_id
            and g.creator_id = auth.uid()
        )
      )
  )
);
