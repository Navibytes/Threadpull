# Threadpull — Build Skeleton

**Find the ring. Protect the innocent. Decide the deal.**

This file is the single source of truth for building. It merges the team's Project Brief (Google Doc, Oct 24) with Yehor's proposed edits, and adds the contracts every teammate codes against. If something here conflicts with an older doc, this file wins. Change a contract only after telling the whole team.

- Repo: https://github.com/Navibytes/Threadpull (private until submission; keep secrets out from the first commit anyway, because it goes public on Sunday)
- Event: Cal Hacks 13.0. Devpost deadline **Sun Oct 25, 08:50 PT**; we submit by **08:00**. Judging Sun 10:30–12:30, whole team at the table.
- Tickets: `docs/tickets/` (one file per ticket) and one plan per person in `docs/team/`. Folder map and import rules: `docs/ARCHITECTURE.md`.

---

## 1. What we are building

**Opening line (pitch):** Upload the loan tape. We tell you which borrowers don't exist, which ones only look suspicious, and how much less to pay.

**Seat (Hyphenate):** Threadpull fills the fraud investigator seat on a bank's portfolio-acquisition due-diligence team.

**Closing line:** Identity checks verify people one at a time. Threadpull investigates the connections between them, withdraws suspicion when the evidence says so, and hands the risk officer a recommendation they can check line by line.

A bank is about to buy 1,000 auto loans from a smaller dealer. Hazel, our investigator agent (a small squirrel avatar, never the headline), starts from the strangest loan, pulls the thread, and pins every connection on a corkboard. She has a limited pouch of acorns, so she chooses which checks are worth paying for. She takes a string down when a normal explanation holds. Threadpull then drafts the deal outputs; the CRO approves.

**Three jobs, in order:**
1. **Find the ring.** Link loans that share phones, emails, bank accounts, devices, addresses, employers, dealers, brokers, document templates. Hazel picks each next check herself, inside a fixed budget, and every lead shows its reason.
2. **Protect the innocent.** Look for normal explanations (household, big employer, apartment building, broker form) and take the string down when one holds, citing the check that proves it. Never say "innocent"; say "no longer a reason to suspect."
3. **Decide the deal.** Total principal and proposed price, balance under review, concentration by dealer and ring, investigation spend vs checking everything, and three actions: **Exclude**, **Reprice**, **Protect**. Threadpull drafts the buyback demand and document requests. A human makes the final call.

**Targets:** Hyphenate (main), CRS (Identity/Fraud, Financial AI Agent, Best Overall), Microsoft Built for the Real World, Anthropic. An overall placing is a bonus: past overall winners were consumer, multimodal or hardware.

**Never claim:** that a person is proven innocent or a fraudster; that a priority score is a fraud probability; that CRS or a competitor can't do something we haven't verified; that a simulated CRS response is live; the unsourced "$50,000 per case".

**Out of scope:** writing into a general ledger; uploading arbitrary portfolios through a UI (we load from a seed); real people's data.

---

## 2. The demo (3 minutes, opens with the moment)

| Time | On screen | Proves |
| --- | --- | --- |
| 0:00–0:20 | Lead loan #37 gets a **live** CRS identity check: TU **2201** (SSN not associated with this name), **2202** (date of birth doesn't match the file), **2101** (address doesn't match). A real SSN under a made-up identity. One-line hook: a bank is about to buy 1,000 loans. | CRS is live and central |
| 0:20–1:20 | Hazel picks checks, spends acorns, hits one dead end; the ring of six appears on the corkboard (shared phone, recycled pay-stub template, one dealer). | Budget-aware investigation |
| 1:20–1:50 | **Twin Compare**: two lookalike borrowers split at one piece of evidence; Hazel takes one string down, citing the check. | Visible restraint |
| 1:50–2:30 | CRO screen: balance under review, dealer concentration, drafted buyback demand; an ask-once question was answered earlier and the rule R-001 cleared a second lookalike by itself. Approve an exclusion. | A decision, not a list; ask once |
| 2:30–3:00 | Proof: held-out seed results vs the fixed-rule baseline at the same budget; simulated calls clearly labeled. | It works, measured |

Two run modes: **replay** (a recorded run, safe at the judging table) and **live** (a judge picks a seed).

---

## 3. Words, statuses and actions

