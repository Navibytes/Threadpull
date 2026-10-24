# Data (ticket 02)

```bash
uv sync
uv run python -m data.generate                                   # seed 13 (default spec)
uv run python -m data.generate --spec data/patterns/seed99.json  # held-out set (teammate C, after detector-frozen)
uv run pytest
```

| Output | Who reads it |
| --- | --- |
| `data/out/seed13/loans.json` | the messy tape (SKELETON §5.1). Backend loads it via `backend.ingest.load_portfolio()` |
| `data/out/seed13/loans.csv` | the same tape without documents, for the "upload the loan tape" moment |
| `data/out/seed13/reference/public_lookups.json` | **simulated** address type / units and employer headcount, for `check_address` and the employer-size explanation |
| `data/keys/seed13/answer_key.json` | ground truth, for the proof and metrics only. Never read by backend code (a test enforces this) |
| `data/personas.json` | canonical CRS persona identity (verbatim from the sandbox test data) |

Same spec + seed gives byte-identical output (tested). Both output folders are gitignored.

## Notes for teammates

- **B (CRS):** build CRS request bodies from `data/personas.json`, matched by the loan's normalized SSN, never from
  tape fields. Case loans already match the persona exactly after normalization, but this keeps the persona guard airtight.
- **D (graph):** normalized loans add `address_key` (street without unit + ZIP) so the shared apartment building links;
  `dealer_name` is canonical, and `dealer_name_raw` keeps the tape spelling. `persona_id` is in the record per the contract; detection code must not read it.
- **C (seed 99):** copy `patterns/seed13.json`, change `seed`, the personas per pattern, dealers, dates and counts.
  The generator never needs editing.
- Initial status is `Not reviewed` until Hazel touches the loan.

## Seed 13: what is planted (the details are in the answer key)

- Ring of six at D03 Sunline Auto Group / broker B07, within 9 days: P13 (L0037), P12, P14 + 3 background loans.
  - Links: P13's phone on one background loan; shared bank accounts and devices.
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
