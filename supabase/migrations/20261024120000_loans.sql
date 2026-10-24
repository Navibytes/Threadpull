-- Normalized loans for the filing drawer (ticket 02). The full record is the Zod `Loan` (lib/contracts/loan.ts).
create table if not exists public.loans (
  seed        int  not null,
  loan_id     text not null,
  kind        text not null check (kind in ('case', 'background')),
  dealer_id   text not null,
  status      text not null default 'Not reviewed',
  record      jsonb not null,
  updated_at  timestamptz not null default now(),
  primary key (seed, loan_id)
);
create index if not exists loans_seed_status on public.loans (seed, status);
create index if not exists loans_seed_dealer on public.loans (seed, dealer_id);

alter table public.loans enable row level security;
-- The browser (anon key) can read loans; only server code with the service-role key writes them.
create policy "loans are readable" on public.loans for select using (true);
