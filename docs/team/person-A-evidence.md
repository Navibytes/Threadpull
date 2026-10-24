# Person A: Evidence

**Good fit:** ML / computer vision

**Your stack:** TypeScript + Bun (generator, seed script, `bun test`), faker-js, Zod (loan schema, pay-stub extraction schema), Supabase (`loans` table), Claude Haiku via the Vercel AI SDK (document extraction), Motion (falling string, with C).

**Your tickets, in order:**

| Ticket | Title | Target | Blocked by |
| --- | --- | --- | --- |
| 02 | Seeded portfolio and answer key | Sat 12:00 | None |
| 07 | Strings come down: explanations and Twin Compare | Sat 18:00 | 05, 06 |
| 08 | Document fingerprints and injection guard | Sat 21:00 | 02, 05 |

**Who waits on you:** D needs ticket 02 by noon to build the graph (04). C needs the generator's pattern-spec input for the held-out set (12).

**First 30 minutes:**

1. Done: persona bodies pulled into `data/personas.json`; seed-13 pattern spec written; a Python generator proved the patterns (branch `a/portfolio`).
1. Port the generator to TypeScript/Bun on the dealer-application record shape (SKELETON §5.1) and agree the Zod loan schema with C.
1. Write the `loans` migration and the seed script so D can query Supabase (or the JSON file) by noon.

**While you're blocked:** Between 12:00 and 15:00, while waiting for 05 and 06: prototype the pay-stub fingerprint, the Haiku extraction schema and the explanation checks (address type, household, employer size) in `lib/evidence/` against the generated data, so 07 and 08 go fast once Hazel exists. Pair with C on the falling-string animation.

**Team checkpoints:** Sat 12:00 contracts frozen · Sat 21:00 one full rough run · Sun 04:00 feature freeze · Sun 08:00 submit (hard deadline 08:50).

Tickets live in `../tickets/`; the full spec is `../SKELETON.md`; the folder map is `../ARCHITECTURE.md`.
