# Threadpull

**Find the ring. Protect the innocent. Decide the deal.**

Upload the loan tape. We tell you which borrowers don't exist, which ones only look suspicious, and how much less to pay. Hazel, an investigator agent, follows evidence across auto loans, uses a limited verification budget, and prepares a review for the Chief Risk Officer.

**Seat:** Fraud investigator on a bank's portfolio-acquisition due-diligence team.

Threadpull is a prototype. The TypeScript code includes a deterministic portfolio generator and normalizer, the evidence graph (`lib/graph`), explanation and document checks (`lib/evidence`), the CRS client with persona guard and acorn ledger (`lib/crs`, `lib/ledger.ts`), ask-once rules (`lib/rules`), and Hazel's tool loop (`lib/agent`), plus a loan API route. The earlier Python prototypes in `backend/` are kept for reference only. The full status is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), with product/data contracts in [docs/SKELETON.md](docs/SKELETON.md).

## Setup and data

Install [Bun](https://bun.sh/) and run:

```sh
bun install
cp .env.example .env.local
bun run data --no-db
bun test
```

`bun run data --no-db` creates the seed 13 files under `data/out/seed13/` and the separate answer key under `data/keys/seed13/`. Those generated directories are gitignored. To seed Supabase instead, fill in the server-only values in `.env.local` and run `bun run data`. See [data/README.md](data/README.md) for the loan shape, patterns, and output files.

The repository does not yet have a complete Next.js application or `bun run dev` command. The current HTTP route is `GET /api/loans`; the live investigation, CRO UI, and demo/replay flow remain in progress.

## Claude and CRS

Hazel runs on Claude Sonnet 5.5 (`claude-sonnet-5-5`) through the Anthropic TypeScript SDK's tool runner (`lib/agent/hazel.ts`), with server-side refusal fallback enabled. Claude chooses the next tool and writes short notes. Code does everything else: it opens the lead, validates every tool input, charges the acorn budget, writes each event row, takes threads down only when a check proves an innocent explanation, applies saved rules, and decides every status (`lib/agent/status.ts`). Claude never sees raw document text, only form fields, and injected instructions are flagged as `attack_detected`.

CRS: `crs_identity_check` calls TransUnion identity verification on the CRS sandbox (`lib/crs`). The persona guard builds request bodies only from `data/personas.json`, so a loan without a sandbox persona is refused before anything is sent. Every result keeps the CRS RequestID. Real sandbox responses recorded on 2026-10-24 are in `data/crs-recordings/` and back the tests and `bun run hazel --crs recorded`. Hazel also has the tri-bureau credit report (thick file, thin life features; frozen and disagreeing bureaus mean Insufficient evidence), AtData Fraud Finder and AccurateAppend reverse phone, each charged in acorns and logged with its RequestIDs. Any simulated lookup data is identified as simulated in [data/README.md](data/README.md).

## Real versus simulated

The generator, normalizer, contracts, graph/agent/rule prototypes, and proof helpers are local code. Portfolio contents are synthetic. The address/employer reference lookups generated for the demo are simulated; they are not live external verification. Hazel's loop is tested with a scripted stand-in for Claude; live runs are written to the Supabase `events` table and shown on the board at `/?run=<run_id>`. The held-out seed 99 hasn't been run yet and no evaluator output exists, so the repo makes no measured performance or cost claims. See [docs/PROOF.md](docs/PROOF.md) for current measurement status.

## Known limits

- No `bun run demo` or replay with speed control yet (ticket 15); the board plays a recorded run from Supabase.
- No CRO screen yet (ticket 10): pricing, buyback drafts and Approve/Override are not built. `/dashboard` shows status counts and run metrics only.
- Saved rules and questions live in memory for one run; the Supabase `rules`/`questions` tables are not built (ticket 11).
- Address and employer lookups are simulated stand-ins and are labeled simulated wherever they appear.
- The Python modules in `backend/` predate the TypeScript architecture and are not used by it.
- Issue 13 proof helpers need the held-out set, the final TypeScript detector/baseline, and recorded runs before measured results can be published.
- This is not a credit decision system. It is designed for synthetic data and human review; production use would require approved data access, legal review, and validation.

## Team

| Role | Responsibility |
| --- | --- |
| A — Evidence | Portfolio data, documents, fingerprints, and explanations |
| B — Verification | CRS checks, verification tools, recovery, and deal engine |
| C — Board | Contracts, investigator UI, replay, and held-out set |
| D — Investigation | Evidence graph, Hazel loop, rules, baseline, proof, and submission |

## Development

Run the TypeScript unit and architecture tests with `bun test`.

Run Hazel once on seed 13 and measure her against the answer key with `bun run hazel --crs recorded` (CRS answers replayed from the recordings) or `bun run hazel` (live CRS sandbox). It needs `ANTHROPIC_API_KEY` in `.env.local` (and the CRS logins for a live run), costs real API usage, and writes `runs/<run_id>/` (gitignored). The older Python prototype dependencies are in [requirements.txt](requirements.txt); its unit tests can be run with `python -m unittest discover -s tests` in an environment with those dependencies installed.

Do not commit `.env.local`, API keys, or generated data. Use `.env.example` as the variable-name reference and keep real values server-side.
