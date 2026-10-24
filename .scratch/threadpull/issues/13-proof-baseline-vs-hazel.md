# 13: Proof: fixed-rule baseline vs Hazel

**Owner:** D (Investigation)  
**Target:** H18, Sun 03:30

**What to build:** The CRO screen's proof panel shows measured results for Hazel against a fixed-rule baseline with the same tools and budget, and against the cost of checking everything, on seeds 13 and 99.

**Blocked by:** 06 More CRS tools and recovery cases; 12 Detector freeze and held-out set

**Status:** ready-for-agent

- [ ] The baseline (`eval/baseline.ts`) runs a fixed checklist in priority order with the same tools and budget.
- [ ] The evaluator (`eval/evaluate.ts`, run with Bun) is the only code that reads the answer keys.
- [ ] Metrics: ring members found, innocents left flagged, unnecessary escalations, acorns spent, questions asked, runtime.
- [ ] The held-out seed runs exactly once after the freeze, and results are recorded with the commit hash.
- [ ] PROOF.md's results table is generated from those results, with simulated calls labeled.
- [ ] No hand-edited numbers anywhere.

Spec: SKELETON.md (contracts, rules and the 24-hour plan).
