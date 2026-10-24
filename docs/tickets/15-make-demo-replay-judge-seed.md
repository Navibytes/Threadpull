# 15: bun run demo, replay and judge seed

**Owner:** C (Board)  
**Target:** H19, Sun 04:00 (feature freeze)

**What to build:** One command runs the full 3-minute demo. A recorded run replays identically, and judges can pick a seed and watch a live run.

**Blocked by:** 09 Investigator UI: filing drawer, corkboard and notebook; 10 CRO screen and deal engine

**Status:** ready-for-agent

- [ ] `bun run demo` generates seed 13, runs Hazel (live, or replay of the recorded best run) and opens the board; it works three times in a row.
- [ ] Replay reproduces the same events in order, with adjustable speed.
- [ ] A seed picker starts a live run on any seed and falls back to replay, clearly labeled, if CRS is unavailable.
- [ ] Timings follow the demo script in SKELETON §2.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
