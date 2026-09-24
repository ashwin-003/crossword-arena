create table if not exists public.student_sessions (
  id uuid primary key default gen_random_uuid(),
  batch_number text not null,
  token text not null unique,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists student_sessions_token_idx on public.student_sessions(token);
create index if not exists student_sessions_batch_number_idx on public.student_sessions(batch_number);

alter table public.student_sessions enable row level security;
revoke all on public.student_sessions from anon, authenticated;
