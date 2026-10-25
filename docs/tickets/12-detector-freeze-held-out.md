# 12: Detector freeze and held-out set

**Owner:** C (Board)  
**Target:** H17, Sun 02:00

**What to build:** Detection code is frozen with a git tag, and a held-out portfolio (seed 99) exists with pattern placements the detection authors have never seen.

**Blocked by:** 07 Strings come down: explanations and Twin Compare; 08 Document fingerprints and injection guard; 11 Ask once, remember forever

**Status:** tooling done (A, Sat 2026-10-24 ~23:00); the spec itself is C's, and the tag waits for 08 and 11.
A built everything except the held-out placements, which stay C's so no detection author sees them:
`data/spec.ts` (the generator refuses an invalid spec), `bun run data:check` (validate, generate, verify end to end,
prints nothing that reveals the set), `bun run freeze:check`, `bun run hazel` refusing a held-out seed on unfrozen
code, `data/patterns/heldout/` gitignored, and the guide `data/patterns/HELDOUT.md`. The generator now gives each
repeated pattern its own answer-key entry (two buildings or two households used to overwrite each other); seed 13's
output is byte-for-byte unchanged.

**Update (Sat 23:35, checked against `main`):** C writes the spec next, following `data/patterns/HELDOUT.md`. Not done: C's spec, the `detector-frozen` tag (after 08's Haiku decision and D's 11; PR #35's prompt change already landed before it, as detection changes must), then loading and running seed 99.

- [x] The `detector-frozen` tag is created only after 07, 08 and 11 are merged. (Tagged on `ea57806`, Sun 02:22, after #45 and #46; moved to `f40ff3b` at 02:45 for the verification sweep (#48), before anyone ran seed 99; `bun run freeze:check` ✓.)
- [x] C writes the seed 99 pattern spec using only SKELETON §5.1 fields: the same pattern types in new places, plus at least one variation (for example a ring linked by a shared bank account instead of a phone). (Done by C: two rings, two of most lookalike patterns; committed as `data/patterns/seed99.json` after the proof run, #50.)
- [x] The held-out answer key is stored where A and D don't read it before the proof run. (Tooling: `--keys` outside the repo, spec in the ignored `data/patterns/heldout/`, `data:check` output reveals nothing.)
- [x] `bun run data --spec data/patterns/seed99.json` loads seed 99 into Supabase and it runs end to end. (Verified on seed 13 and a varied practice spec with `data:check`; the board's drawer and Twin Compare follow the run's seed. Seed 99 itself after C writes it.) (Loaded and run once by C: `r99-20261025T102031`.)

**Notes:** C is the right owner because C writes no detection code.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
