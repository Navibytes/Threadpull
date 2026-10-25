# 15: bun run demo, replay and judge seed

**Owner:** C (Board)  
**Target:** H19, Sun 04:00 (feature freeze)

**What to build:** One command runs the full 3-minute demo. A recorded run replays identically, and judges can pick a seed and watch a live run.

**Blocked by:** 09 Investigator UI: filing drawer, corkboard and notebook; 10 CRO screen and deal engine

**Status:** ready-for-agent

**Update (Sat 23:05, checked against `main`):** Not started on `main`. What exists to build on: `/?run=<run_id>` plays a recorded Supabase run (history at once, then live rows), `bun run hazel` writes runs to Supabase and prints the board link, and `bun run data:check` verifies a seed end to end. Open: `bun run demo`, replay with speed control, the seed picker.

**Update (Sat 23:35, checked against `main`):** The demo needs a fresh recorded run: the current one (`r13-20261025T053505`) has no falling thread and no seed on `run_started` (it predates PRs #26, #34, #35). D to rerun with `bun run hazel`; the board plays it at `/?run=<run_id>`.

**Update (Sun 00:40, checked against `main`):** Demo run: `r13-20261025T072822` has every demo moment except R-001 (the falling thread, the refused pay stub, the CRO screen). Open: `bun run demo` / replay.

- [ ] `bun run demo` generates seed 13, runs Hazel (live, or replay of the recorded best run) and opens the board; it works three times in a row.
- [ ] Replay reproduces the same events in order, with adjustable speed.
- [ ] A seed picker starts a live run on any seed and falls back to replay, clearly labeled, if CRS is unavailable.
- [ ] Timings follow the demo script in SKELETON §2.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
