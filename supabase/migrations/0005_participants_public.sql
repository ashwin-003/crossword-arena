create or replace view public.participants_public as
select
  p.id,
  p.game_id,
  p.user_id,
  p.joined_at,
  p.status,
  p.submitted_at,
  p.live_score,
  p.live_solved_count,
  p.interruption_count,
  p.last_seen_at,
  coalesce(ss.batch_number, '') as batch_number,
  coalesce('Student ' || ss.batch_number, m.name, 'Student') as display_name,
  coalesce(ss.batch_number, m.name, 'Student') as display_class
from public.participants p
left join public.student_sessions ss on ss.id = p.user_id
left join public.mentors m on m.auth_user_id = p.user_id;

grant select on public.participants_public to anon, authenticated;
