# Threadpull

**Find the ring. Protect the innocent. Decide the deal.**

Upload the loan tape. We tell you which borrowers don't exist, which ones only look suspicious, and how much less to pay.
Hazel, an investigator agent, pulls threads through an evidence graph of 1,000 auto loans, spends a limited
budget on CRS identity and fraud checks, takes suspicion back down when a normal explanation holds, and hands the
Chief Risk Officer a decision to approve. Cal Hacks 13.0.

## Run it

```bash
bun install
cp .env.example .env.local   # fill in CRS, Anthropic and Supabase keys
bun run data                 # generate seed 13 (and load Supabase if configured)
bun test
```

## Where things are

| Read | For |
| --- | --- |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | folder map, owners, import rules, where new code goes |
| [`docs/SKELETON.md`](docs/SKELETON.md) | contracts (loan, tools, events, API) and the 24-hour plan |
| [`docs/TEAM_BRIEF.md`](docs/TEAM_BRIEF.md) | the problem, the demo, data sources, metrics |
| [`docs/tickets/`](docs/tickets) · [`docs/team/`](docs/team) | one file per ticket · one plan per person |
| [`data/README.md`](data/README.md) | the generated portfolio and what is planted |
| [`CLAUDE.md`](CLAUDE.md) | rules for coding agents |

Sandbox personas and synthetic data only; no real people's information. Output is a recommendation for human review, never an adverse action on a consumer.
