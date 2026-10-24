# 14: CRO memo and "why" answers

**Owner:** B (Verification)  
**Target:** H18, Sun 03:00

**What to build:** The CRO can read a one-page memo and ask "why loan X?", getting answers grounded only in the run's events.

**Blocked by:** 10 CRO screen and deal engine

**Status:** ready-for-agent

- [ ] Claude Sonnet 5.5 writes the memo (AI SDK structured output: sentences with event refs) from the report and events; every sentence carries an event reference, and code drops any sentence without one.
- [ ] The why endpoint answers with cited event sequence numbers and refuses when no events exist for the loan.
- [ ] Wording follows the never-claim list: never "fraudster" or "innocent", never a priority score called a probability.

Spec: SKELETON.md (contracts, rules and the 24-hour plan).
