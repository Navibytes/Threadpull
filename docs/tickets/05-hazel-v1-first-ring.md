# 05: Hazel v1: the first ring, end to end

**Owner:** D (Investigation)
**Target:** H6, Sat 15:00

**What to build:** Starting a live run on seed 13 makes Hazel open the top lead, choose tools herself, and leave a ring on the corkboard. Everything on screen comes from real events she produced.

**Blocked by:** 01 Contracts and walking skeleton; 03 Live CRS identity check, persona guard and acorn ledger; 04 Evidence graph and weights

**Status:** done (D, Sun 2026-10-25). Live on seed 13 with Claude Sonnet 5.5: 6 of 6 ring loans in every run (r13-20261025T024910, r13-20261025T053505, and the frozen-detector proof run r13-20261025T094302 by A, see `docs/PROOF.md`). Events go to the Supabase `events` table (#28) and the local JSONL log.

**Update (Sat 23:05, checked against `main`):** Events persist to Supabase (D, PR #28: run `r13-20261025T053505`, 41 of 41 rows written and read back), and all four CRS tools are in the loop (PR #29). A failed model request now ends the log with `run_finished` instead of stopping mid-run (A, PR #26). Open: the 4-of-6 measurement belongs in `docs/PROOF.md` through ticket 13, after the freeze.

**Update (Sat 23:35, checked against `main`):** The recorded run `r13-20261025T053505` plays on the board (`/?run=…`): 6 of 6 ring loans closed as Investigate, 11 of 60 acorns, one clean loan No material anomaly found (one run, not a proof measurement). It stopped after the ring because the prompt said to; Hazel now keeps working the next lead `close_lead` hands over (A, PR #35), and notes keep decimals whole (A, PR #34: that run's lead note was stored as "4352)."). Open: a fresh `bun run hazel` after #34 and #35, which also carries the seed on `run_started`.

**Update (Sun 00:40, checked against `main`):** Fresh live run `r13-20261025T072822` (after #34, #35, #40): 6 of 6 ring Investigate, 0 innocents flagged, 10 of 60 acorns, 58 s; the apartment-building thread falls and the injected pay stub is flagged; the seed is on `run_started`. Board: `/?run=r13-20261025T072822`, CRO screen: `/cro?run=r13-20261025T072822`.

- [x] A Python tool-use loop and Anthropic SDK adapter exist in `backend/agent.py`; the loop enforces its tool allowlist, budget, and backend-owned statuses.
- [x] The Python run writes event and model-trace JSONL, stops at budget/no leads, and bounds notes with sources.
- [x] Tools without CRS (inspect_loan, find_connections, compare_documents, dealer_timeline, inspect_dealer_loans, check_address, check_household, check_employer) in `lib/agent/tools.ts`: Zod inputs, TOOL_SPECS costs, documents only through `safeDocumentView`, SSN masked; `tests/agent-tools.test.ts`.
- [x] Agent loop in `lib/agent/hazel.ts` (Anthropic SDK tool runner, `claude-sonnet-5-5` at medium effort, server-side refusal fallback), with `crs_identity_check`, `ask_human` and `close_lead`; statuses decided by code (`lib/agent/status.ts`).
- [x] Use the issue 03 guarded CRS client and the issue 04 graph over generated seed 13 data; verify the 4-of-6 target within 60 acorns. (Proof run r13-20261025T094302 on the frozen detector: 6 of 6, 0 innocents; see `docs/PROOF.md`.)
- [x] Persist each SKELETON §8 event and model trace through the configured storage/event path so the board can render only recorded events. (Done to `runs/<run_id>/events.jsonl` + `trace.jsonl` through an `EventSink`; Supabase sink waits on C's events table.)

The TypeScript portfolio generator and loan contract are now available from main. The existing Python prototype uses the earlier flat loan shape and injected identity adapter; it is useful as behavior reference, not yet wired to the current dataset or application.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.

**Update (Sun 02:45, A): the verification sweep.** The frozen seed 13 run (`r13-20261025T092328`) found the ring for 7 acorns and stopped with 53 unspent, 0 of 3 review cases: loans tied to nothing are never leads. Now, when Hazel is done, code spends what is left on the largest unverified balances (identity check, then a credit report when it checks out; `decideStatus` sets the status; `sweep: false` turns it off). Order is by amount financed only; nothing knows which loans are cases. Measured once, live: `r13-20261025T093238` ring 6 of 6 (complete after 9 acorns), 0 of 50 innocents, review cases 1 of 3 (a frozen bureau), 60 acorns. Changes detection code, so the freeze tag moves after the merge, before seed 99.

