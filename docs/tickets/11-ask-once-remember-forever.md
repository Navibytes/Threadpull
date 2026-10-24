# 11: Ask once, remember forever

**Owner:** D (Investigation)
**Target:** H16, Sun 01:00

**What to build:** When Hazel can't decide, the right person gets one precise question. The answer becomes a saved rule, the next similar case is handled automatically citing it, and a case outside the rule's scope asks again.

**Blocked by:** 07 Strings come down: explanations and Twin Compare; 10 CRO screen and deal engine

**Status:** in-progress (D). TypeScript core done: `lib/rules` + `lib/contracts/rule.ts`, tested on seed 13 in `tests/rules.test.ts` (q-001 → R-001 v1 → next hospital lookalike cleared citing R-001 → 38-staff dental group asks again). Remaining: Supabase `rules`/`questions` tables and the CRO answer API/UI (needs 10), real tenure from `crs_credit_report` (06), P16 routing live (03).

- [x] The Python prototype routes questions, computes confidence from evidence weights, and distinguishes `no precedent` from `sources disagree`.
- [x] Answers can become scoped, versioned drafts; confirmed rules persist and matching clues emit rule/explanation events.
- [x] Port rule schemas, matching and event payloads to TypeScript (`lib/contracts/rule.ts`, `lib/rules`); code sets recipient, confidence and reason; storage behind a `RuleStore` interface (in-memory now).
- [ ] Supabase `rules`/`questions` tables behind `RuleStore` (migrations: C/B).
- [ ] Wire question display, answer, and confirmation through the CRO screen/API from issue 10.
- [x] Integrate issue 07 explanation contexts so all scope fields have evidence-backed values; out-of-scope cases must ask again (`employerLink` over `check_employer`; tenure fact plugs in from `crs_credit_report`).
- [ ] Exercise P16 fraud-alert routing with the issue 02 seed and issue 03 CRS integration.

The Python implementation is in `backend/rules.py` and `backend/agent.py`; it predates the TypeScript architecture. Its context provider must supply concrete scope values such as employer size and credit-file tenure; missing values never match a rule.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