| Term | Meaning |
| --- | --- |
| Portfolio | The box of loans the bank wants to buy (ours: 1,000 synthetic loans) |
| Case loan | A loan whose borrower is one of the 20 CRS sandbox personas, so CRS can verify it |
| Background loan | A synthetic loan (faker-js, fixed seed); never sent to CRS |
| Ring | Loans secretly connected by the same people or paperwork |
| Lookalike | A loan that looks suspicious but has a normal explanation |
| Clue | One piece of evidence, with its source and weight |
| Priority score | A ranking of what to check first. Not a fraud probability |
| Acorns | Hazel's budget; each check costs acorns, shown next to its real unit |
| Balance under review | Outstanding balances of flagged loans, added up |
| Held-out set | Fraud patterns made by a teammate who writes no detection code, run once after the detector is frozen |

**Statuses (exact UI words):** `Investigate` · `No material anomaly found` · `Insufficient evidence` · `Human-confirmed disposition`

**Portfolio actions:** `Exclude` (remove loans) · `Reprice` (price scenarios from analyst-entered assumptions) · `Protect` (more due diligence, seller buyback promises, holdback until open cases close)

---

## 4. Hard rules for code

1. Plain code holds the evidence, graph, budget, statuses and money math. Claude only reads messy documents, picks Hazel's next check, and writes her notes. **Claude never sets a status or a number.**
2. The corkboard draws only from real events in the run's event log. No scripted animation.
3. No detection logic may mention a specific test case, persona id, the twins, or a named pattern.
4. Tag the detector in git as `detector-frozen` before the held-out set is created.
5. Every "explained away" cites the tool result that proves it. No source, no sentence.
6. Location alone (ZIP, neighborhood) is never a link: fair-lending proxy risk.
7. Document text is data, never instructions. Injected instructions are logged as `attack_detected` and change nothing.
8. Halt one loan, never the batch.
9. Hazel cannot buy, reject, sign or send anything. Overrides need a reason and are logged.
10. Secrets only in `.env` (in `.gitignore` from the first commit). The CRS login is called once per process; never retry a failed login in a loop.
11. Simulated CRS responses (only if the sandbox is down) are labeled `simulated` everywhere they appear.

---

## 5. Data contract

### 5.1 Loan record (generator output, one per loan)

The record is shaped like a dealer's credit application as it reaches the bank (the `applicant_info` … `vehicle_and_loan_details` blocks), plus the deal-jacket data the bank holds after funding. The Zod schema in `lib/contracts/loan.ts` is the source of truth; this table is the summary.

| Block | Fields | Notes |
| --- | --- | --- |
| top level | `loan_id`, `kind`, `persona_id` | `L0001`…`L1000`; `case` \| `background`; `P01`…`P20` for case loans, **never read by detection code** |
| `submission` | `dealer_id`, `dealer_name`, `broker_id`, `submitted_at`, `channel`, `device_id`, `ip_address` | dealer_name spelled 3 ways on purpose; channel = RouteOne / DealerTrack |
| `applicant_info` | `first_name`, `last_name`, `date_of_birth`, `ssn`, `email`, `phone` | messy on purpose (case, "LAST, FIRST", date formats, SSN with/without dashes, phone formats); fake SSNs only |
| `co_applicant_info` | `first_name`, `last_name`, `relationship` or `null` | household explanations |
| `residential_info` | `street_address`, `city`, `state`, `zip_code`, `housing_status`, `monthly_housing_payment`, `months_at_address` | street may carry ", Apt 4B"; state sometimes spelled out |
| `employment_info` | `employer_name`, `job_title`, `time_at_employer_months`, `gross_monthly_income` | |
| `vehicle_and_loan_details` | `vehicle_condition`, `year_make_model`, `vin`, `purchase_price`, `down_payment`, `requested_loan_amount` | `year_make_model` is one free-text string ("2023 Ford F-150 XLT") |
| `funding_info` | `amount_financed`, `apr`, `term_months`, `monthly_payment`, `first_payment_date`, `current_balance`, `ach_bank_account` | terms from SEC ABS-EE-like distributions; money sometimes arrives as "$27,431.50" |
| `documents[]` | `doc_id`, `type` (`pay_stub` \| `application`), `template_id`, `font`, `creating_tool`, `text` | pay-stub fingerprints live here |

Normalization adds `address_key` (street without unit + ZIP, so a shared apartment building links), a canonical `dealer_name` (raw spelling kept), parsed `vehicle_year` / `make` / `model`, and `status` (`Not reviewed` until Hazel touches the loan).

### 5.2 Answer key (never read by the agent or detectors)

`{seed, rings: [{ring_id, loan_ids, pattern}], lookalikes: [{loan_ids, explanation, proving_check}], injected_docs: [doc_id], review_cases: [...]}`

### 5.3 Planted cases (seed 13)

