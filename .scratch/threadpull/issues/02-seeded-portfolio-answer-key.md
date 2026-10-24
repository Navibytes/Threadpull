# 02: Seeded portfolio and answer key

**Owner:** A (Evidence)  
**Target:** H3, Sat 12:00

**What to build:** Running the generator with seed 13 produces the 1,000-loan messy portfolio, the case loans built on CRS sandbox personas, the planted patterns from SKELETON §5.3, text documents for case loans, and a separate answer key. The backend loads it, normalizes the mess, and serves clean loans to the filing drawer. The same seed always gives the same output.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] 1,000 loans with every field in SKELETON §5.1; about 30 case loans whose identity fields exactly match the CRS persona request bodies (copy them from the `crs-calhacks` MCP server `get_test_data` / `get_personas`).
- [ ] Mess on purpose: mixed date formats, SSNs with and without dashes, "LAST, FIRST" names, typos, three spellings of one dealer. Normalization recovers clean values, including the exact persona fields.
- [ ] Every planted pattern in §5.3 is present, including the ring of six at one dealer, the apartment twins, the hospital group, the household phone, the month-end burst, P16, P15, P17, the risky-but-real loans and one injected pay stub.
- [ ] The answer key is written separately and detection code has no way to import it.
- [ ] Loan terms follow ABS-EE-like distributions (note the source; reasonable approximations are fine if the ABS-EE download costs more than 30 minutes).
- [ ] Generating twice with the same seed gives byte-identical output.
- [ ] The generator takes a pattern spec as input, so teammate C can later create seed 99 without touching detection code.
- [ ] The backend's loans endpoint returns normalized loans with a current status.

Spec: SKELETON.md (contracts, rules and the 24-hour plan).
