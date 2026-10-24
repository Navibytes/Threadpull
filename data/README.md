# Data (ticket 02)

```bash
bun install
bun run data                                   # seed 13: generate, normalize, load Supabase if configured
bun run data --spec data/patterns/seed99.json  # held-out set (teammate C, after detector-frozen)
bun run data --no-db                           # files only
bun test
```

Each loan is shaped like the credit application a dealer sends the bank:

- **The application itself:** `applicant_info`, `residential_info`, `employment_info`, `vehicle_and_loan_details`.
- **What the bank holds after funding:** `submission` (dealer, broker, time, channel, device, IP) and `funding_info` (APR, term, payment, balance, ACH account).
- **Paperwork:** `documents` (pay stub and application).

The Zod schema is in `lib/contracts/loan.ts`. Normalizing in `lib/ingest/normalize.ts` adds `derived` (`address_key`, raw dealer spelling, parsed year/make/model) and `status`.

Two deliberate differences from a real dealer file:

- Full fake SSNs, not masked ones, because CRS needs the full number to match a persona. Background SSNs use the never-issued 9xx area, so they can't belong to anyone.
- Emails are `@example.*`, so a fake email can never be a real address.
- Background submission IPs come from 100.64.0.0/10 (shared address space, never a real home or office) and are unique per loan.
  Persona IPs are the CRS ones. Phones, emails, bank accounts, devices, IPs and pay-stub check numbers are shared **only** where a pattern plants it (a test enforces this), so every shared value is a real clue.

| Output | Who reads it |
| --- | --- |
| `data/out/seed13/loans.json` | the messy tape (SKELETON §5.1), validated by `RawLoanSchema` |
| `data/out/seed13/loans.normalized.json` | clean `Loan` records; also upserted into Supabase `loans` (migration in `supabase/migrations/`) when `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` are set. `GET /api/loans` serves Supabase, or this file if the DB isn't set up |
| `data/out/seed13/loans.csv` | the same tape flattened (dotted column names) without documents, for the "upload the loan tape" moment |
| `data/out/seed13/reference/public_lookups.json` | **simulated** address type / units and employer headcount, for `check_address` and the employer-size explanation |
| `data/keys/seed13/answer_key.json` | ground truth, for the proof and metrics only. Never read by `lib/` or `app/` code (a test enforces this); only `eval/` reads it |
| `data/personas.json` | canonical CRS persona identity (verbatim from the sandbox test data) |

Same spec + seed gives byte-identical output (tested). Both output folders are gitignored.

## Notes for teammates

- **B (CRS):** build CRS request bodies from `data/personas.json`, matched by the loan's normalized SSN, never from
  tape fields. Case loans already match the persona exactly after normalization, but this keeps the persona guard airtight.
- **D (graph):** normalized loans add `derived.address_key` (street without unit + ZIP), so the shared apartment building links.
  `submission.dealer_name` is canonical, and `derived.dealer_name_raw` keeps the tape spelling.
  Link fields: `applicant_info.phone`/`email`, `funding_info.ach_bank_account`, `submission.device_id`/`ip_address`, `employment_info.employer_name`, `documents[].template_id`. `persona_id` is in the record per the contract; detection code must not read it.
- **C (seed 99):** copy `patterns/seed13.json`, change `seed`, the personas per pattern, dealers, dates and counts.
  `data/generate.ts` never needs editing.
- Initial status is `Not reviewed` until Hazel touches the loan.

## Seed 13: what is planted (the details are in the answer key)

- Ring of six at D03 Sunline Auto Group / broker B07, within 9 days: P13 (L0037), P12, P14 + 3 background loans.
  - Links: P13's phone on one background loan; shared ACH bank accounts, devices and one submission IP.
  - Ring members have lived at their address only 2–5 months.
  - Two tiny "employers" (4 and 6 staff).
  - One recycled pay-stub template `T-7F3A` (PDFescape, same check no. 000418, YTD that doesn't fit the pay date).
  - One VIN that decodes 6 years older than the stated year.
- **Deviation from §5.3:** the apartment twins are **P08 + a background neighbour** (3300 N Lake Shore Dr, 212 units), not P01 + P19.
  Persona addresses are fixed by the sandbox, and P01/P19 live in different cities.
- Meridian Health System (48,000 staff): P02, P10 + 38 background loans → R-001.
- Kestrel Dental Group (38 staff): 3 background loans, innocent, outside R-001 → Hazel asks again.
- Household: P18 + spouse Denise Abernathy (same phone, address and last name; co-applicants).
- Dealer D01: 40-loan burst at the end of Aug 2026; its own history is month-end heavy every month.
- Review cases: P16 fraud alert, P15 frozen TU, P17 bureau divergence.
- Risky but real: P05, P07, P11.
- Injection: P06's pay stub.

Loan terms approximate SEC ABS-EE auto tapes (term mix 36–84 months, APR by credit tier). They are not fitted to a specific filing.