| Pattern | Loans | Truth |
| --- | --- | --- |
| Ring of six at one dealer: synthetic identity + shared phone + recycled pay-stub template | P13 (lead), P12, P14 + 3 background loans | Investigate → Exclude, buyback |
| Twin Compare: two lookalikes split at one piece of evidence | P08 + a background neighbour share a 212-unit apartment building (persona addresses are fixed by the sandbox, so P01 + P19 could not share one) | String down |
| Large employer | P02 + P10 + background loans at a hospital | String down, becomes R-001 |
| Household phone | P18 + co-applicant spouse | Link fades |
| Month-end dealer burst | ~40 background loans | Explained by dealer timeline |
| Fraud alert on file | P16 | Ask the CRO |
| Frozen bureau / bureaus disagree | P15 / P17 | Insufficient evidence |
| Risky but real | P05, P07, P11 | Reprice, never fraud |
| Prompt injection in a pay stub | 1 case loan | `attack_detected` |

Seed 99 (held-out) is generated after `detector-frozen` by a teammate who writes no detection code, using only the fields above.

---

## 6. Graph and weights

- Node types: loan, person, phone, email, bank_account, device, address, employer, dealer, broker, doc_template.
- Edge: `{edge_id, kind, a, b, weight, sources: [source_ref], explained: bool, explanation_ref}`.
- **Personal things** (phone, email, bank account, device): shared across strangers = strong link.
- **Household check:** same phone + same address + same last name (or listed co-applicant) → link fades.
- **Shared-by-nature things** (employer, apartment building, dealer): `weight = 1 / n`, n = loans sharing the value. A 40-borrower hospital gives 1/40; a 3-borrower "company" gives 1/3.
- **Origin grouping:** clues with the same origin (document, submission, broker) count once.
- **Explained away:** mark `explained`, keep the reason and its proving source, weight → 0. Never delete.
- Yarn thickness in px = `1 + 8 × weight`. All weights are design choices shown in the UI, not fraud statistics.

---

## 7. Hazel's tools

Acorn costs are design choices; the real unit is shown beside each. Default budget: **60 acorns** per run (config). The fixed-rule baseline gets the same tools and budget.

| Tool | Acorns | Real unit | Source | Returns |
| --- | --- | --- | --- | --- |
| `inspect_loan(loan_id)` | 0 | 1 loan record | data room | fields + documents |
| `find_connections(entity_id)` | 0 | 1 graph query | graph | neighbors with weights and sources |
| `compare_documents(doc_a, doc_b)` | 1 | 1 document pair | analyzer | template match, number consistency |
| `dealer_timeline(dealer_id)` | 1 | 1 dealer query | data room | bursts vs the dealer's own history |
| `inspect_dealer_loans(dealer_id)` | 5 | every loan from 1 dealer | data room | summary of that dealer's loans |
| `crs_identity_check(loan_id)` | 3 | 1 CRS call | CRS TU identity | messages: 2201 / 2202 / 2301 / 2401 / 2101 |
| `crs_credit_report(loan_id)` | 6 | 3 CRS calls | CRS credit report ×3 | file age, addresses, tradelines, inquiries, employments ("thick file, thin life") |
| `crs_fraud_finder(loan_id)` | 2 | 1 CRS call | CRS AtData | email age, phone owner, IP distance, address type, risk score |
| `crs_reverse_phone(phone)` | 1 | 1 CRS call | CRS AccurateAppend | registered name and address |
| `check_address(address)` | 0 | 1 free lookup | Census geocoder | single home vs multi-unit |
| `check_household(loan_a, loan_b)` | 0 | 1 loan-pair comparison | data room | same phone + address + last name, or listed co-applicant |
| `check_employer(employer)` | 0 | 1 employer lookup | reference lookup + pool | headcount and how many loans in the pool name it |
| `check_vin(vin)` | 0 | 1 free lookup | NHTSA vPIC | year/make/model match |
| `ask_human(question, to, confidence, reason)` | 0 | 1 question | CRO console | counted, routed to CRO / credit analyst / legal / compliance |
| `close_lead(case_id, status, note)` | 0 | 1 note | — | sets a status (code validates it) |

Every tool returns `{ok, result, sources: [source_ref], cost: {acorns, unit}, simulated: bool, error?}`. Names, costs and the Zod schema live in `lib/contracts/tool-result.ts` (`TOOL_SPECS`, `ToolResultSchema`); a test keeps this table and that file in sync. A refused or failed call returns `ok: false` with an `error` and costs 0 acorns. The backend refuses calls over budget, unknown tools, and CRS calls for background loans.

