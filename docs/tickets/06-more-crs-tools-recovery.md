# 06: More CRS tools and recovery cases

**Owner:** B (Verification)  
**Target:** H6, Sat 15:00

**What to build:** Hazel can pull the 3-bureau credit report, the Fraud Finder check and a reverse phone lookup, each with its acorn cost. When CRS misbehaves, the board shows a visible recovery instead of a crash.

**Blocked by:** 03 Live CRS identity check, persona guard and acorn ledger

**Status:** done (B, Sun 2026-10-25). The tools and their real-response tests merged in #16. The 429 recovery row merged in #32 (A). The deceased halt and the result-schema check are the last two items, each with its own test. The CRS cache migration and the Supabase `events` writing belong to tickets 03 and 05.

**Update (Sat 23:05, checked against `main`):** All four CRS tools are wired into Hazel (D, PR #29): credit report, Fraud Finder and reverse phone are charged, logged with RequestIDs, and a throw becomes a logged, uncharged refusal; P15 (frozen) and P17 (bureaus disagree) come out Insufficient evidence; a deceased file is a hard signal. A 429 now becomes a `recovery` row for the rate-limited call's loan (A, PR #32). The deceased halt (no further CRS calls for that loan) is done too (B).

- [x] `crs_credit_report` merges the three bureaus and computes the "thick file, thin life" features in code: file age vs borrower age, number of addresses, tradeline depth, share of authorized-user tradelines, inquiries in 60 days. (The sandbox's credit reports carry no address history, so the address count is null, not 0.)
- [x] `crs_fraud_finder` returns email age, phone owner, IP distance, address type and risk score. (The address type is "Street" for every sandbox persona, so it cannot show a multi-unit building.)
- [x] `crs_reverse_phone` returns the registered name and address.
- [x] Recovery: a 429 waits for `Retry-After` and emits a `recovery` event (Hazel writes the row for the rate-limited call's loan, PR #32: `tests/hazel.test.ts`); P15 returns partial data (two bureaus) and leads to `Insufficient evidence`; P17's bureau disagreement is flagged; a deceased result (TransUnion 2301, or a credit file the bureaus report as deceased) stops further CRS calls for that loan and only that loan (`tests/crs-halt.test.ts`; the reverse phone lookup takes a phone, not a loan, so the halt does not cover it).
- [x] Costs match SKELETON §7 and are charged through the ledger (`lib/ledger.ts`); each tool's result validates against its Zod schema (`tests/crs-result-schema.test.ts`: the shared envelope and each tool's own payload, on the real recorded responses and on refusals).
- [x] `bun test` against persona expectations: P13 thin file, P15 partial, P17 divergence, P12 no file at all three bureaus.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
