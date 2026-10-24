# 09: Investigator UI: filing drawer, corkboard and notebook

**Owner:** C (Board)  
**Target:** H9, Sat 18:00

**What to build:** Watching a live or replayed run, a judge sees the filing drawer statuses change, index cards and yarn appear on the corkboard, and Hazel's notebook explain every step with the acorns left.

**Blocked by:** 01 Contracts and walking skeleton; 05 Hazel v1: the first ring, end to end

**Status:** ready-for-agent

- [ ] Filing drawer: 1,000 loans with status chips using the exact four words; filter by status and dealer.
- [ ] Corkboard (React Flow + Motion), fed by Supabase Realtime: index-card nodes, yarn thickness from weight, terracotta for suspicion, sage when explained, falling animation on `clue_explained`; 20–30 cards visible, focused on the active case.
- [ ] Notebook: what Hazel saw, why it matters, her next action, acorns spent of the limit with the real unit.
- [ ] A `simulated` badge wherever an event is simulated.
- [ ] Live/replay toggle.
- [ ] Visual identity with Tailwind + shadcn/ui: cream paper, cork, walnut type, terracotta thread, sage resolved; Hazel is a small avatar.
- [ ] A debug overlay shows the event sequence number behind every animation.

Spec: SKELETON.md (contracts, rules and the 24-hour plan).
