# Recorded runs for the public demo

The public deployment (`PUBLIC_DEMO=1`, `THREADPULL_RUNS=demo/runs`) serves these runs to the CRO screen; the board reads
the same runs from the Supabase `events` table. Every row is what the run wrote; nothing here is edited.

| Run | What it is |
| --- | --- |
| `r13-20261025T094302` | Seed 13 proof run on `detector-frozen f40ff3b` (live CRS), the run behind `docs/PROOF.md`'s seed 13 table |
| `r99-20261025T102031` | Held-out seed 99 proof run by C on the same tag (rows exported from Supabase) |
| `r13-20261025T091630` | Ask once, remember forever: R-001 takes three employer links down citing the rule; the ring's 4-staff shell company stays up |

Synthetic data and CRS sandbox personas only. Scanned for keys before commit.
