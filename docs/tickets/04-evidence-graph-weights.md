# 04: Evidence graph and weights

**Owner:** D (Investigation)
**Target:** H5, Sat 14:00

**What to build:** From normalized TypeScript loan records, `lib/graph` builds the typed, weighted evidence graph with graphology, including connected clusters. `find_connections` returns neighbors with weights and sources, and a priority score ranks which leads to open first.

**Blocked by:** 02 Seeded portfolio and answer key (completed on main; use the generated seed 13 shape)

**Status:** done (D, Sat 2026-10-24). `lib/graph` (graphology) over normalized `Loan` records; edge contract in `lib/contracts/graph.ts`; tests in `tests/graph.test.ts`. On seed 13 the top six leads are the six ring loans and the only cluster is the ring.

- [x] The Python prototype implements personal/shared-by-nature weights, household fading, same-origin grouping, and source-cited explanations.
- [x] The Python prototype does not create location-only edges and returns a zero-cost tool-result envelope.
- [x] Implement the current `lib/graph` TypeScript/graphology module against normalized `Loan` contracts.
- [x] Provide connected clusters over unexplained edges above a documented threshold for Hazel and the board (`CLUSTER_MIN_SCORE` = 0.75 on the pair score, in `lib/graph/weights.ts`).
- [x] Verify the seed 13 top-five lead ranking without persona or pattern-specific detection logic.
- [x] Add `bun test` coverage for weights, household fade, origin grouping, no-location behavior, clusters, and seed 13 ranking.

The existing Python module and its tests are a reference implementation, but they use the earlier flat loan shape and NetworkX. Keep the TypeScript port aligned with `docs/ARCHITECTURE.md`; do not treat the Python results as validation of the new contract.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
