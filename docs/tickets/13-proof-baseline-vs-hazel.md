# 13: Proof: fixed-rule baseline vs Hazel

**Owner:** D (Investigation)
**Target:** H18, Sun 03:30

**What to build:** The CRO screen's proof panel shows measured results for Hazel against a fixed-rule baseline with the same tools and budget, and against the cost of checking everything, on seeds 13 and 99.

**Blocked by:** 06 More CRS tools and recovery cases; 12 Detector freeze and held-out set

**Status:** in-progress (Python baseline/metric prototypes exist; authoritative Bun evaluator and measured runs remain)

- [x] A Python fixed-checklist runner exists in `backend/baseline.py` and shares the Python Hazel tool boundary and budget.
- [x] Python proof helpers calculate the requested metrics from event records and an answer key, and can render a guarded comparison table (`backend/proof.py`).
- [ ] Implement the authoritative TypeScript baseline in `eval/baseline.ts`, using the final production tool set and same budget as Hazel.
- [ ] Implement `eval/evaluate.ts` as the only runtime code that reads generated answer keys; calculate ring members found, innocents left flagged, unnecessary escalations, acorns, questions, runtime, and full-check cost.
- [ ] Run seed 13 and the held-out seed exactly once after `detector-frozen`; record commit hashes and simulated-call labels.
- [ ] Generate `docs/PROOF.md` from those records, with no hand-entered measurements.

The seed 13 generator and answer-key format are now available from issue 02. The seed 99 spec/tag (issue 12), full CRS/tool set (issue 06), and completed Hazel integration are still absent. The Python evaluator is a prototype and is not the authoritative reader of answer keys under `docs/ARCHITECTURE.md`.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
