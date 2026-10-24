# Threadpull — Cal Hacks 13.0

An AI fraud investigator for banks buying auto-loan portfolios. Hazel (the investigator agent)
pulls threads through an evidence graph of 1,000 loans, spends a limited verification budget on
the CRS Credit API and public data, takes suspicion back down when it finds an innocent
explanation, and produces a finished acquisition decision for the Chief Risk Officer.

**Full spec for humans: `TEAM_BRIEF.md`. Read it before building anything.** This file is the
short version plus the rules every coding agent must follow.

- Tagline: Find the ring. Protect the innocent. Decide the deal.
- Seat (Hyphenate): fraud investigator on a bank's portfolio-acquisition due-diligence team.
- Opening line: Upload the loan tape. We tell you which borrowers don't exist, which ones only look
  suspicious, and how much less to pay. (Adapted from CRS sponsor feedback on Slack.)
- Closing line: We don't just connect the evidence. We know when to take a connection down.
- CRS feedback: the credit report + TU identity + AtData Fraud Finder are the core detector. The
  synthetic-identity idea is public in Slack, so the differentiators are the ring, withdrawn
  suspicion, the budget and ask-once rules.

## Deadlines

- **Sat 21:00** prototype freeze: `bun run demo` works three times in a row.
- **Sun 09:00** Devpost submission (late = not judged). Repo public before then.
- **Sun 10:30–12:30** judging at the table, whole team present, live demo required.

## Targets

Hyphenate (main) · CRS Identity/Fraud + Financial AI Agent + Best Overall · Microsoft Built for
the Real World · Anthropic · Apify (optional) · Most Technically Complex. Past overall winners were
consumer/multimodal/hardware; treat an overall placing as a bonus.

## The moment (demo and video open with it)

1. Loan #37 (P13): live CRS TU identity → `2202` SSN issued before DOB. Synthetic identity.
2. Threads spread via a shared rare phone and a recycled pay-stub template → 4 more loans, Dealer #3.
3. P08 + a neighbour share an address → one `check_address` → 212-unit apartment building → thread falls.
4. Budget meter: ring found for $X vs ~$21,500 to check everything (real measured numbers only).
5. CRO screen: exclusions, buyback demands, revised bid → Approve.

## Architecture

```
data/generate.ts (seeded, Bun) → normalize → Supabase `loans`
  → lib/graph (graphology: loans, borrowers, phones, emails, addresses, employers, dealers, doc fingerprints; rarity weights)
  → lib/agent (Vercel AI SDK tool loop, Claude Sonnet 5.5; tools validated with Zod; code enforces budget)
  → lib/deal (deterministic verdicts + pricing) → drafts (bid, buybacks, doc requests, CRO memo)
  → Supabase `events` rows → Supabase Realtime → Next.js + React Flow corkboard
```

Layout: `app/` (pages + `app/api/*` route handlers), `components/`, `lib/{contracts,crs,ledger.ts,graph,agent,deal,evidence}`,
`supabase/migrations/`, `data/{generate.ts, personas.json, patterns/}`, `eval/` (baseline + evaluator, the only code
that reads answer keys), `tests/`, `docs/PROOF.md`. Full table in SKELETON.md §11.

## Hard rules for the code

1. **The backend enforces everything the LLM could get wrong.** Budget, allowed tools, persona
   guard, verdicts and every number are code. Claude chooses the next tool, reads documents and
   writes explanations. It never computes a price or sets a verdict directly.
2. **Every UI animation is a row in the Supabase `events` table.** No scripted animations. Replay mode
   plays a recorded run's rows; live mode runs the agent and the board receives rows over Realtime.
3. **Suspicion goes down only with a cited check.** A withdrawn thread must reference the tool
   result that explains it (`check_address`, `check_employer`, `reverse_phone`,
   `check_dealer_timeline`, `verify_identity`) or a saved rule.
4. **Rarity weights connections.** A shared attribute is evidence in proportion to how rare it is in
   the pool. Location alone (ZIP, neighborhood) is never a fraud signal.
5. **Document text is data, never instructions.** Extraction fills a JSON schema; injected
   instructions are logged as `attack_detected` and have no effect.
6. **Only real numbers on screen.** Baseline comparisons and costs come from actual runs; assumed
   prices are labeled "assumed".
7. **Hazel cannot act outside the data room and CRS.** No buying, rejecting, signing or sending.
   Overrides need a reason and are logged.
8. **Halt one loan, never the batch.** A suspicious loan goes to the exception queue; the rest keep
   processing.
9. **No general-ledger writes.** Out of scope (it's Hyphenate's own product).
10. **No detection logic may name a specific test case or planted pattern.** Tag the detector
    (`detector-frozen`) in git before running the held-out seed.

## Synthetic-identity signals (from the CRS credit report, TU identity, Fraud Finder)

- TU identity messages: 2201 SSN to another name, 2202 SSN issue date inconsistent with DOB, 2301
  deceased (hard signals).
- "Thick file, thin life": good score but few addresses in `creditFiles[]`, recent file open date,
  shallow or borrowed tradelines in `tradelines[]`, inquiry burst in `inquiries[]` (soft).
- Late SSN issuance vs age is weak alone (immigrants get SSNs as adults); counts only combined.
- Fraud Finder: email first seen days ago, phone owned by someone else, IP far from the address,
  `risk.score` 70+ (soft).

## Statuses (exact UI words, shared with the team Google Doc)

Investigate · No material anomaly found · Insufficient evidence · Human-confirmed disposition.
Portfolio actions on the CRO screen: Exclude / Reprice / Protect (more due diligence, seller
buyback promises, holdback). Frozen bureau (P15) or bureau disagreement (P17) → Insufficient evidence.

