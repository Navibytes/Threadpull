# 14: CRO memo and "why" answers

**Owner:** B (Verification)  
**Target:** H18, Sun 03:00

**What to build:** The CRO can read a one-page memo and ask "why loan X?", getting answers grounded only in the run's events.

**Blocked by:** 10 CRO screen and deal engine

**Status:** done (B, Sun 2026-10-25). Needs `ANTHROPIC_API_KEY` in `.env.local` to write a memo; the memo is saved as `runs/<id>/memo.json` beside the run's events, not in Supabase.

- [x] Claude Sonnet 5.5 writes the memo (structured output through `@anthropic-ai/sdk` `messages.parse` and a Zod schema, which is what the repo uses, not the Vercel AI SDK): sentences with event refs, from the facts `lib/deal/memo.ts` lays out of the report. Every sentence carries an event reference, and code drops any sentence without one, and also any that cites an event the facts do not mention, names a loan or uses a number the report does not contain, or breaks the wording rules; the dropped ones are listed on the screen with the reason (`tests/deal-memo.test.ts`). Checked once against the live model on the sample run: 12 sentences kept, 0 dropped.
- [x] The why endpoint (`GET /api/runs/{id}/why/{loan_id}`) answers with cited event sequence numbers and refuses (404) when no events exist for the loan. It is built by code from the run's events and no model writes it, so it cannot add a fact the log does not hold (`tests/deal-why.test.ts`). On the CRO screen it is the "Why this verdict?" button under each loan.
- [x] Wording follows the never-claim list: never "fraudster" or "innocent", never a priority score called a probability (`lib/deal/wording.ts`, `tests/deal-wording.test.ts`). The memo's sentences and any note the why answer repeats go through it; a rank or score next to a probability word is refused only in a sentence about fraud, so "probability of default" in a pricing sentence still stands.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
