# 07: Strings come down: explanations and Twin Compare

**Owner:** A (Evidence)  
**Target:** H9, Sat 18:00

**What to build:** When Hazel looks at a lookalike, she can run explanation checks. When one holds, the string falls off the corkboard with the cited reason. The Twin Compare view shows two lookalike borrowers side by side, splitting at one piece of evidence.

**Blocked by:** 05 Hazel v1: the first ring, end to end; 06 More CRS tools and recovery cases

**Status:** in progress (A). The four checks are done (PR #4, `lib/evidence/explanations.ts`); waiting on 05 (Hazel, the `clue_explained` event, graph edges) and C (board, Twin Compare UI).

- [x] New tools (names and costs in `lib/contracts/tool-result.ts`): `check_address` (address-type lookup, labeled simulated), `check_household`, `check_employer` (headcount and group size in the pool), and `dealer_timeline` for month-end bursts. Each returns a `ToolResult` built with `toolOk` / `toolError`.
  - `check_employer` never takes a string down by itself: it reports `large_employer` / `small_employer` / `implausible`, and clearing a large employer is R-001's or a human's job (ticket 11), so the ask-once moment stays in the demo.
  - `dealer_timeline` explains a burst only when it's at month-end and the dealer did the same in at least 3 other months. Volume alone is weak: ordinary dealers reach 5–6 loans in 10 days by chance.
  - Census unit counts: the real geocoder can't count units, so `check_address` uses the simulated lookup and says so.
- [ ] A `clue_explained` event carries the proving source; the edge is marked explained with weight 0; any status change is decided by code.
- [ ] The falling-string animation (Motion) plays only on a `clue_explained` event row (pair with C for the board side).
- [ ] Twin Compare panel (shadcn/ui card + Motion): two loans side by side, with the one differing piece of evidence highlighted.
- [x] On seeds 13, 7 and 21: the apartment pair is explained, the household is the only shared-phone pair explained, the month-end burst is explained by the dealer's history, the hospital is reported large (cleared later by R-001), and **no ring link is explained away** (`tests/evidence-explanations.test.ts`).
- [x] No detection logic names a persona, the twins or a planted pattern (`tests/architecture.test.ts` checks `persona_id`; the checks take only loans and lookups).

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
