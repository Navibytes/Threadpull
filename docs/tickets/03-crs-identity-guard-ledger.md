# 03: Live CRS identity check, persona guard and acorn ledger

**Owner:** B (Verification)
**Target:** H3, Sat 12:00

**What to build:** For a case loan, Hazel's `crs_identity_check` tool makes a live call to the CRS sandbox: loan #37 (P13) comes back with TransUnion codes 2201, 2202 and 2101 (verified live). The call is logged with its RequestID and charges 3 acorns. A background loan is refused without any network call, and a check over budget is refused.

**Blocked by:** None (can start immediately)

**Status:** in progress (B, Sat 2026-10-24). Code and fake-sandbox tests are done on `b/03-crs-identity-guard`. Left: the first live run (`CRS_LIVE=1 bun test tests/crs-client.test.ts`), applying the `crs_cache` migration, and writing the `budget_spent` row from the ledger's `onSpend` hook once C's events module exists.

- [x] Login happens once per process and the token is reused; a failed login raises an error and is never retried in a loop.
- [x] Persona guard: the request body built from a loan must contain every field of a persona body; otherwise the call is refused, logged, and nothing is sent.
- [x] Results use the tool-result shape in SKELETON §7 with `sources` holding the CRS RequestID and `simulated: false`.
- [ ] The acorn ledger refuses calls over budget and every spend produces a `budget_spent` event. (Refusal and the `onSpend(Spend)` hook are done and tested in `lib/ledger.ts`; the events row waits for `lib/events`.)
- [x] The CRS client is server-only TypeScript (`lib/crs/`), called from route handlers / the agent loop; request and response bodies are validated with Zod.
- [ ] Responses are cached by request body (a Supabase `crs_cache` table) so repeated demo runs don't re-hit the sandbox. (Cache and migration `20261024160000_crs_cache.sql` are written and tested against a fake; the migration is not applied to a Supabase project yet.)
- [ ] `bun test` (codes verified live 2026-10-24; passes against a fake sandbox replaying these codes, the real-sandbox run is gated behind `CRS_LIVE=1` and has not been run): P13 → 2201 + 2202 + 2101, P12 → 2201 + 2202 + 2101, P14 → 2301 + 2101, P16 → 2401, P01 and P15 → no messages, background loan refused, over-budget refused.
- [x] Signals are read from `addOnProducts[].idManagerVerification.messages` only; the SSN-issuance block, `riskIndicator` and key messages are the same for every sandbox persona and must not count as evidence.
- [x] If the sandbox is unreachable, a clearly flagged simulated response is used and labeled `simulated` everywhere.

**Notes:** Get sandbox credentials from calhacks.crscreditapi.com or the CRS booth first thing. Keep them only in `.env.local` (server-only, never `NEXT_PUBLIC_`). Build request bodies from `data/personas.json`, matched by the loan's normalized SSN, never from tape fields.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