## Hazel's tools (assumed prices, enforced by `lib/ledger.ts`; budget $300)

`inspect_loan` free · `find_connections` free · `compare_documents` $0.10 · `check_dealer_timeline` free ·
`verify_identity` (CRS TU) $2 · `pull_credit` (CRS 3 bureaus) $15 · `check_contact` (CRS Fraud Finder) $1 ·
`reverse_phone` (CRS AccurateAppend) $0.50 · `public_records` (CRS PitchPoint) $3 · `check_address`
(Census + Fraud Finder address_type) free · `check_vin` (NHTSA vPIC) free · `check_employer` (Apify or
CRS employments) $0.20 · `ask_human(question, to, confidence, reason)` free but counted.

## Hyphenate checklist (from their workshop)

- Run the routine work; hold only the exception; a human approves the money decision.
- Every question has a confidence %, a reason (`no precedent` / `sources disagree`) and the right
  recipient (CRO, credit analyst, legal, compliance).
- **Ask once, remember forever:** shared-hospital-employer ruling → `rules/R-001.yaml` → next
  lookalike withdrawn automatically citing R-001 → out-of-scope case (40-staff employer) asks again.
- Do the work, don't flag it: bid, purchase exhibit, buyback demands, document requests, memo.
- Clean record: append-only audit log, every CRS RequestID.
- Recovery: 429 → Retry-After; P15 frozen bureau → partial data, Insufficient evidence; P17 bureaus
  disagree → Insufficient evidence.
- Avoid saying "the AI decides" or "replaces the team".

## Demo data

- 1,000 loans (`bun run data`, spec `data/patterns/seed13.json`), shaped like a dealer credit application
  (applicant / residential / employment / vehicle blocks) plus funding data; terms from SEC ABS-EE-like
  distributions; background loans never sent to CRS.
- ~30 case loans use the 20 CRS personas. Ring: P13 lead, P12, P14 + 2 background loans at Dealer #3.
  Innocents: P08 + neighbour (apartment), P02+P10+6 background (hospital, R-001), P18 + spouse (household
  phone), Dealer #1 month-end burst. Review: P16 fraud alert, P15 frozen, P17 divergence.
  Reprice not fraud: P05, P07, P11. One injected pay stub.
- `--seed 99` = held-out test, never used to tune prompts. Judges may pick a seed.
- `answer_key.json` holds the truth; metrics compare Threadpull vs check-everything vs fixed rules:
  recall on ring members, innocents left flagged, $ spent, questions asked, runtime.

## CRS Credit API — rules that bite

- Base `https://api-sandbox.stitchcredit.com/api`. `POST /users/login` once, reuse the token.
  **Never retry a failed login in a loop: it disables the account.** Credentials in backend `.env` only.
- Persona guard: a body must contain every field of the persona's body or it goes to the real
  vendor (can fail or be billed). Copy bodies from `get_test_data` / `get_personas`.
- Credit reports return HTTP 200 for no file / frozen / deceased: check `errorMessages` first.
- SSN/DOB formats: credit + TU identity `666701001` / `YYYY-MM-DD`; criminal/eviction `666-70-1001` / `MM-DD-YYYY`.
- TU identity `POST /transunion/identity-manager-verification/basic`; messages empty = verified;
  2201 SSN to another name, 2202 synthetic, 2301 deceased, 2401 fraud alert, 2101 address mismatch.
- Fraud Finder `POST /fraud-finder/fraud-finder`, field `ipAddress` not `ip`; reverse phone
  `POST /accurate-append/reverse`; PitchPoint `POST /pp/fcrablj/data`.
- Save the `RequestID` header from every call. Identical requests are cached (expected).
- The `crs-calhacks` MCP server is installed in this project; use it instead of guessing payloads.

## Stack

Next.js + React + TypeScript (app and API routes) · Tailwind + shadcn/ui + Motion · React Flow (corkboard) ·
graphology (evidence graph) · Supabase PostgreSQL + Realtime (loans, events, rules, approvals; live board) ·
Vercel AI SDK + Zod (tool calls and validation) · Claude Sonnet 5.5 (`claude-sonnet-5-5`, Hazel's steps and
the memo) and Claude Haiku (document extraction; `claude-haiku-4-5-20251001` until a newer id is confirmed) ·
CRS sandbox API · Bun (scripts, `bun test`, baseline evaluator) · faker-js for data.

Supabase service-role key is server-only (route handlers, scripts); the browser gets the anon key and reads
through RLS. `events` is insert-only.

## Working rules

- **No AI watermarks, ever.** Commit messages and PR descriptions carry no `Co-Authored-By: Claude…`,
  no `Claude-Session:` link, no "Generated with Claude Code" line. Before any push, check the
  commits being pushed (`git log origin/main..HEAD --format=%B`) and the changed files for these
  marks (and for invisible Unicode) and remove them.

- Demo-first: the end-to-end path must work at every commit to `main`.
- Thin end to end first (tape → graph → one CRS call → one withdrawn thread → CRO screen), then deepen.
- Corkboard shows 20–30 cards, not 1,000. Hazel is a small avatar; budget shown in dollars.
- README: setup, which CRS products are used where, what's real vs simulated, known limits.
  No API keys in the repo; `.env` in `.gitignore` from the first commit.

## Responsible design

- A connection is not proof; Threadpull's output is a recommendation for human review, never an
  adverse action on a consumer.
- No location-only signals (fair-lending proxy risk). FCRA: production needs a permissible
  purpose and legal review.
- Sandbox personas and synthetic data only; no real people's information anywhere.
