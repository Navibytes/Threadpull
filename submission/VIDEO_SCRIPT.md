# Three-minute demo video script

Everything on screen is a recorded run's event rows replayed from Supabase, or a live run. Nothing is scripted
animation (CLAUDE.md rule 2). Every number spoken comes from those rows or from `docs/PROOF.md`.

## Before recording

1. `.env.local` has `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (the board and CRO screen read
   Supabase with them). Start the app: `bun run dev`, then open `http://localhost:3000`.
2. Open these tabs in order (all recorded runs are in Supabase):

   | Tab | URL | What it is |
   | --- | --- | --- |
   | Board | `/?run=r13-20261025T094302` | Seed 13 **proof run** on the frozen detector (Claude Sonnet 5.5, live CRS, 02:43 PT) |
   | CRO screen | `/cro?run=r13-20261025T094302` | Same run: exclusions, buyback draft, revised bid, the open question to the CRO |
   | Rule at work | `/?run=r13-20261025T091630` | An earlier recorded run (02:16 PT, before the freeze) where rule R-001 took threads down by itself |
   | Proof | `docs/PROOF.md` (or `/dashboard?run=r13-20261025T094302`) | Generated results, seed 13 and held-out seed 99 |

3. Labels: say "recorded run" whenever a replay is shown. The CRS answers in these runs are **live sandbox** calls
   (each keeps its RequestID); the address and employer lookups are simulated stand-ins and the board labels them.

## Scene by scene

| Time | On screen | Voiceover |
| --- | --- | --- |
| 0:00–0:20 | Board, proof run. Step to Hazel's identity check on loan **#37** (L0037): TransUnion **2201** (SSN not associated with this name), **2202** (date of birth doesn't match the file), **2101** (address doesn't match), with its RequestID. | "A bank is about to buy a thousand auto loans. Loan 37 just failed a live identity check: a real Social Security number under a made-up person. Upload the loan tape: we tell you which borrowers don't exist, which ones only look suspicious, and how much less to pay." |
| 0:20–1:20 | Keep the replay running: Hazel's notebook and acorn meter; threads appear for the shared phone, the shared bank accounts, the shared IP and devices, and the recycled pay-stub template; six cards at one dealer (Sunline Auto Group, D03). Pause on the **injected pay stub** (L0445) being flagged. | "Hazel is the investigator. Claude picks her next check; code charges the budget, in acorns, and decides every status. A shared clue opens a lead, and a rare one counts more than a common one. Six borrowers at one dealer share phones, bank accounts, devices and one recycled pay stub. One pay stub even tells the reviewer to clear it. Code flags it, and it changes nothing." |
| 1:20–1:50 | **Twin Compare**: L0229 and L0566 share an address. `check_address` shows a 212-unit apartment building; the thread falls, citing that check. | "Restraint matters as much as suspicion. These two share an address, but it's a 212-unit apartment building. The check proves an ordinary explanation, so the thread comes down, and the board shows exactly why." |
| 1:50–2:30 | CRO screen, proof run: balance under review, dealer concentration, the drafted buyback demand to D03, the revised bid. Show the **open question** to the CRO (a 684-staff employer shared by two loans), with Hazel's confidence and reason. Switch to the rule-at-work tab: R-001 takes employer threads down by itself, citing the CRO's ruling. Back on the CRO screen, **Approve** the exclusion. | "When Hazel can't decide, the right person gets one precise question, with her confidence and the reason. The answer becomes a rule. In a later run, the rule clears the next lookalike by itself. Ask once, remember forever. And the money decision stays with a person: Hazel can't buy, reject or send anything." |
| 2:30–2:55 | Proof, held-out seed 99 table: Hazel **12 of 12** ring members, **0 of 65** innocents flagged, 59 acorns; fixed rules 12 of 12 but **8 of 65** innocents flagged; checking everything **233 acorns** and only 3 of 12 ring members. | "Measured on a held-out portfolio written by a teammate who wrote no detection code, on frozen code: Hazel found all twelve ring members and flagged no innocent borrower. A fixed checklist flagged eight. Checking everything cost nearly four times the budget." |
| 2:55–3:00 | Threadpull wordmark. | "Find the ring. Protect the innocent. Decide the deal. We don't just connect the evidence. We know when to take a connection down." |

Numbers in the 2:30 scene are from `docs/PROOF.md`, Seed 99. Re-read them from that file before recording in case it changes.

## Backup video

Record the whole proof-run replay end to end (board, then CRO screen) with no cuts. If the live demo at the table
fails, it shows a real run. Say "recorded run" at the start.

## Rules

- At most three minutes.
- Never present a replay as live, and never replace a live CRS result with a simulated one without saying so on
  screen and in the voiceover.
- Don't say "the AI decides" or "replaces the team": Hazel recommends and code enforces; a person approves.
