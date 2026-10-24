# 06: More CRS tools and recovery cases

**Owner:** B (Verification)  
**Target:** H6, Sat 15:00

**What to build:** Hazel can pull the 3-bureau credit report, the Fraud Finder check and a reverse phone lookup, each with its acorn cost. When CRS misbehaves, the board shows a visible recovery instead of a crash.

**Blocked by:** 03 Live CRS identity check, persona guard and acorn ledger

**Status:** ready-for-agent

- [ ] `crs_credit_report` merges the three bureaus and computes the "thick file, thin life" features in code: file age vs borrower age, number of addresses, tradeline depth, share of authorized-user tradelines, inquiries in 60 days.
- [ ] `crs_fraud_finder` returns email age, phone owner, IP distance, address type and risk score.
- [ ] `crs_reverse_phone` returns the registered name and address.
- [ ] Recovery: a 429 waits for `Retry-After` and emits a `recovery` event; P15 returns partial data (two bureaus) and leads to `Insufficient evidence`; P17's bureau disagreement is flagged; a deceased result stops further CRS calls for that loan.
- [ ] Costs match SKELETON §7 and are charged through the ledger (`lib/ledger.ts`); each tool's result validates against its Zod schema.
- [ ] `bun test` against persona expectations: P13 thin file, P15 partial, P17 divergence, P12 no file at all three bureaus.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
