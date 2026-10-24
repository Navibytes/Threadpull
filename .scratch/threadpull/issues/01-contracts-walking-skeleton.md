# 01: Contracts and walking skeleton

**Owner:** C (Board)  
**Target:** H3, Sat 12:00

**What to build:** Any teammate can start the backend and frontend with one command. A hand-written sample event log replays over the live stream, and loan cards plus one yarn thread appear on a bare corkboard. The shared shapes for a loan record, a tool result and an event (SKELETON §5.1, §7, §8) exist on both sides, so everyone else codes against them from noon.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] One command starts backend and frontend locally.
- [ ] Starting a run in replay mode with the sample log streams its events in order to the frontend.
- [ ] The corkboard draws a card for each loan in `lead_opened` / `link_found` events and a thread for each `link_found`, thickness `1 + 8 × weight`.
- [ ] Shared types exist for loan record, tool result and event; the sample log contains at least one event of every type in SKELETON §8.
- [ ] `.env` and generated data are gitignored from the first commit; an example env file lists every needed key without values.
- [ ] README stub explains how to run it; a test command runs (even if it has few tests yet).
- [ ] Contracts announced to the team as frozen at 12:00; later changes are posted in the team chat first.

**Notes:** This is the integration spine: keep it boring. No styling beyond what's needed to see cards and threads.

Spec: SKELETON.md (contracts, rules and the 24-hour plan).
