# 11: Ask once, remember forever

**Owner:** D (Investigation)
**Target:** H16, Sun 01:00

**What to build:** When Hazel can't decide, the right person gets one precise question. The answer becomes a saved rule, the next similar case is handled automatically citing it, and a case outside the rule's scope asks again.

**Blocked by:** 07 Strings come down: explanations and Twin Compare; 10 CRO screen and deal engine

**Status:** in-progress (Python rule memory and Hazel integration exist; TypeScript/Supabase and CRO API/UI integration remain)

- [x] The Python prototype routes questions, computes confidence from evidence weights, and distinguishes `no precedent` from `sources disagree`.
- [x] Answers can become scoped, versioned drafts; confirmed rules persist and matching clues emit rule/explanation events.
- [ ] Port rule schemas, matching, persistence, and events to the TypeScript contracts and Supabase rules/questions tables.
- [ ] Wire question display, answer, and confirmation through the CRO screen/API from issue 10.
- [ ] Integrate issue 07 explanation contexts so all scope fields have evidence-backed values; out-of-scope cases must ask again.
- [ ] Exercise P16 fraud-alert routing with the issue 02 seed and issue 03 CRS integration.

The Python implementation is in `backend/rules.py` and `backend/agent.py`; it predates the TypeScript architecture. Its context provider must supply concrete scope values such as employer size and credit-file tenure; missing values never match a rule.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
