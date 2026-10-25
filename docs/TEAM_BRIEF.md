# Threadpull Team Brief

**Find the ring. Protect the innocent. Decide the deal.**

As of Sat 2026-10-24. Working prototype by Saturday 21:00; Devpost submission by Sunday 09:00; judging Sunday 10:30–12:30.

Threadpull is an AI fraud investigator for banks buying auto-loan portfolios. It follows connections between borrowers, dealers, documents and identities to find coordinated fraud rings, spends a limited verification budget only where it matters, takes suspicion back down when it finds a legitimate explanation, and hands the Chief Risk Officer a finished acquisition decision to approve.

## 1. The idea

**Problem.** Banks buy pools of hundreds or thousands of auto loans from dealers. Before buying, they must do independent due diligence ([OCC](https://www.occ.treas.gov/)), but they review only a sample, and fraud is coordinated: several borrowers share contact details, recycled pay stubs, or the same dealer. Point Predictive estimates $10.4B of U.S. auto-lending fraud exposure in 2025 (up from $9.2B), 69% of it first-party fraud such as misstated income or employment. These are exposure estimates, not realized losses.

**Why it's hard.**
- Evidence is spread across a spreadsheet, scanned documents and third-party verification services.
- Verification costs money; you can't run every check on every loan.
- A connection is not proof. Real borrowers share apartment buildings, big employers and family phones. False accusations hurt real people.
- The bank needs a decision, not a list of suspicious records.

**What Threadpull does.**
1. Scans the portfolio and builds an evidence graph: loans, borrowers, phones, emails, addresses, employers, dealers, document fingerprints.
2. Hazel, the investigator agent, starts from the strongest lead and pulls the thread: each step is one tool call that costs acorns from a fixed budget (60 per run).
3. Every connection is challenged. Hazel actively looks for innocent explanations and withdraws suspicion when the evidence supports one.
4. Threadpull writes the finished outputs: exclusion list, revised bid, dealer buyback demands, document requests, and a CRO memo. The CRO approves.

**Seat (one line for Hyphenate):** fraud investigator on a bank's portfolio-acquisition due-diligence team.

**Pitch line (opening):** Upload the loan tape. We tell you which borrowers don't exist, which ones only look suspicious, and how much less to pay.

**Pitch line (closing):** We don't just connect the evidence. We know when to take a connection down.

**Sponsor feedback (Slack, Sat morning):** Tarik, who appears to be from the CRS team, said the idea "fits the API really well," that B2B is fine on a sponsored API track, and that a clear problem with a dollar figure is a plus. He pointed at exactly the products we use: the credit report (score, tradelines, inquiries, file open date, address history in one call), TransUnion identity verification, and AtData Fraud Finder. Our teammate's Slack post made the synthetic-identity idea public, so our edge has to be the ring, withdrawing suspicion, the budget and ask-once rules, not synthetic-identity detection alone.

**The moment (the demo and the video open with it):**
1. Loan #37 is pulled. A live CRS call returns TransUnion codes 2201 (the SSN isn't associated with this name), 2202 (the date of birth doesn't match the file) and 2101 (the address doesn't match). A real SSN under a made-up identity.
2. Red threads spread: the same phone number and a recycled pay-stub template link it to 4 more loans, all from Dealer #3. A ring.
3. Two other borrowers share an address. Hazel spends one check: it's a 200-unit apartment building. The thread falls away and the card turns green.
4. The acorn meter: the ring was found for X acorns of checks, versus Y to check everything.
5. The CRO screen: exclusions, drafted buyback demands, revised bid. Approve.

## 2. Tracks and what they judge

| Track | Prize | What wins | How Threadpull hits it |
| --- | --- | --- | --- |
| Hyphenate: Autonomous Systems for Finance (main) | $8k / $5k / $3k + interviews | Real enough; would you hire it (seat, limited access, clean record, knows when to ask); something new; the moment | Ring + de-escalation moment, ask-once rules, finished outputs, audit log, measured results |
| CRS: Identity/Fraud, Financial AI Agent, Best Overall | interview / $500 / $1k | CRS central, live against sandbox, useful, creative | CRS is Hazel's paid verification toolkit; every verdict cites a CRS RequestID |
| Microsoft: Built for the Real World | Surface laptops | Customer understanding, measurable usefulness, path to production, responsible design | Measured cost and false-accusation numbers vs baselines |
| Anthropic | TBD | Named community, real problem, works, thoughtful Claude use | Claude runs the investigation loop; we show where it could go wrong and how the code stops it |
| Apify (optional) | $5k pool, $400 best actor | Meaningful Apify use | Employer and dealer lookups via an actor |
| Cal Hacks: Most Technically Complex | NuPhy keyboard | Complexity | Budgeted agent over a live evidence graph |

Reality check from past winners: Cal Hacks 12.0 and 11.0 overall winners were consumer, multimodal or hardware projects (FaceTimeOS, Ted.AI, Project No Cap, Duet). Fintech wins came through sponsor tracks. Our realistic goal is a Hyphenate top-3 plus CRS prizes; an overall placing is a bonus that only a spectacular live corkboard can earn.

## 3. Demo data

**Background pool:** 1,000 loans from 24 fictional dealers, generated with faker-js from a fixed seed (`bun run data`, spec `data/patterns/seed13.json`). Each loan is shaped like the credit application a dealer sends the bank (applicant, residence, employment, vehicle and loan blocks) plus funding data. Loan terms follow ABS-EE-like distributions. Background borrowers are never sent to CRS.

**Case loans (~30):** every loan the investigation touches with CRS uses one of the 20 CRS sandbox personas, because only persona requests return results.

**Loan tape (`loan_tape.csv`) fields:**

| Group | Fields |
| --- | --- |
| Loan | loan_id, dealer_id, dealer_name, origination_ts, amount_financed, apr, term_months, monthly_payment, current_balance, days_past_due |
| Borrower | first_name, last_name, ssn, dob, address, city, state, zip, phone, email, ip_address |
| Income | stated_income_monthly, employer, job_title, years_employed |
| Vehicle | vin, year, make, model, mileage, new_or_used, sale_price, down_payment |
| Add-ons | gap_amount, warranty_amount, other_fees |

The tape is messy on purpose: mixed date formats, SSNs with and without dashes, "LAST, FIRST" names, typos, three spellings of the same dealer.

**Documents per case loan (`jackets/<loan_id>/`):** credit application and pay stub tonight (text/PDF); driver's license and sales contract images later. Recycled pay stubs share a template fingerprint (same layout, fonts, employer block, slightly edited numbers).

**Planted patterns and the hidden answer key (`answer_key.json`):**

| Pattern | Personas / loans | Truth |
| --- | --- | --- |
| Fraud ring at Dealer #3: synthetic identity + shared phone + recycled pay stubs | P13 (lead), P12, P14 + 2 background loans linked by phone/stub | Fraud: exclude, buyback |
| Shared address that is an apartment building | P08 + a background neighbour | Innocent: thread withdrawn |
| Shared employer that is a large hospital | P02 + P10 + 6 background loans | Innocent: withdrawn, becomes rule R-001 |
| Shared phone = co-borrowers in one household | P18 + background spouse | Innocent: withdrawn |
| Month-end sales burst at Dealer #1 | 40 background loans | Innocent: dealer timeline explains it |
| Fraud alert on file | P16 | Review: ask the CRO |
| Frozen bureau / bureaus disagree | P15 / P17 | Review: partial data, recovery |
| Risky but real (subprime, Ch. 13, eviction) | P05, P07, P11 | Reprice, never fraud |
| Prompt injection hidden in a pay stub | 1 case loan | Attack logged, no effect on verdict |

A second seed (`--seed 99`) with the same pattern types in different places is the held-out test; the agent prompt is never tuned on it. Judges can pick any seed.

## 4. Hazel's tools and the budget

The backend, not the LLM, enforces the budget, records every result and its source, and refuses calls outside the allowed set. Costs are in **acorns**, a design choice shown next to the real unit (SKELETON §7 is the contract; names and costs live in `lib/contracts/tool-result.ts`).

| Tool | What it does | Data source | Acorns |
| --- | --- | --- | --- |
| `inspect_loan(loan_id)` | Loan record + documents | Data room | 0 |
| `find_connections(entity_id)` | Neighbors in the evidence graph, with how rare each shared attribute is | graphology graph | 0 |
| `compare_documents(doc_a, doc_b)` | Template fingerprint and number consistency of two documents | Our document analyzer | 1 |
| `dealer_timeline(dealer_id)` | Origination bursts vs the dealer's own history and month-end pattern | Data room | 1 |
| `inspect_dealer_loans(dealer_id)` | Summary of every loan from one dealer | Data room | 5 |
| `crs_identity_check(loan_id)` | TransUnion identity check | CRS `tu_identity_verification` | 3 |
| `crs_credit_report(loan_id)` | 3-bureau report: file age, inquiries, employments, addresses | CRS `credit_report` ×3 | 6 |
| `crs_fraud_finder(loan_id)` | Email age, phone owner, IP distance, address type, risk score | CRS `fraud_finder` | 2 |
| `crs_reverse_phone(phone)` | Who the phone is registered to | CRS `accurate_append` reverse | 1 |
| `check_address(address)` | Multi-unit building or single home | Census geocoder + address-type lookup (simulated unit counts) | 0 |
| `check_household(loan_a, loan_b)` | Same phone + address + last name, or listed co-applicant | Data room | 0 |
| `check_employer(employer)` | Employer size and how many loans in the pool name it | Reference lookup + pool | 0 |
| `check_vin(vin)` | VIN valid and matches make/model/year | NHTSA vPIC | 0 |
| `ask_human(question, to, confidence, reason)` | One precise question to the right person | CRO console | 0, but counted |

**Budget:** 60 acorns per run. The "check everything" comparison on the proof screen is computed from the same costs over the case loans, from real runs only.

## 5. How suspicion goes up and comes down

**Raising suspicion (fraud signals):**

| Signal | Source | Strength |
| --- | --- | --- |
| TU 2201 SSN not associated with the name, 2202 date of birth doesn't match the file, 2301 SSN belongs to a deceased person (verified live; the sandbox's SSN-issuance and risk-level fields are the same for every persona, so they are not signals) | CRS TU identity | Hard |
| Credit file much younger than the borrower; 6+ inquiries in 60 days on a thin file | CRS credit report | Soft |
| "Thick file, thin life": high score but few addresses on file, shallow or borrowed tradelines (authorized-user piggybacking), file opened recently | CRS credit report (`creditFiles[]` addresses and file date, `tradelines[]`) | Soft, strong combined with identity signals |
| SSN issued late relative to age | TU identity / credit file | Weak alone (immigrants get SSNs as adults); counts only combined with other signals |
| Email first seen under 30 days ago; phone registered to someone else; IP far from address; risk score 70+ | CRS Fraud Finder, reverse phone | Soft |
| Same rare phone/email/SSN across different borrowers (rare = shared by ≤3 loans in the pool) | Graph | Soft, hard at 3+ |
| Recycled pay-stub template with edited numbers; pay-stub income >10% below tape income | Document analyzer | Soft |
| VIN doesn't match make/model/year; sale price far above market | NHTSA vPIC, ABS-EE values | Soft |
| Dealer burst that its own history doesn't explain | Dealer timeline | Soft |

**Taking suspicion down (innocent explanations; each must cite a check):**

| Suspicious link | Innocent explanation | Check that proves it |
| --- | --- | --- |
| Shared address | Multi-unit apartment building | `check_address` |
| Shared employer | Large real employer; borrower's tenure confirmed on the credit file | `check_employer`, `crs_credit_report` employments |
| Shared phone | Co-borrowers at the same address, same last name or listed co-applicant | `check_household`, `crs_reverse_phone`, co-applicant field |
| Dealer burst | Month-end or annual sales event seen in prior months | `dealer_timeline` |
| Thin credit file | Young borrower or recent immigrant whose identity verifies | `crs_identity_check` |

Rarity matters: an employer shared by 300 loans is weak evidence; a phone shared by 3 unrelated people is strong. Location alone (ZIP, neighborhood) is never a fraud signal, because it can act as a proxy for protected classes under fair-lending law.

## 6. Decisions, outputs and the human in the loop

| Verdict | When | Threadpull's action |
| --- | --- | --- |
| Clear | No unexplained signals | In the bid at base price |
| Reprice | Real borrower, credit risk only | In the bid at a lower price |
| Review | Conflicting evidence, partial data, fraud alert | Out of the bid until one named person answers one question |
| Exclude + buyback | Hard fraud signal or confirmed ring membership | Removed; buyback demand drafted to the dealer |

**Investigation statuses (exact UI words, from the team's Google Doc):** Investigate · No material anomaly found · Insufficient evidence · Human-confirmed disposition. The verdicts above are what the CRO screen proposes once a loan's investigation ends; portfolio actions are grouped as Exclude / Reprice / Protect (more due diligence, seller buyback promises, holdback).

**Halt one loan, never the batch:** a suspicious loan moves to the exception queue and every other loan keeps processing.

**Not in scope:** writing entries into a general ledger. That is Hyphenate's own product, so it reads as "not new," and it adds work we don't need.

**Price per loan:** `price = balance × (1 − PD_tier × LGD) × (1 − m)`, with assumed PD by score tier (720+ 2%, 660–719 5%, 620–659 10%, 580–619 18%, <580 28%), LGD 55%, margin 4%.

**Finished outputs (not homework):** revised bid and purchase exhibit, dealer buyback demands with evidence, document requests to dealers for Review loans, CRO memo. Every line cites the audit log.

**Asking the right person:** every question carries a confidence %, a reason (`no precedent` / `sources disagree`) and a recipient: CRO (policy, fraud alert), credit analyst (partial data, bureau disagreement), legal (buyback demands), compliance (sanctions).

**Ask once, remember forever:**
1. Two borrowers share a hospital employer and Hazel has no rule: she asks the CRO, "Is a shared employer with 500+ staff a valid explanation if tenure is on the credit file?"
2. The CRO answers in plain English; it becomes versioned rule `rules/R-001.yaml`.
3. The next lookalike's thread comes down automatically, citing "R-001, CRO ruling Sat 10:42".
4. A shared employer with 40 staff is outside R-001's scope, so Hazel asks again.

**Limits in code:** Hazel can read CRS and the data room, nothing else. She cannot buy, reject, sign or send. Overrides need a reason and are logged.

## 7. Proof it works

- **Baselines** on the hidden answer key, for both seeds: (a) run every CRS product on every loan, (b) fixed rules over the graph, (c) Threadpull.
- **Metrics:** ring members found (recall), false accusations (innocents left flagged), verification cost in $, questions asked, runtime.
- **Headline we aim for:** "Same ring found, a fraction of the cost, zero innocents left flagged." Only real measured numbers go on screen.
- **Red-team tests:** prompt injection in documents, a borrower name containing instructions, a fake "verified" stamp. Each is caught and logged.
- **Recovery:** CRS 429 → honor `Retry-After`; frozen bureau (P15) → partial data, Review; bureaus disagree (P17) → Review.
- **Replay:** every run writes its events as rows in the Supabase `events` table. The UI can replay a recorded run (safe at the judging table) or run live (for the judges' seed), receiving rows over Supabase Realtime. Every animation is one of those rows.

## 8. CRS rules that bite

- Base URL `https://api-sandbox.stitchcredit.com/api`. Log in once (`POST /users/login`), reuse the token. Repeated failed logins disable the account.
- A request matches a persona only if its body contains every field of the persona's body; anything else goes to the real vendor. The persona guard refuses to send anything else.
- Credit reports return HTTP 200 for no file / frozen / deceased: read `errorMessages` first.
- Formats: credit report and TU identity want SSN `666701001`, DOB `YYYY-MM-DD`; criminal/eviction want `666-70-1001`, `MM-DD-YYYY`.
- Fraud Finder field is `ipAddress`, not `ip`. Identical requests are cached.
- The `crs-calhacks` MCP server gives exact persona bodies (`get_test_data`, `get_personas`) and request debugging.

## 9. Interface

- **Filing drawer:** the 1,000 loans with status chips.
- **Corkboard (React Flow):** 20–30 cards at a time, threads appear, turn red, or fall away as events arrive.
- **Hazel's notebook:** what she saw, why it matters, next action, acorns left, shown next to the real unit (CRS calls, lookups). Hazel is a small avatar here, not the headline.
- **CRO review:** plain professional screen: exclusions, buybacks, Review queue with questions, revised bid, Approve / Override.
- Look: cream paper, cork, walnut type, terracotta threads, sage green for resolved. The CRO screen is clean and neutral.

## 10. Stack

| Layer | Technology | Purpose |
| --- | --- | --- |
| Web application | Next.js, React, TypeScript | Corkboard, CRO review, API routes |
| Styling | Tailwind, shadcn/ui, Motion | Hazel's warm detective-office interface |
| Interactive graph | React Flow | Evidence cards, connecting threads, animations |
| Graph intelligence | graphology | Entity relationships and connected clusters |
| Database | Supabase PostgreSQL | Loans, evidence, investigations, approvals |
| Live synchronization | Supabase Realtime | Push investigation updates to the board |
| AI | Claude Sonnet 5.5, Claude Haiku | Investigation planning and document extraction |
| Agent orchestration | Anthropic TypeScript SDK (tool runner), Zod | Structured tool calls and validation |
| Identity verification | CRS sandbox API | Actual external identity / fraud signals |
| Evaluation | Bun tests and a baseline evaluator | Measure detection, accuracy and costs |

## 11. Team split

| Role | Owns | Fit |
| --- | --- | --- |
| A: Evidence | Data generator, documents and pay-stub fingerprints, `compare_documents`, `check_vin`, red-team documents | ML / computer vision |
| B: Verification | CRS client, persona guard, cost ledger, all CRS tools, recovery cases | Backend |
| C: Board | Next.js + Supabase skeleton, filing drawer, corkboard animations from Realtime, notebook, replay | Frontend |
| D: Investigation | Graph and rarity scores, Hazel's tool loop and prompts, ask-once rules, baselines and metrics, memo, pitch and video | Agents / product |

## 12. Today's plan

- [ ] 10:00–11:30 Repo + skeleton. One live TU identity call for P13 returns 2201 + 2202 + 2101 (done, verified). Generator writes the 1,000-loan tape and answer key.
- [ ] 11:30–14:00 Graph + rarity; all tools wired with costs; Hazel's loop runs end to end in the terminal and writes rows to the `events` table.
- [ ] 14:00–17:00 Corkboard renders events live (Supabase Realtime); de-escalation works on the apartment and hospital cases; CRO screen with outputs.
- [ ] 17:00–19:00 Ask-once rule R-001; baselines and metrics on both seeds; replay mode.
- [ ] 19:00–21:00 **Prototype freeze:** `bun run demo` runs three times in a row; rough video opening with the moment.
- [ ] Night: document images, red-team tests, judge seed picker, Devpost draft, make repo public.
- [ ] Sun 06:00–08:45: polish, README + PROOF.md (real vs simulated), final video, submit.

**Cut order if behind:** document images → Apify → judge seed picker → animation polish. **Never cut:** live CRS calls, the ring + de-escalation moment, the budget meter with real numbers, the audit log, ask-once.

## 13. Open questions

- [ ] Roles A–D: who takes what?
- [ ] CRS sandbox credentials and access to TU identity and Fraud Finder confirmed? (calhacks.crscreditapi.com, or the CRS booth.)
- [ ] Hyphenate brief on the live site read? Do they bring their own scenario?
- [ ] Apify actor for employer lookups, or CRS `employments` only?
- [ ] Assumed CRS prices and pricing model: fine for the demo?
- [ ] "$50,000 per synthetic-identity case" from the Slack pitch: find a source or drop it.
- [ ] Two schedules exist (21:00 prototype checkpoint here, 4 AM feature freeze in the Google Doc): keep both, the 21:00 run is the safety net.

## 14. Sources

- Cal Hacks 13.0 Hacker Guide (deadlines and track criteria)
- CRS sandbox docs via the `crs-calhacks` MCP server (products, endpoints, 20 personas)
- Point Predictive 2026 Auto Lending Fraud Trends Report, as reported by [Insurance Business](https://www.insurancebusinessmag.com/us/news/breaking-news/auto-finance-fraud-reaches-10-4-billion-as-criminals-shift-from-theft-nicb-594148.aspx), [AFSA](https://afsaonline.org/2026/04/09/vehicle-fraud-tops-10-billion/) and [Digital Dealer](https://digitaldealer.com/news/auto-lending-fraud-exposure-has-surpassed-10-billion/170078/)
- Sponsor feedback: Tarik's reply in the Cal Hacks Slack thread on our teammate's pitch (Sat morning)
- Team Google Doc "Cal Hacks 13.0" (tabs: Brainstorm, Min, Project Summary)
- Hyphenate workshop notes in a public team repo: [research/HYPHENATE_REPORT.md](https://github.com/dghiberdic/calhacks26/blob/main/research/HYPHENATE_REPORT.md)
- Past winners: [Cal Hacks 12.0](https://cal-hacks-12-0.devpost.com/project-gallery) and [Cal Hacks 11.0](https://cal-hacks-11-0.devpost.com/project-gallery) Devpost galleries
- Public data: [SEC ABS-EE](https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&type=ABS-EE&dateb=&owner=include&count=40), [NHTSA vPIC](https://vpic.nhtsa.dot.gov/api/), [Census geocoder](https://geocoding.geo.census.gov/geocoder/), [Apify](https://apify.com/store)
- Tool prices, budget, PD/LGD and margin are our assumptions, not sourced values
