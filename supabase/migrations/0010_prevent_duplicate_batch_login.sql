-- ============================================================================
-- 0010_prevent_duplicate_batch_login.sql
-- ============================================================================
-- Enforce single active login per batch number (271001 - 271133).
-- Adds is_active column, row-locking atomic session claim, and session release.
-- ============================================================================

-- 1. Ensure is_active column exists on public.student_sessions
alter table public.student_sessions
  add column if not exists is_active boolean not null default false;

-- 2. Atomic session claim RPC with row-level locking (FOR UPDATE)
create or replace function public.claim_student_session(
  p_batch_number text,
  p_token text,
  p_client_token text default null,
  p_timeout_seconds integer default 1800
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
  v_now timestamptz := now();
  v_student record;
  v_timeout_interval interval := (p_timeout_seconds || ' seconds')::interval;
begin
  -- 1. Verify batch_number exists in public.students
  select batch_number into v_student
  from public.students
  where batch_number = p_batch_number;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'error_code', 'INVALID_BATCH',
      'message', 'Invalid batch number'
    );
  end if;

  -- 2. Ensure row exists for this batch_number before locking
  insert into public.student_sessions (batch_number, token, is_active, created_at, last_seen_at)
  values (p_batch_number, p_token, false, v_now, '1970-01-01 00:00:00+00')
  on conflict (batch_number) do nothing;

  -- 3. Lock the row atomically with FOR UPDATE to prevent race conditions
  select id, batch_number, token, is_active, last_seen_at into v_session
  from public.student_sessions
  where batch_number = p_batch_number
  for update;

  -- 4. Check if there is an active session
  if v_session.is_active is true and v_session.last_seen_at >= (v_now - v_timeout_interval) then
    -- If caller passes client_token matching active token, it's the SAME student reconnecting
    if p_client_token is not null and p_client_token = v_session.token then
      update public.student_sessions
      set last_seen_at = v_now
      where id = v_session.id;

      return jsonb_build_object(
        'ok', true,
        'student_id', v_session.id,
        'batch_number', v_session.batch_number,
        'token', v_session.token,
        'reconnected', true
      );
    end if;

    -- Otherwise, it is a DUPLICATE login attempt from another browser/user
    return jsonb_build_object(
      'ok', false,
      'error_code', 'ALREADY_LOGGED_IN',
      'message', 'This batch number is already logged in. Please check your batch number and try again.'
    );
  end if;

  -- 5. Session is inactive or expired: claim it atomically with the new token
  update public.student_sessions
  set
    token = p_token,
    is_active = true,
    created_at = v_now,
    last_seen_at = v_now
  where id = v_session.id;

  return jsonb_build_object(
    'ok', true,
    'student_id', v_session.id,
    'batch_number', v_session.batch_number,
    'token', p_token,
    'reconnected', false
  );
end;
$$;

grant execute on function public.claim_student_session(text, text, text, integer) to anon, authenticated;

-- 3. Explicit session release RPC (on logout)
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
  if p_token is not null and p_token <> '' then
    update public.student_sessions
    set is_active = false
    where token = p_token;
    v_updated := found;
  elsif p_batch_number is not null and p_batch_number <> '' then
    update public.student_sessions
    set is_active = false
    where batch_number = p_batch_number;
    v_updated := found;
  end if;

  return v_updated;
end;
$$;

grant execute on function public.release_student_session(text, text) to anon, authenticated;
