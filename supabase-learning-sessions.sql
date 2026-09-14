-- Apply in Supabase before moving the in-process session repository to production.
-- Pairing tokens are stored only as hashes in a production repository.
create table if not exists public.learning_sessions (
  session_id text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  challenge_id text not null,
  title text not null,
  language text not null,
  concept text not null,
  instructions text not null default '',
  expected_skills jsonb not null default '[]'::jsonb,
  status text not null check (status in ('active','connected','failed','completed','expired')),
  started_at timestamptz not null default now(), connected_at timestamptz,
  attempts integer not null default 0, hints_used integer not null default 0,
  test_score jsonb, latest_mentor_feedback text, recovery text
);
create table if not exists public.learning_session_events (
  id bigint generated always as identity primary key,
  session_id text not null references public.learning_sessions(session_id) on delete cascade,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.learning_sessions enable row level security;
alter table public.learning_session_events enable row level security;
create policy "learner reads own sessions" on public.learning_sessions for select using (auth.uid() = user_id);
create policy "learner reads own session evidence" on public.learning_session_events for select using (exists (select 1 from public.learning_sessions s where s.session_id = learning_session_events.session_id and s.user_id = auth.uid()));
