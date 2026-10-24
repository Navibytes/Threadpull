# Threadpull

**Find the ring. Protect the innocent. Decide the deal.**

Upload the loan tape. We tell you which borrowers don't exist, which ones only look suspicious, and how much less to pay. Hazel, an investigator agent, follows evidence across auto loans, uses a limited verification budget, and prepares a review for the Chief Risk Officer.

**Seat:** Fraud investigator on a bank's portfolio-acquisition due-diligence team.

Threadpull is a prototype. The repository now includes a deterministic TypeScript portfolio generator, normalized loan contracts, ingestion, and a loan API route. Python investigation prototypes for the evidence graph, Hazel loop, ask-once rules, baseline, and proof metrics are also preserved; the current project architecture is moving those capabilities to TypeScript. The full status is in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md), with product/data contracts in [docs/SKELETON.md](docs/SKELETON.md).

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

The Python Hazel prototype uses the Anthropic SDK adapter for sequential tool selection and short notes. Backend code, rather than Claude, enforces the budget, allowed tools, and saved statuses. The TypeScript application does not yet integrate Claude.

CRS is intended to provide identity and verification checks for sandbox case loans. Persona fixtures are included in `data/personas.json`; a live CRS client and persona-guarded integration are not yet present in the application. No live CRS request is made by the current TypeScript code. Any simulated lookup data is identified as simulated in [data/README.md](data/README.md).

## Real versus simulated

The generator, normalizer, contracts, graph/agent/rule prototypes, and proof helpers are local code. Portfolio contents are synthetic. The address/employer reference lookups generated for the demo are simulated; they are not live external verification. The repo has no recorded Hazel runs or completed seed 99 held-out results, so it makes no measured performance or cost claims. See [docs/PROOF.md](docs/PROOF.md) for current measurement status.

## Known limits

- No complete web UI, integrated live CRS client, TypeScript graph/agent/rule implementation, or demo/replay command is available yet.
- Python investigation modules predate the team's TypeScript/Bun architecture shift and are prototypes, not wired into the TypeScript loan API.
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

Run the TypeScript unit and architecture tests with `bun test`. The older Python prototype dependencies are in [requirements.txt](requirements.txt); its unit tests can be run with `python -m unittest discover -s tests` in an environment with those dependencies installed.

Do not commit `.env.local`, API keys, or generated data. Use `.env.example` as the variable-name reference and keep real values server-side.
