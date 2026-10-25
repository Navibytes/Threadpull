# 09: Investigator UI: filing drawer, corkboard and notebook

**Owner:** C (Board)  
**Target:** H9, Sat 18:00

**What to build:** Watching a live or replayed run, a judge sees the filing drawer statuses change, index cards and yarn appear on the corkboard, and Hazel's notebook explain every step with the acorns left.

**Blocked by:** 01 Contracts and walking skeleton; 05 Hazel v1: the first ring, end to end

**Status:** built (C); one item open

**Update (Sat 23:05, checked against `main`):** Built on `main` (C): filing drawer with the four status words and status/dealer filters, React Flow corkboard fed by Supabase Realtime (yarn by weight, sage when explained, the fall), evidence panel with Twin Compare, Hazel's notebook with acorns, SIMULATED/CRS stamps, an "Event numbers" overlay, the plain-English case summary, and `/dashboard`. Card statuses show since PR #26. Open: a live/replay toggle (needs ticket 15's replay).

- [x] Filing drawer: 1,000 loans with status chips using the exact four words; filter by status and dealer.
- [x] Corkboard (React Flow + Motion), fed by Supabase Realtime: index-card nodes, yarn thickness from weight, terracotta for suspicion, sage when explained, falling animation on `clue_explained`; 20–30 cards visible, focused on the active case.
- [x] Notebook: what Hazel saw, why it matters, her next action, acorns spent of the limit with the real unit.
- [x] A `simulated` badge wherever an event is simulated.
- [ ] Live/replay toggle.
- [ ] Visual identity with Tailwind + shadcn/ui: cream paper, cork, walnut type, terracotta thread, sage resolved; Hazel is a small avatar.
- [x] A debug overlay shows the event sequence number behind every animation.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
