# 04: Evidence graph and weights

**Owner:** D (Investigation)  
**Target:** H5, Sat 14:00

**What to build:** From the normalized portfolio, the backend builds the typed, weighted evidence graph. Asking `find_connections` for loan #37 returns its neighbors with weights and sources, and a priority score ranks which leads to open first.

**Blocked by:** 02 Seeded portfolio and answer key

**Status:** in-progress (implementation ready; seed-13 ranking awaits issue 02 data)

- [x] Nodes and edges follow SKELETON §6: personal things (phone, email, bank account, device) are strong links; shared-by-nature things use `weight = 1 / n`; household links fade; clues from the same origin count once.
- [x] Location alone (ZIP, neighborhood) never creates an edge.
- [x] `find_connections` returns the SKELETON §7 tool-result shape at 0 acorns.
- [x] Explaining an edge marks it explained, keeps the reason and proving source, sets its weight to 0, and never deletes it.
- [ ] A priority score (a ranking, not a probability) puts the ring's lead in the top 5 on seed 13 without any code that names personas or planted patterns. Blocked until issue 02 provides seed-13 data.
- [x] Unit tests cover 1/n weighting, the household fade, origin grouping and the no-location rule.

Implementation: `backend/graph.py`; tests: `tests/test_graph.py`. The graph depends on NetworkX (`requirements.txt`). Generic graph and ranking tests pass in the project virtual environment. The exact seed-13 ranking check remains blocked by issue 02 data.

Spec: SKELETON.md (contracts, rules and the 24-hour plan).
