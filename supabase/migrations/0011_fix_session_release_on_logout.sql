-- ============================================================================
-- 0011_fix_session_release_on_logout.sql
-- ============================================================================
-- Ensure session release immediately marks is_active = false when either
-- token or batch_number is provided on student logout.
-- ============================================================================

create or replace function public.release_student_session(
  p_token text default null,
  p_batch_number text default null
)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_updated boolean := false;
begin
  if (p_token is not null and p_token <> '') or (p_batch_number is not null and p_batch_number <> '') then
    update public.student_sessions
    set is_active = false
    where (p_batch_number is not null and p_batch_number <> '' and batch_number = p_batch_number)
       or (p_token is not null and p_token <> '' and token = p_token);
    v_updated := found;
  end if;

  return v_updated;
end;
$$;

grant execute on function public.release_student_session(text, text) to anon, authenticated;
