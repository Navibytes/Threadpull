# 12: Detector freeze and held-out set

**Owner:** C (Board)  
**Target:** H17, Sun 02:00

**What to build:** Detection code is frozen with a git tag, and a held-out portfolio (seed 99) exists with pattern placements the detection authors have never seen.

**Blocked by:** 07 Strings come down: explanations and Twin Compare; 08 Document fingerprints and injection guard; 11 Ask once, remember forever

**Status:** ready-for-agent

- [ ] The `detector-frozen` tag is created only after 07, 08 and 11 are merged.
- [ ] C writes the seed 99 pattern spec using only SKELETON §5.1 fields: the same pattern types in new places, plus at least one variation (for example a ring linked by a shared bank account instead of a phone).
- [ ] The held-out answer key is stored where A and D don't read it before the proof run.
- [ ] `bun run data --spec data/patterns/seed99.json` loads seed 99 into Supabase and it runs end to end.

**Notes:** C is the right owner because C writes no detection code.

Spec: SKELETON.md (contracts, rules and the 24-hour plan).
