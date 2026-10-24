# 04: Evidence graph and weights

**Owner:** D (Investigation)  
**Target:** H5, Sat 14:00

**What to build:** From the normalized portfolio, `lib/graph` builds the typed, weighted evidence graph with **graphology**, including connected clusters. Asking `find_connections` for loan #37 returns its neighbors with weights and sources, and a priority score ranks which leads to open first.

**Blocked by:** 02 Seeded portfolio and answer key

**Status:** ready-for-agent

- [ ] Nodes and edges follow SKELETON §6: personal things (phone, email, bank account, device) are strong links; shared-by-nature things use `weight = 1 / n`; household links fade; clues from the same origin count once.
- [ ] Location alone (ZIP, neighborhood) never creates an edge.
- [ ] `find_connections` returns the SKELETON §7 tool-result shape at 0 acorns.
- [ ] Explaining an edge marks it explained, keeps the reason and proving source, sets its weight to 0, and never deletes it.
- [ ] Connected clusters (graphology components over unexplained edges above a weight threshold) are available to Hazel and the board.
- [ ] A priority score (a ranking, not a probability) puts the ring's lead in the top 5 on seed 13 without any code that names personas or planted patterns.
- [ ] `bun test` unit tests cover 1/n weighting, the household fade, origin grouping and the no-location rule.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
