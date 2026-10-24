# 07: Strings come down: explanations and Twin Compare

**Owner:** A (Evidence)  
**Target:** H9, Sat 18:00

**What to build:** When Hazel looks at a lookalike, she can run explanation checks. When one holds, the string falls off the corkboard with the cited reason. The Twin Compare view shows two lookalike borrowers side by side, splitting at one piece of evidence.

**Blocked by:** 05 Hazel v1: the first ring, end to end; 06 More CRS tools and recovery cases

**Status:** ready-for-agent

- [ ] New tools (names and costs in `lib/contracts/tool-result.ts`): `check_address` (Census geocoder plus address-type lookup), `check_household`, `check_employer` (headcount and group size in the pool, or credit-file employments), and `dealer_timeline` for month-end bursts. Each returns a `ToolResult` built with `toolOk` / `toolError`.
- [ ] A `clue_explained` event carries the proving source; the edge is marked explained with weight 0; any status change is decided by code.
- [ ] The falling-string animation (Motion) plays only on a `clue_explained` event row (pair with C for the board side).
- [ ] Twin Compare panel (shadcn/ui card + Motion): two loans side by side, with the one differing piece of evidence highlighted.
- [ ] On seed 13: the apartment twins split, the hospital pair is explained, the household phone fades, and no ring member is explained away.
- [ ] No detection logic names a persona, the twins or a planted pattern.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
