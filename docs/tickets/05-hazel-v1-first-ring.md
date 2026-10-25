# 05: Hazel v1: the first ring, end to end

**Owner:** D (Investigation)
**Target:** H6, Sat 15:00

**What to build:** Starting a live run on seed 13 makes Hazel open the top lead, choose tools herself, and leave a ring on the corkboard. Everything on screen comes from real events she produced.

**Blocked by:** 01 Contracts and walking skeleton; 03 Live CRS identity check, persona guard and acorn ledger; 04 Evidence graph and weights

**Status:** in-progress (D). The loop is built and tested with a scripted model on seed 13 (`lib/agent/hazel.ts`, `tests/hazel.test.ts`): code opens the top lead, charges B's ledger, writes every §8 event row, takes strings down, applies saved rules and decides statuses. Left: a live run with Claude (`bun run hazel`, needs `ANTHROPIC_API_KEY`) to measure the 4-of-6 target, and Supabase as an event sink (C's events table).

**Update (Sat 23:05, checked against `main`):** Events persist to Supabase (D, PR #28: run `r13-20261025T053505`, 41 of 41 rows written and read back), and all four CRS tools are in the loop (PR #29). A failed model request now ends the log with `run_finished` instead of stopping mid-run (A, PR #26). Open: the 4-of-6 measurement belongs in `docs/PROOF.md` through ticket 13, after the freeze.

**Update (Sat 23:35, checked against `main`):** The recorded run `r13-20261025T053505` plays on the board (`/?run=…`): 6 of 6 ring loans closed as Investigate, 11 of 60 acorns, one clean loan No material anomaly found (one run, not a proof measurement). It stopped after the ring because the prompt said to; Hazel now keeps working the next lead `close_lead` hands over (A, PR #35), and notes keep decimals whole (A, PR #34: that run's lead note was stored as "4352)."). Open: a fresh `bun run hazel` after #34 and #35, which also carries the seed on `run_started`.

**Update (Sun 00:40, checked against `main`):** Fresh live run `r13-20261025T072822` (after #34, #35, #40): 6 of 6 ring Investigate, 0 innocents flagged, 10 of 60 acorns, 58 s; the apartment-building thread falls and the injected pay stub is flagged; the seed is on `run_started`. Board: `/?run=r13-20261025T072822`, CRO screen: `/cro?run=r13-20261025T072822`.

- [x] A Python tool-use loop and Anthropic SDK adapter exist in `backend/agent.py`; the loop enforces its tool allowlist, budget, and backend-owned statuses.
- [x] The Python run writes event and model-trace JSONL, stops at budget/no leads, and bounds notes with sources.
- [x] Tools without CRS (inspect_loan, find_connections, compare_documents, dealer_timeline, inspect_dealer_loans, check_address, check_household, check_employer) in `lib/agent/tools.ts`: Zod inputs, TOOL_SPECS costs, documents only through `safeDocumentView`, SSN masked; `tests/agent-tools.test.ts`.
- [x] Agent loop in `lib/agent/hazel.ts` (Anthropic SDK tool runner, `claude-sonnet-5-5` at medium effort, server-side refusal fallback), with `crs_identity_check`, `ask_human` and `close_lead`; statuses decided by code (`lib/agent/status.ts`).
- [ ] Use the issue 03 guarded CRS client and the issue 04 graph over generated seed 13 data; verify the 4-of-6 target within 60 acorns. (Wired and passing with a scripted model and recorded CRS answers; the live measurement is `bun run hazel`.)
- [x] Persist each SKELETON §8 event and model trace through the configured storage/event path so the board can render only recorded events. (Done to `runs/<run_id>/events.jsonl` + `trace.jsonl` through an `EventSink`; Supabase sink waits on C's events table.)

The TypeScript portfolio generator and loan contract are now available from main. The existing Python prototype uses the earlier flat loan shape and injected identity adapter; it is useful as behavior reference, not yet wired to the current dataset or application.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
