# Devpost submission draft

## Project name

Threadpull

## Tagline

Find the ring. Protect the innocent. Decide the deal.

## Opening line

Upload the loan tape. We tell you which borrowers don't exist, which ones only look suspicious, and how much less to pay.

## Seat

Fraud investigator on a bank's portfolio-acquisition due-diligence team.

## Try it out

- **Live demo:** https://threadpull.vercel.app
  - Held-out seed 99 run on the board: https://threadpull.vercel.app/board?run=r99-20261025T102031
  - Its CRO screen: https://threadpull.vercel.app/cro?run=r99-20261025T102031
  - Seed 13 proof run: https://threadpull.vercel.app/board?run=r13-20261025T094302
  - Ask once, remember forever (rule R-001 taking threads down): https://threadpull.vercel.app/board?run=r13-20261025T091630
- **Measured results:** https://threadpull.vercel.app/#results (and on each proof run's CRO screen).
- **Pick your own data** (`/upload`): use our 1,000-loan sample, generate a new portfolio from any seed (250 to
  2,000 loans; the same planted cases, your seed decides everything else), or upload a JSON or CSV tape.
- **Upload a tape → Investigate** runs Hazel live on the CRS sandbox and Claude with a 30, 60 or 120-acorn budget; it
  asks for the team's passcode because it spends real API calls. Ask us at the table. An uploaded tape carries no
  building unit counts or employer headcounts, so a lookalike that needs one of those to be cleared may stay up.
- **Code:** https://github.com/Navibytes/Threadpull (README: setup, where CRS and Claude are used, real vs simulated,
  known limits; `docs/PROOF.md`: every measured number).

## Inspiration

Banks buy pools of hundreds or thousands of auto loans from dealers. Before buying, they review only a sample, and
each loan is judged on its own. Coordinated fraud slips through that way: synthetic borrowers who each look fine,
but share phones, bank accounts, devices and recycled pay stubs through one dealer. Meanwhile a naive "shared value =
fraud" rule accuses innocent people who simply live in the same apartment building or work at the same hospital.

## What it does

Hazel, the investigator agent, works a 1,000-loan portfolio like a detective at a corkboard:

- **Follows the threads.** An evidence graph links loans that share a value, weighted by how rare that value is: a
  phone shared by two strangers is strong, an employer shared by forty people is weak, and location alone is never a
  signal.
- **Spends a limited budget.** Paid checks on the CRS sandbox (TransUnion identity, the three-bureau credit report,
  AtData Fraud Finder, reverse phone) cost acorns from a fixed budget. Code charges the budget and refuses what she
  can't afford.
- **Takes suspicion back down.** A thread comes down only when a check proves an ordinary explanation (an apartment
  building, one household, a dealer's usual month-end push), and the board shows the check that proved it.
- **Asks once, remembers forever.** When she can't decide, the right person gets one precise question with a
  code-computed confidence and reason. The CRO's answer becomes a rule that clears the next lookalike by itself, and a
  case outside the rule asks again.
- **Hands over a decision, not a list.** The CRO screen shows the balance under review, dealer concentration, drafted
  buyback demands and a revised bid. A person approves. Hazel can't buy, reject, sign or send anything.
- **Ignores instructions hidden in documents.** A pay stub that tells the reviewer to clear the loan is flagged
  and changes nothing.
- **From a tape to a decision.** Upload a JSON or CSV loan tape; intake validates every row and refuses any SSN that
  could belong to a real person; one click starts the investigation, the board shows its progress live, and the CRO
  screen opens on the result.
- **Spends what's left wisely.** When no lead is left, a verification sweep spends the rest of the budget checking the
  largest unverified balances, shown on the board as spot checks, not suspects.

## Results (generated from recorded runs, `docs/PROOF.md`)

Measured on frozen detection code (`detector-frozen`). Seed 99 is a held-out portfolio written by a teammate who
wrote no detection code; it was run once and is reported as it came out.

| Seed 99 (held out) | Ring members found | Innocents flagged | Acorns |
| --- | --- | --- | --- |
| Threadpull (Hazel) | 12 of 12 | 0 of 65 | 59 |
| Fixed rules (same budget) | 12 of 12 | 8 of 65 | 60 |
| Check everything (no budget) | 3 of 12 | 0 of 65 | 233 |

On the development seed 13, Hazel found 6 of 6 ring members with 0 of 50 innocents flagged; the fixed rules flagged
4 of 50. Run ids, commits and the full tables are in `docs/PROOF.md`. Acorn prices are design choices; each tool
shows its real unit (one CRS call, three bureau pulls, one free lookup).

## How we built it

- **Agent:** Claude Sonnet 5.5 through the Anthropic TypeScript SDK tool runner. Claude picks the next tool and writes
  short, source-cited notes; plain code enforces the budget, the allowed tools, every status and every number.
- **Evidence graph:** graphology, with rarity weights, household fade, same-origin grouping and connected clusters.
- **Verification:** the CRS sandbox API behind a persona guard (only sandbox identities are ever sent), an acorn
  ledger, a response cache, and recovery from rate limits.
- **Board:** Next.js, React, React Flow, Tailwind and Motion. Every animation on the corkboard is a row in the
  Supabase `events` table, replayed in order or streamed live over Realtime.
- **Data:** a seeded generator (Bun, Faker) that builds a messy dealer-application loan tape with planted patterns and
  a separate answer key that only the evaluator reads.
- **Proof:** an evaluator that scores Hazel's recorded run against two baselines on the same portfolio.

## How we use AI

Claude runs the investigation loop: it reads the evidence, chooses the next check and explains its reasoning in two
sentences. It never sets a status, computes a price or touches the budget; code does, and overrules Hazel when the
evidence disagrees with her proposal. Claude Haiku reads pay stubs the fixed parser can't, and code verifies every
value it returns. Document text reaches the model only as form fields, never as instructions.

## Challenges

- Telling a ring from innocent lookalikes without any location-based signal.
- Keeping the agent honest: code decides statuses, and the board shows only recorded events.
- Loans connected to nothing are never leads; a verification sweep spends Hazel's leftover budget on the largest
  unverified balances, and it still reaches only some of the review cases (1 of 3 on both seeds).

## What's next

Production would need a permissible purpose under the FCRA and a legal review. The output is a recommendation for
human review, never an adverse action on a consumer. The prototype uses sandbox personas and synthetic data only.

## Tracks to select

- Hyphenate: Autonomous Systems for Finance
- CRS: Identity/Fraud
- CRS: Financial AI Agent
- CRS: Best Overall
- Microsoft: Built for the Real World
- Anthropic
- Cal Hacks: Most Technically Complex

Confirm the exact track names and eligibility on Devpost before submitting.

## Built with

TypeScript, Bun, Next.js, React, React Flow, Tailwind CSS, Motion, graphology, Zod, Faker, Supabase (Postgres +
Realtime), Anthropic TypeScript SDK (Claude Sonnet 5.5, Claude Haiku), CRS sandbox API (TransUnion identity, credit
report, AtData Fraud Finder, AccurateAppend reverse phone).

## Team members

Add the four project teammates to the Devpost project: Person A (Evidence), Person B (Verification), Person C (Board),
and Person D (Investigation). Replace role labels with each teammate's Devpost account/name.
