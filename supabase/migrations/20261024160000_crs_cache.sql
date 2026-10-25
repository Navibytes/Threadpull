-- Cached CRS sandbox responses (ticket 03), so repeated demo runs don't re-hit the sandbox.
-- cache_key is a sha256 of the endpoint name and request body (lib/crs/cache.ts); request_id is the original RequestID header.
create table if not exists public.crs_cache (
  cache_key   text primary key,
  endpoint    text  not null,
  request_id  text  not null,
  response    jsonb not null,
  created_at  timestamptz not null default now()
);

-- No policy on purpose: only server code with the service-role key reads or writes this table, the browser (anon key) cannot.
alter table public.crs_cache enable row level security;
