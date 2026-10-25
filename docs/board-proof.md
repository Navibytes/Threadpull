# Board proof: Supabase events → corkboard (ticket 01)

Run on 2026-10-24 against the team's hosted Supabase project, after pushing `20261024120000_loans.sql` and `20261024130000_events.sql`. A headless Chrome opened `/?run=<run_id>` on a production build (`bun run build && bun run start`). A script then inserted rows into `events` with the service-role key. The rows were hand-written, every one `simulated: true`, with no CRS sources, under run ids `proof-…`. Three consecutive runs, 8/8 checks each, no browser console errors:

| Check | Result | Evidence (run `proof-1792876057894`) |
| --- | --- | --- |
| Board opens on the run, badge LIVE, empty | PASS | `badge: "LIVE run proof-…"`, 0 cards |
| `lead_opened` insert pins a card, no reload | PASS | card after 113 ms; page marker kept, 1 navigation |
| `link_found` insert adds card + yarn, no reload | PASS | `PROOF-02` + thread `e-phone-proof` after 116 ms (547–872 ms in other runs) |
| Seq 5 inserted before seq 4 | PASS | 5 waits for 4; both applied in seq order |
| Seq 7 inserted 3 s before seq 6 (longer than the feed waits) | PASS | while waiting: notice "seq 6 is missing"; when 6 lands, the board rebuilds in seq order and the notice clears |
| Reload rebuilds the identical board from ordered history | PASS | same 6 cards, 3 threads and positions before and after; page marker gone (real reload) |
| Thread details | PASS | sources `PROOF-01 · applicant_info.phone`, `PROOF-02 · …`, seq 3, Mode LIVE, Verification simulated, CRS RequestID "none (no CRS call on this row)" |
| `events` is insert-only | PASS | PATCH and DELETE with the service-role key → 403 `42501` |

Also checked: the anon key can read `events` (HTTP 200) and cannot insert (RLS `42501`). Without the public Supabase env vars, `/?run=…` shows the PREVIEW fixture with a notice saying why.

Run 2 of an earlier batch crashed in the script's last step (network). Its update/delete refusal was re-checked by hand on that run's rows (both 403, all 7 rows intact), and then the three clean runs above were made.

## Reproduce by hand

1. `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, then `bun run dev`.
2. Open `http://localhost:3000/?run=demo-1`.
3. In the Supabase SQL editor, run one statement at a time and watch the board:

```sql
insert into events (run_id, seq, type, loan_ids, tool, result, sources, note, budget, simulated) values
('demo-1', 1, 'lead_opened', '{L9001}', 'inspect_loan', '{"loan_id":"L9001"}',
 '[{"kind":"row","loan_id":"L9001","field":"applicant_info"}]', 'Hand-inserted lead.', '{"spent":0,"limit":60}', true);

insert into events (run_id, seq, type, loan_ids, tool, result, sources, note, budget, simulated) values
('demo-1', 2, 'link_found', '{L9001,L9002}', 'find_connections', '{"edge_id":"e-phone-demo","kind":"phone","weight":0.33}',
 '[{"kind":"row","loan_id":"L9001","field":"applicant_info.phone"},{"kind":"row","loan_id":"L9002","field":"applicant_info.phone"}]',
 'Same phone on both rows.', '{"spent":0,"limit":60}', true);
```

4. Reload the page: the same board comes back. Rows can't be edited or deleted, so use a new `run_id` for each try.
