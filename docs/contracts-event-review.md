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
| 2 | `result` payload per type. **Agreed with A** and in the draft: `clue_explained {edge_ids, explained_by (a TOOL_SPECS name or "rule"), rule_id (required for "rule"), reason}`, citing the check's `{kind: "event"}` row or a rule; `attack_detected {doc_id, rules, lines, unexpected_lines, invisible_characters, withheld_fields}`, no document text (`attackEvent` in lib/evidence builds it). **Still open:** `status_changed` (proposed `{status}`) and the other types | other types untyped | D (status_changed) |
| 3 | `link_found` endpoints: loan↔loan via `loan_ids[0..1]` (as §8 shows), or loan↔entity with `a`/`b` node ids (§6) | loan↔loan from `loan_ids` | D (graph), C |
| 4 | ~~Source kinds beyond crs/row~~ | **Settled** by `tool-result.ts` (seven kinds); the event contract reuses it | — |
| 5 | ~~Budget unit~~ | **Settled** on main: acorns, 60 per run (SKELETON §7, CLAUDE.md, `TOOL_SPECS`); `budget {spent, limit}` is in acorns | — |
| 6 | Is `seq` contiguous per run (1, 2, 3, …)? The board's live feed relies on it to detect gaps (it still works without it, with extra reads) | assumed contiguous | D |
| 7 | Hazel's notebook shows "What I saw" from `note`. "Why it matters" and "What's next" have no field, so they show "Not recorded in this event." Add optional `why` and `next` strings to the row (or to `result`)? | not read; shown as not recorded | D (agent writes notes) |

Dealer bursts (A and D): a burst isn't a link between two loans, so until D decides whether bursts get a `link_found`, a burst's `clue_explained` has empty `edge_ids` and names its loans in `loan_ids`.

The board draws `lead_opened` and `link_found` today. Taking a thread down on `clue_explained` is the next board change, now that its shape is agreed. `status_changed` rows are kept in the log but don't change a card until question 2 settles it.
