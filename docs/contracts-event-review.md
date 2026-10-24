# Event contract: draft for team review

`lib/contracts/event.ts` encodes SKELETON §8 as written, and `supabase/migrations/20261024130000_events.sql` creates the table. Both are drafts from C (ticket 01). Nothing below is decided until the team agrees in chat. After that, the contract is frozen and changes go through the chat first.

## What the draft fixes (straight from §8)

- Row: `run_id, seq, ts, type, loan_ids, tool, result, sources, note, budget {spent, limit}, simulated`.
- The 15 event types from §8, enforced by Zod and by a check constraint in the table.
- Sources: the team's `SourceRef` from `lib/contracts/tool-result.ts` (A): `row`, `document`, `crs` (with `product`), `lookup`, `rule`, `human`, `event`. A tool's sources go into its event row unchanged.
- Table: primary key `(run_id, seq)`. The browser reads through RLS. Update and delete are refused, even for the service role. Inserts are published to Realtime.

## Open: please decide

| # | Question | Draft today | Who needs it |
| --- | --- | --- | --- |
| 1 | `tool` on steps with no tool (`run_started`, `status_changed`, `run_finished`) | nullable | D (agent writes rows) |
| 2 | `result` payload per type. The board needs at least: `link_found {edge_id, kind, weight}` (in §8), `status_changed {status}`, `clue_explained {edge_id, proving_seq or rule_id}` | untyped object | D, A (07), C |
| 3 | `link_found` endpoints: loan↔loan via `loan_ids[0..1]` (as §8 shows), or loan↔entity with `a`/`b` node ids (§6) | loan↔loan from `loan_ids` | D (graph), C |
| 4 | ~~Source kinds beyond crs/row~~ | **Settled** by `tool-result.ts` (seven kinds); the event contract reuses it | — |
| 5 | ~~Budget unit~~ | **Settled** on main: acorns, 60 per run (SKELETON §7, CLAUDE.md, `TOOL_SPECS`); `budget {spent, limit}` is in acorns | — |
| 6 | Is `seq` contiguous per run (1, 2, 3, …)? The board's live feed relies on it to detect gaps (it still works without it, with extra reads) | assumed contiguous | D |

Until 2 is agreed, the board draws `lead_opened` and `link_found`. `status_changed` and `clue_explained` rows are kept in the log but don't change the board yet.