**Synthetic-identity signals:** TU 2201 (SSN not associated with name) / 2202 (DOB doesn't match file) / 2301 (deceased) are hard. Verified live on 2026-10-24: P13 and P12 → 2201 + 2202 + 2101; P14 → 2301 + 2101; P16 → 2401; P01, P15 → no messages. The sandbox returns the same SSN-issuance block ("ISSUED_AFTER_21", 2001, KY), `riskIndicator` MEDIUM and KMSG07 for every persona, including clean ones: never use them as signals. TU alone gives P13 and P12 the same codes; Fraud Finder and the credit report tell them apart. Other signals: "thick file, thin life" (good score but few addresses, recent file, shallow or borrowed tradelines, inquiry burst) and Fraud Finder contact signals are soft; late SSN issuance is weak alone (immigrants get SSNs as adults).

---

## 8. Event contract (the corkboard's only input)

One row per event in the Supabase `events` table (insert-only). The board subscribes with **Supabase Realtime**; replay mode reads the same rows of a recorded run in `seq` order. The Zod schema in `lib/contracts/event.ts` is the source of truth.

```json
{"run_id": "r13-001", "seq": 42, "ts": "2026-10-24T15:04:05Z",
 "type": "link_found",
 "loan_ids": ["L0037", "L0412"], "tool": "find_connections",
 "result": {"edge_id": "e-phone-5550101013", "kind": "phone", "weight": 0.33},
 "sources": [{"kind": "crs", "request_id": "…"}, {"kind": "row", "loan_id": "L0412", "field": "applicant_info.phone"}],
 "note": "Same phone as the lead, and nobody else in the pool shares it.",
 "budget": {"spent": 11, "limit": 60}, "simulated": false}
```

Types: `run_started`, `lead_opened`, `check_run`, `link_found`, `clue_explained`, `lead_dropped`, `status_changed`, `budget_spent`, `question_asked`, `question_answered`, `rule_applied`, `attack_detected`, `recovery`, `disposition_recorded`, `run_finished`.

---

## 9. Rules memory (ask once, remember forever)

Stored as a row in the Supabase `rules` table (validated by a Zod schema):

```json
{"id": "R-001", "created_from": "question q-003, answered by CRO at 2026-10-24T22:42Z",
 "when": {"link_kind": "employer", "min_group_size": 500, "tenure_on_credit_file": true},
 "then": "explain_link",
 "reason_text": "Large employer; tenure confirmed on the credit file.",
 "version": 1}
```

Hazel applies a rule only when every `when` condition holds and cites it in `rule_applied`. Outside the scope, she asks again.

---

## 10. API (Next.js route handlers, `app/api/…`)

| Method | Path | Purpose |
| --- | --- | --- |
| POST | `/api/runs` | start a run `{seed, budget, mode: live \| replay, agent: hazel \| baseline}` |
| GET | `/api/loans` | filing drawer: loans with current status (reads Supabase `loans`) |
| GET | `/api/runs/{id}/report` | CRO screen data: balances, concentration, actions, drafts, proof |
| POST | `/api/questions/{id}/answer` | CRO answers; creates or updates a rule |
| POST | `/api/dispositions` | approve / override (override needs a reason) |
| GET | `/api/runs/{id}/why/{loan_id}` | memo answer grounded in events only |

Live events don't need an endpoint: the board subscribes to `events` rows for the run through Supabase Realtime.

---

## 11. Architecture, stack and repo layout

```
data/generate.ts (seeded, Bun) → data/seed-db.ts → Supabase `loans` (normalized)
   → lib/graph (graphology: entities, weights, connected clusters)
   → Hazel loop (Vercel AI SDK + Claude Sonnet 5.5; tools defined with Zod; code enforces budget, rules, statuses)
   → tool results feed back into the graph; Claude Haiku extracts pay-stub fields into a Zod schema
   → every step inserts a row into `events` → Supabase Realtime → corkboard + notebook
   → deal engine (plain TypeScript) → CRO screen → approvals logged
```

| Layer | Technology | Purpose |
| --- | --- | --- |
| Web application | Next.js, React, TypeScript | Corkboard, CRO review, API routes |
| Styling | Tailwind, shadcn/ui, Motion | Hazel's warm detective-office interface |
| Interactive graph | React Flow | Evidence cards, connecting threads, animations |
| Graph intelligence | graphology | Entity relationships and connected clusters |
| Database | Supabase PostgreSQL | Loans, evidence, investigations, approvals |
| Live synchronization | Supabase Realtime | Push investigation updates to the board |
| AI | Claude Sonnet 5.5, Claude Haiku | Investigation planning (Sonnet) and document extraction (Haiku) |
| Agent orchestration | Vercel AI SDK, Zod | Structured tool calls and validation |
| Identity verification | CRS sandbox API | Actual external identity / fraud signals |
| Evaluation | Bun tests and a baseline evaluator | Measure detection, accuracy and costs |

Model ids: `claude-sonnet-5-5` for Hazel's steps and the CRO memo. Haiku: the newest released id we can confirm is `claude-haiku-4-5-20251001`; swap it in one place (`lib/agent/models.ts`) if a newer Haiku is available.

Folder layout, ownership and import rules: **`docs/ARCHITECTURE.md`** (the single place that defines where code goes).

Commands: `bun install` · `bun run dev` · `bun test` · `bun run data` (generate + seed Supabase) · `bun run demo`.

---

## 12. CRS sandbox: rules that bite

- Base `https://api-sandbox.stitchcredit.com/api`; login once, reuse the token; repeated failed logins disable the account.
- A request matches a persona only if its body contains every field of the persona's body; copy bodies from the `crs-calhacks` MCP server (`get_personas`, `get_test_data`).
- Credit reports return HTTP 200 for no file / frozen / deceased: read `errorMessages` first.
- SSN/DOB formats: credit + TU identity `666701001` / `YYYY-MM-DD`; criminal/eviction `666-70-1001` / `MM-DD-YYYY`.
- Fraud Finder field is `ipAddress`, not `ip`. Save every `RequestID`. Identical requests are cached.
- Recovery: 429 → wait for `Retry-After`; P15 frozen bureau → partial data, `Insufficient evidence`; P17 bureaus disagree → `Insufficient evidence`.

---

## 13. 24-hour plan

H0 = Sat 09:00 PT. Submission target H23 (Sun 08:00); hard deadline Sun 08:50.

| Hours | Clock | Milestone | Done when |
| --- | --- | --- | --- |
| H0–H3 | 09:00–12:00 | Contracts frozen (Zod); Next.js + Supabase skeleton; generator; first live CRS call | An events row appears on the board via Realtime; seed 13 in Supabase; P13 returns 2201 + 2202 + 2101 live (verified) |
| H3–H6 | 12:00–15:00 | Graph and weights; more CRS tools | Lead's neighbors with weights; credit report and Fraud Finder tools work |
| H6–H12 | 15:00–21:00 | Hazel loop, tools, budget, events, statuses; board live; strings come down | **H12 checkpoint (21:00): one full rough run: generator → graph → live CRS → one withdrawn thread → CRO screen** |
| H12–H16 | 21:00–01:00 | CRO screen and deal engine; ask-once; document fingerprints; injection guard | Approve an exclusion; R-001 clears a lookalike |
| H16–H19 | 01:00–04:00 | `detector-frozen` tag; held-out set; baseline; memo | Proof numbers from real runs |
| H19 | 04:00 | **Feature freeze** | Only bug fixes after this |
| H19–H22 | 04:00–07:00 | Rehearse; backup demo video; README, PROOF.md | `bun run demo` works three times in a row |
| H22–H23 | 07:00–08:00 | Submit on Devpost; repo public and clean | Submitted |

**Cut order if behind:** VIN check → document images → judge seed picker → animation polish. **Never cut:** live CRS, the ring + Twin Compare, the acorn budget, the event log, ask-once, the CRO screen.

---

## 14. Team

| Person | Role | Owns | Tickets |
| --- | --- | --- | --- |
| A | Evidence | Generator, documents and fingerprints, explanations (strings down), injection guard | 02, 07, 08 |
| B | Verification | CRS client and tools, persona guard, acorn ledger, recovery, deal engine, memo | 03, 06, 10, 14 |
| C | Board | Contracts and skeleton, drawer, corkboard, notebook, replay, held-out set (writes no detection code) | 01, 09, 12, 15 |
| D | Investigation | Graph and weights, Hazel's loop, ask-once rules, baseline and proof, submission | 04, 05, 11, 13, 16 |

---

## 15. Sources

- Point Predictive, 2026 Auto Lending Fraud Trends Report (Apr 8, 2026): $10.4B exposure, 69% first-party, 45% income/employment, 67% bust-out growth, >70% of early payment defaults with origination-fraud evidence.
- OCC Bulletin 2020-81, Risk Management of Loan Purchase Activities (check exact wording before quoting).
- CRS sandbox docs via the `crs-calhacks` MCP server; Tarik's (CRS) feedback in the Cal Hacks Slack.
- Hyphenate workshop notes (github.com/dghiberdic/calhacks26, research/HYPHENATE_REPORT.md).
- Cal Hacks 12.0 and 11.0 Devpost winner galleries.
- Acorn costs, budget and pricing assumptions are our design choices.
