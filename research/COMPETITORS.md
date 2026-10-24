# Cal Hacks 13.0 — what other teams are building

Scraped Sat 2026-10-24 ~08:00 PT from public GitHub repos created since Oct 20 that mention Cal Hacks,
plus code search for the CRS API (`stitchcredit` / `crscreditapi`). 131 repos, 74 with a readable
README. Private repos are invisible, so this is a sample, not the full field.

## Direct overlap with our ideas

| Repo | What | Overlap |
|---|---|---|
| robertguozt/Calhacks-13.0 — **Second Signature** | Overnight fraud analyst for a credit union: holds an older member's payment, calls her (Twilio + Cartesia), bridges in family, scam-call "shield", CRS identity + credit file, Nessie, Apify FTC alerts, Factory Droid morning review | **Is HoldLine**, already well built. Good thing we moved off it. |
| — | Nobody found doing **loan-portfolio due diligence / synthetic identity** | Tickmark's space looks open. |

## Other finance / Hyphenate-track entries (our real competition)

| Repo | Seat / idea |
|---|---|
| nergisRahimzade/Vouch | Payroll + stock-comp accountant for a fictional global startup; planted errors + hidden answer key |
| dghiberdic/calhacks26 — StormCheck | Airline disruption-liability seat: real cause of each cancellation, passenger compensation, claims provision |
| azizu06/backrooms — Backroom/Ledgerline | 3D back office; collections clerk phones late clients (Cartesia), payables clerk refuses fake bank change; uses CRS, Nessie, Apify |
| CainPatel/…-Stanford — Draw | AP clerk for small contractors; policy kernel + hardware signing key decide if money moves |
| TaitaNakayama/ares | Procure-to-pay agent team under deterministic controls, Mars base in Cardboard VR (solo) |
| petersenmatthew/calhacks — ExperimentLedger | Reconciles GPU invoices vs what actually ran for an AI lab, disputes overcharges |
| sarvesh172000/lease-desk | ASC 842 lease abstraction, rent reconciliation, amendment remeasurement |
| Adriancluna/sidecall | "Portfolio blast radius" for PE-owned companies |
| shaurmittal/countersign-calhacks | Second signer for a one-person company; Cartesia phone line; "talk it into anything except moving money" |
| gaviiin/calhacks — Pit Wall | Fictional F1 team, FIA document evidence → finance ledger |
| redrum2k/order-to-cash | Custom-data order to cash with verification gates |
| evelynyouu/calhacks — FirstFund | Paycheck auto-invests after rent (Nessie) |
| micahtid, nivang (Sentinel), vs-githjk (Tech Bazaar) | Agent shopping/payments with x402 + guardrails; Tech Bazaar also uses CRS |

## Patterns: what judges will see over and over (so it is table stakes, not a differentiator)

1. **"The LLM proposes, deterministic code decides."** Draw, Ares, Vouch, Sentinel, CalHack, Second Signature… nearly every finance repo says this. Do it, but don't headline it.
2. **"Can never move money on its own."** Same: everyone has it.
3. **Real-vs-simulated docs, planted errors with an answer key, append-only audit log.** Common in strong teams.
4. **Voice calls via Cartesia** (Second Signature, Backroom, Countersign, Huddle, Cadence, NeuroLingo, ScreenTutor). Crowded track.
5. **Convex / SpacetimeDB** backends are popular (sponsor tracks).

## Hyphenate intel (from StormCheck's research file, incl. notes from Hyphenate's Friday workshop)

- Hyphenate (formerly Maximor) sells AI agents that do a finance team's work on top of the ERP for **$100M+ revenue mid-market companies**. Pitch to the CFO/Controller.
- **Run the routine work, hold only the exception**, human approves money movement.
- **Every escalation shows a confidence %** and a reason (`no precedent` / `sources disagree`) and goes to the **specific right person**, not "a human".
- **Ask once, remember forever:** a human ruling becomes a scoped, versioned rule; the next case is handled automatically citing it; an out-of-scope case asks again. They called this the single most valuable thing to show.
- **"Do the work, don't flag it."** A dashboard of red flags is "homework". The system should produce the finished output (entries, notices, the fix) with evidence attached.
- Git-like traceability: every rule rooted in a precedent or explicit guidance.
- "Intelligence is cheap, accountability is not. The product is the 1%: knowing when to stop, what to escalate, whom to bring in, how to show your work."
- Auditors only sample; "when agents do the work, every single entry is examined." (Exactly Tickmark's pitch.)
- Avoid: "the AI decides", "replaces the team", dashboards of flags, things that look like their own product (bill coding, PO matching, bank rec, ASC 606).

## Ideas worth borrowing for Tickmark

- **Ask-once loop** (Hyphenate): CRO rules on the first fraud-alert loan (P16) → rule R-1 → the next one is auto-handled citing R-1 → an out-of-scope one asks again.
- **Do the work:** generate the finished outputs: dealer putback notices, the revised purchase exhibit with exclusions, the revised bid, the CRO memo. Not just flags.
- **Confidence % + reason + named recipient** on every escalation (CRO vs credit analyst vs legal for putbacks).
- **Hidden answer key + measured score** (Vouch): planted fraud in the demo portfolio, Tickmark's catch rate and false-positive rate computed against it.
- **Judge Scenario form** (Second Signature): judges can add their own loan/edit a row live.
- **One command rebuilds everything from a fixed seed** (Vouch).

## Rescan Sat 2026-10-24 ~08:30 PT (18 new repos)

New Hyphenate-track entries, all accounts payable / receivable: **pinkstrokes/charter** (AI finance team in one
database, read-only internal auditor), **i-shantt/landed** (no payment to an unverified vendor bank
account, business-email-compromise defense), **ZERO34802/CalHacks_Finance_Agentic — ReconAI** (AP +
vendor-master clerk), **aldisworkspace/steward** (grants accountant), **AnushaAgarwal27/Docket**
(caseworker for F-1 students finding money they're owed). AP/AR is now crowded.

Still no Cal Hacks repo on loan-portfolio due diligence or synthetic identity. Outside the event,
`aka-vm/financial-doc-reader` (auto-loan ABS servicer reports and loan tapes) is a useful reference
for what real loan tapes look like.

## Rescan Sat 2026-10-24 ~10:00 PT + past winners (idea now: Threadpull)

147 Cal Hacks repos total; 4 new, none on fraud rings, loan portfolios or graph investigation.
Outside the event, "agentic fraud investigation" exists (juliajsbit/fraud-case-investigator,
ARV0007/transakt-sentinel), so the agent itself is not novel; portfolio acquisition +
withdrawing suspicion + a verification budget is. StormCheck (dghiberdic) remains the strongest
Hyphenate rival: real data, ask-once, "never asks twice".

Past winners (Devpost, first page of winners):
- Cal Hacks 12.0: 1st FaceTimeOS (control a Mac over FaceTime), 2nd Ted.AI (emotion-sensing companion,
  hardware), 3rd Project No Cap (real-time misinformation verification). Best Use of Claude: Elda AI.
  Fintech: Cryptoagent CFO won Postman.
- Cal Hacks 11.0: 1st Duet (EEG → live music), 2nd GhostWriter, 3rd SnackSnap.
- Pattern: overall winners are consumer, multimodal or hardware, understood in 10 seconds. B2B
  finance wins come through sponsor tracks. Closest relative to Threadpull: Project No Cap
  (an AI that verifies claims and shows evidence live).
