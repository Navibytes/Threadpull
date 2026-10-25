# 11: Ask once, remember forever

**Owner:** D (Investigation)
**Target:** H16, Sun 01:00

**What to build:** When Hazel can't decide, the right person gets one precise question. The answer becomes a saved rule, the next similar case is handled automatically citing it, and a case outside the rule's scope asks again.

**Blocked by:** 07 Strings come down: explanations and Twin Compare; 10 CRO screen and deal engine

**Status:** in-progress (D, A). Questions, rulings and the CRO screen work end to end (A, #46: `components/cro/questions.tsx`, `app/api/runs/[id]/questions`, `FileRuleStore` in `runs/rules.json`); R-001 cleared employer links live on A's runs. P16 exercised live (r13-20261025T102626, lead L0279 chosen by the operator): TU 2401, code set Investigate "fraud alert on file: needs the CRO"; Hazel proposed clearing it and asked no question. Her prompt is frozen detection code, so that is left as is. Remaining (optional): Supabase `rules`/`questions` tables.

**Update (Sat 23:05, checked against `main`):** R-001 now applies only to the employer actually checked (A, PR #26: a hospital check with a ring loan's id used to clear the ring). Open as listed below; the CRO screen part depends on ticket 10.

**Update (Sun 02:20, A, end to end):** The answer path is built and checked live.
- Questions and rulings persist in a `FileRuleStore` (`runs/rules.json`, `bun run hazel --rules`).
- The CRO screen's "Questions for you" shows each question with its recipient, the confidence and reason code computed, the evidence both ways and the proposed scope, and takes Yes (saves a rule, the staff count editable) or No (`POST /api/runs/<id>/questions`, `lib/deal/questions.ts`). The answer writes a `question_answered` row to the run's log and the Supabase `events` table.
- `bun run hazel --lead` lets the operator pick the first leads; it is recorded on `run_started` and each `lead_opened` row.
- A proposed scope now holds only facts the run can check: no tenure condition unless a tenure fact was given (nothing in a live run supplies one yet), so R-001 can actually match.

Live, seed 13:
1. **Run `r13-20261025T091427`.** Hazel asked the CRO on her own: q-001, a 684-staff employer shared by 2 loans (L0742, L0936), confidence 100%, no precedent.
2. **The answer.** Answered Yes on the CRO screen, which saved R-001 v1 (shared employer, 500+ staff).
3. **Run `r13-20261025T091630`** (`--lead L0742,L0168,L0398 --rules runs/rules.json`). R-001 took three links down citing the rule, with no question: L0742, L0168 (515 staff) and L0396 (3,891 staff, reached by rank). It left the ring's 4-staff shell company standing: ring 6/6, 12 acorns, 0 questions.

**Not seen live.** A 48,000-staff employer shared by 40 loans weighs 0.025 under the rarity rules, so Hazel rightly never asks about the hospital. On the 38-staff dental group she closed the lead herself (no other shared value) instead of asking. "Outside the scope asks again" is shown by `tests/ask-once.test.ts` (scripted model), not by a live run.

- [x] The Python prototype routes questions, computes confidence from evidence weights, and distinguishes `no precedent` from `sources disagree`.
- [x] Answers can become scoped, versioned drafts; confirmed rules persist and matching clues emit rule/explanation events.
- [x] Port rule schemas, matching and event payloads to TypeScript (`lib/contracts/rule.ts`, `lib/rules`); code sets recipient, confidence and reason; storage behind a `RuleStore` interface (in-memory now).
- [ ] Supabase `rules`/`questions` tables behind `RuleStore` (migrations: C/B). For now: `FileRuleStore`, `runs/rules.json`.
- [x] Wire question display, answer, and confirmation through the CRO screen/API from issue 10 (`components/cro/questions.tsx`, `app/api/runs/[id]/questions`, `lib/deal/questions.ts`).
- [x] Integrate issue 07 explanation contexts so all scope fields have evidence-backed values; out-of-scope cases must ask again (`employerLink` over `check_employer`; tenure fact plugs in from `crs_credit_report`).
- [x] Exercise P16 fraud-alert routing with the issue 02 seed and issue 03 CRS integration. (r13-20261025T102626: routed to the CRO by status; no question asked.)

The Python implementation is in `backend/rules.py` and `backend/agent.py`; it predates the TypeScript architecture. Its context provider must supply concrete scope values such as employer size and credit-file tenure; missing values never match a rule.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
