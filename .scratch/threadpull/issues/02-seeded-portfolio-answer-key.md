# 02: Seeded portfolio and answer key

**Owner:** A (Evidence)  
**Target:** H3, Sat 12:00

**What to build:** `bun run data` generates the seed-13 messy portfolio (1,000 loans shaped like dealer credit applications: applicant, residential, employment, vehicle and loan blocks, plus funding data), the case loans built on CRS sandbox personas, the planted patterns from SKELETON §5.3, documents, and a separate answer key. It normalizes the mess and loads clean loans into the Supabase `loans` table for the filing drawer. The same seed always gives the same output.

**Blocked by:** None (can start immediately)

**Status:** in progress (A). A Python version was built first and is being ported to TypeScript/Bun after the stack change.

- [ ] 1,000 loans matching the Zod loan schema (SKELETON §5.1); 20 case loans (one per persona) whose identity fields exactly match the CRS persona request bodies (copy them from the `crs-calhacks` MCP server `get_test_data` / `get_personas`).
- [ ] Mess on purpose: mixed date formats, SSNs with and without dashes, "LAST, FIRST" names, typos, three spellings of one dealer. Normalization recovers clean values, including the exact persona fields.
- [ ] Every planted pattern in §5.3 is present, including the ring of six at one dealer, the apartment twins, the hospital group, the household phone, the month-end burst, P16, P15, P17, the risky-but-real loans and one injected pay stub.
- [ ] The answer key is written separately and detection code has no way to import it.
- [ ] Loan terms follow ABS-EE-like distributions (note the source; reasonable approximations are fine if the ABS-EE download costs more than 30 minutes).
- [ ] Generating twice with the same seed gives byte-identical output.
- [ ] The generator takes a pattern spec as input, so teammate C can later create seed 99 without touching detection code.
- [ ] A Supabase migration for `loans`; the seed script upserts normalized loans; `GET /api/loans` returns them with a current status.
- [ ] `bun test` covers determinism, exact persona fields, every planted pattern and answer-key isolation (no file under `lib/` or `app/` reads `data/keys`).

Spec: SKELETON.md (contracts, rules and the 24-hour plan).
