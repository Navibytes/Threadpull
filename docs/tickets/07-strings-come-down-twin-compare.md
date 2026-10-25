# 07: Strings come down: explanations and Twin Compare

**Owner:** A (Evidence)  
**Target:** H9, Sat 18:00

**What to build:** When Hazel looks at a lookalike, she can run explanation checks. When one holds, the string falls off the corkboard with the cited reason. The Twin Compare view shows two lookalike borrowers side by side, splitting at one piece of evidence.

**Blocked by:** 05 Hazel v1: the first ring, end to end; 06 More CRS tools and recovery cases

**Status:** in progress (A). The four checks are done (PR #4, `lib/evidence/explanations.ts`); taking strings down in the graph is done (`lib/evidence/withdraw.ts`); waiting on 05 (Hazel writes the rows) and C (board, Twin Compare UI).

- [x] New tools (names and costs in `lib/contracts/tool-result.ts`): `check_address` (address-type lookup, labeled simulated), `check_household`, `check_employer` (headcount and group size in the pool), and `dealer_timeline` for month-end bursts. Each returns a `ToolResult` built with `toolOk` / `toolError`.
  - `check_employer` never takes a string down by itself: it reports `large_employer` / `small_employer` / `implausible`, and clearing a large employer is R-001's or a human's job (ticket 11), so the ask-once moment stays in the demo.
  - `dealer_timeline` explains a burst only when it's at month-end and the dealer did the same in at least 3 other months. Volume alone is weak: ordinary dealers reach 5–6 loans in 10 days by chance.
  - Census unit counts: the real geocoder can't count units, so `check_address` uses the simulated lookup and says so.
- [x] Taking a string down: `withdrawAddress`, `withdrawHousehold`, `withdrawBursts` (`lib/evidence/withdraw.ts`) take a check's result, set the links it proves to weight 0 in D's graph (kept, with the explanation), and return the `clue_explained` row payload in the shape agreed with C (`edge_ids`, `explained_by`, `reason`; sources start with the check's own event row). Nothing changes unless the check succeeded and explains. A building drops only its address links; a household drops only the pair's phone and address links; a burst drops no link (`edge_ids: []`).
  - On seeds 13, 7 and 21, running every explaining check over the whole pool brings down exactly the building, the household and the dealer burst; the ring stays the strongest cluster and no ring link drops (`tests/evidence-withdraw.test.ts`).
- [x] The agent loop writes those rows (`check_run`, then `clue_explained`) and code decides any status change (needs 05). (Done by D's Hazel loop: `lib/agent/hazel.ts` calls `withdrawAddress` / `withdrawHousehold` / `withdrawBursts`; tested in `tests/hazel.test.ts`.)
- [ ] The falling-string animation (Motion) plays only on a `clue_explained` event row (pair with C for the board side).
- [ ] Twin Compare panel (shadcn/ui card + Motion): two loans side by side, with the one differing piece of evidence highlighted.
- [x] On seeds 13, 7 and 21: the apartment pair is explained, the household is the only shared-phone pair explained, the month-end burst is explained by the dealer's history, the hospital is reported large (cleared later by R-001), and **no ring link is explained away** (`tests/evidence-explanations.test.ts`).
- [x] No detection logic names a persona, the twins or a planted pattern (`tests/architecture.test.ts` checks `persona_id`; the checks take only loans and lookups).

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
