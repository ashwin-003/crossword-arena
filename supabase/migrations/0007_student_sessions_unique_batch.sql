-- Add unique constraint on student_sessions.batch_number so each student
-- can only have ONE active session row at a time.
-- This enforces stable student identity (session.id = participant user_id).

alter table public.student_sessions
  add constraint student_sessions_batch_number_key unique (batch_number);
