-- The run event log (SKELETON §8, lib/contracts/event.ts): one row per step, insert-only, the corkboard's
-- only input. The browser (anon key) reads it and receives inserts over Realtime; only server code writes.
create table if not exists public.events (
  run_id    text        not null,
  seq       int         not null check (seq > 0),
  ts        timestamptz not null default now(),
  type      text        not null check (type in (
              'run_started', 'lead_opened', 'check_run', 'link_found', 'clue_explained', 'lead_dropped',
              'status_changed', 'budget_spent', 'question_asked', 'question_answered', 'rule_applied',
              'attack_detected', 'recovery', 'disposition_recorded', 'run_finished')),
  loan_ids  text[]      not null default '{}',
  tool      text,
  result    jsonb       not null default '{}'::jsonb,
  sources   jsonb       not null default '[]'::jsonb,
  note      text        not null default '',
  budget    jsonb       not null,
  simulated boolean     not null,
  primary key (run_id, seq)
);

alter table public.events enable row level security;
create policy "events are readable" on public.events for select using (true);

-- Insert-only, even for the service role: corrections are new rows, never edits.
revoke update, delete, truncate on public.events from anon, authenticated, service_role;
create or replace function public.events_are_append_only() returns trigger language plpgsql as $$
begin
  raise exception 'events is insert-only';
end;
$$;
create trigger events_append_only before update or delete on public.events
  for each row execute function public.events_are_append_only();

-- The board subscribes to inserts for its run.
alter publication supabase_realtime add table public.events;
