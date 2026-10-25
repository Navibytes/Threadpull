# 02: Seeded portfolio and answer key

**Owner:** A (Evidence)
**Target:** H3, Sat 12:00

**What to build:** `bun run data` generates the seed-13 messy portfolio (1,000 loans shaped like dealer credit applications: applicant, residential, employment, vehicle and loan blocks, plus funding data), the case loans built on CRS sandbox personas, the planted patterns from SKELETON §5.3, documents, and a separate answer key. It normalizes the mess and loads clean loans into the Supabase `loans` table for the filing drawer. The same seed always gives the same output.

**Blocked by:** None (can start immediately)

**Status:** done (A, Sat 2026-10-24 ~12:40). Two items wait on C's ticket 01 and are noted below.

- [x] 1,000 loans matching the Zod loan schema (SKELETON §5.1); 20 case loans (one per persona) whose identity fields exactly match the CRS persona request bodies (copy them from the `crs-calhacks` MCP server `get_test_data` / `get_personas`).
- [x] Mess on purpose: mixed date formats, SSNs with and without dashes, "LAST, FIRST" names, typos, three spellings of one dealer. Normalization recovers clean values, including the exact persona fields.
- [x] Every planted pattern in §5.3 is present, including the ring of six at one dealer, the apartment twins, the hospital group, the household phone, the month-end burst, P16, P15, P17, the risky-but-real loans and one injected pay stub.
- [x] The answer key is written separately and detection code has no way to import it.
- [x] Loan terms follow ABS-EE-like distributions (note the source; reasonable approximations are fine if the ABS-EE download costs more than 30 minutes).
- [x] Generating twice with the same seed gives byte-identical output.
- [x] The generator takes a pattern spec as input, so teammate C can later create seed 99 without touching detection code.
- [x] A Supabase migration for `loans`; the seed script upserts normalized loans; `GET /api/loans` returns them with a current status.
  - Waiting on 01: the migration and upsert are untested until C creates the Supabase project; the route runs once Next.js is added. Until then `/api/loans` falls back to `data/out/seed13/loans.normalized.json`.
- [x] `bun test` covers determinism, exact persona fields, every planted pattern and answer-key isolation (no file under `lib/` or `app/` reads `data/keys`).

**Delivered:** `data/generate.ts`, `data/seed-db.ts`, `data/personas.json`, `data/patterns/seed13.json`, `lib/contracts/loan.ts`, `lib/ingest/normalize.ts`, `app/api/loans/route.ts`, `supabase/migrations/20261024120000_loans.sql`, `tests/portfolio.test.ts`. Details in `data/README.md`.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
