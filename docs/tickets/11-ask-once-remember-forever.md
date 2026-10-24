# 11: Ask once, remember forever

**Owner:** D (Investigation)  
**Target:** H16, Sun 01:00

**What to build:** When Hazel can't decide, the right person gets one precise question. The answer becomes a saved rule, the next similar case is handled automatically citing it, and a case outside the rule's scope asks again.

**Blocked by:** 07 Strings come down: explanations and Twin Compare; 10 CRO screen and deal engine

**Status:** ready-for-agent

- [ ] `ask_human` carries a confidence % computed by code from conflicting clue weights, a reason (`no precedent` / `sources disagree`) and a recipient from a routing table (CRO, credit analyst, legal, compliance).
- [ ] The question shows on the CRO screen; a plain-English answer is drafted into the SKELETON §9 rule shape, the CRO confirms it, and it is stored with a version.
- [ ] The next matching link is explained with a `rule_applied` event citing the rule id and ruling time.
- [ ] A case outside the rule's scope (for example a small employer) asks again.
- [ ] P16's fraud alert produces a question to the CRO.
- [ ] Rules persist across runs in the Supabase `rules` table (Zod-validated), with a reset for demos.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
