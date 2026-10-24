# 03: Live CRS identity check, persona guard and acorn ledger

**Owner:** B (Verification)  
**Target:** H3, Sat 12:00

**What to build:** For a case loan, Hazel's `crs_identity_check` tool makes a live call to the CRS sandbox: loan #37 (P13) comes back with TransUnion code 2202. The call is logged with its RequestID and charges 3 acorns. A background loan is refused without any network call, and a check over budget is refused.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] Login happens once per process and the token is reused; a failed login raises an error and is never retried in a loop.
- [ ] Persona guard: the request body built from a loan must contain every field of a persona body; otherwise the call is refused, logged, and nothing is sent.
- [ ] Results use the tool-result shape in SKELETON §7 with `sources` holding the CRS RequestID and `simulated: false`.
- [ ] The acorn ledger refuses calls over budget and every spend produces a `budget_spent` event.
- [ ] The CRS client is server-only TypeScript (`lib/crs/`), called from route handlers / the agent loop; request and response bodies are validated with Zod.
- [ ] Responses are cached by request body (a Supabase `crs_cache` table) so repeated demo runs don't re-hit the sandbox.
- [ ] `bun test`: P13 → 2202, P12 → 2201, P14 → 2301, P16 → 2401, P01 → verified, background loan refused, over-budget refused.
- [ ] If the sandbox is unreachable, a clearly flagged simulated response is used and labeled `simulated` everywhere.

**Notes:** Get sandbox credentials from calhacks.crscreditapi.com or the CRS booth first thing. Keep them only in `.env.local` (server-only, never `NEXT_PUBLIC_`). Build request bodies from `data/personas.json`, matched by the loan's normalized SSN, never from tape fields.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
