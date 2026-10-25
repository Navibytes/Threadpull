-- A person's decision on a loan (ticket 10): the CRO approves a proposed verdict or overrides it.
-- One row per loan per decision. The run's event log (a disposition_recorded row) stays the record of truth; this table is
-- the copy the team can query, written by server code only.
create table if not exists public.dispositions (
  id               bigint generated always as identity primary key,
  run_id           text not null,
  loan_id          text not null,
  decision         text not null check (decision in ('approve', 'override')),
  proposed_verdict text not null check (proposed_verdict in ('Clear', 'Reprice', 'Review', 'Exclude')),
  final_verdict    text not null check (final_verdict in ('Clear', 'Reprice', 'Review', 'Exclude')),
  reason           text,
  decided_by       text not null,
  event_seq        int  not null,                      -- the disposition_recorded row in the run's event log
  decided_at       timestamptz not null default now(),
  unique (run_id, event_seq, loan_id),                 -- writing the same decision twice is harmless
  check (decision = 'approve' or length(coalesce(reason, '')) >= 10)  -- an override needs a reason
);
create index if not exists dispositions_run_loan on public.dispositions (run_id, loan_id);

-- No policy on purpose: only server code with the service-role key reads or writes this table, the browser (anon key) cannot.
alter table public.dispositions enable row level security;
