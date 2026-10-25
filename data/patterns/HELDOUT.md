# Writing the held-out set (seed 99)

Ticket 12. **Written by C**, who writes no detection code: A and D wrote the checks, the graph and Hazel, so if they
saw where seed 99's cases are, it would stop being a held-out test. A and D: don't open the spec or the key until the
proof run is done.

## 1. Write the spec (local only)

```sh
mkdir -p data/patterns/heldout          # ignored by git: nothing in it can be pushed by accident
cp data/patterns/seed13.json data/patterns/heldout/seed99.json
```

Then edit `data/patterns/heldout/seed99.json`:

- `"seed": 99`, and delete `"pin"` (it only puts the demo's lead at L0037).
- Move every pattern somewhere new: other dealers (`D01`…`D24`), brokers, start dates, window lengths, background
  member counts, which members share what.
- Change at least one thing seed 13 never does (the ticket's example: a ring tied by a shared bank account instead
  of a phone). Your choice; don't tell A or D what it is.
- Use only the fields seed 13 uses. `data/spec.ts` is the full list and rejects anything else.

What the generator supports:

| Pattern | Fields | Notes |
| --- | --- | --- |
| `ring` | `ring_id`, `dealer`, `broker`, `personas`, `background_members`, `window_days`, `start`, `shared`, `employers`, `recycled_pay_stub`, `vin_year_mismatch` | `shared[].kind`: `phone`, `bank_account`, `device_id`, `ip_address`. Members are personas or `bg1`…`bgN`. A ring persona not listed under an employer keeps its own. More than one ring is fine. |
| `shared_building` | `persona`, `background_members`, `units`, `proving_check` | Neighbours get the persona's building. Repeatable. |
| `large_employer` / `small_employer` | `personas`, `background_members`, `employer` (`name`, `headcount`, `job_titles`), `proving_check`, `truth` | Repeatable. |
| `household` | `persona`, `spouse` (`first_name`, `last_name`), `proving_check` | Repeatable. |
| `dealer_burst` | `dealer`, `month`, `count`, `history_month_end_share`, `proving_check` | One per dealer. |
| `review` | `persona`, `expected_status` (`Investigate` / `Insufficient evidence`), `reason` | |
| `risky_real` | `personas`, `expected_action` | |
| `injection` | `target` (a ring member above, e.g. `RING-1:bg1`) or `persona` | |

Limits that come from the CRS sandbox: there are 20 personas (`P01`…`P20`) and each is planted at most once.
Their names, SSNs and addresses are fixed. Every other persona becomes a plain case loan.

## 2. Check it

```sh
bun run data:check --spec data/patterns/heldout/seed99.json --keys ~/threadpull-heldout
```

Every line must be ✓. It validates the spec, generates the portfolio, confirms the answer key resolves and every
planted ring link reaches the evidence graph, checks every case loan's CRS body against the persona guard, and runs
Hazel's loop on it with a scripted model. **The output names no loan and no truth, so it's safe to paste in the chat.**
The answer key goes to `~/threadpull-heldout/seed99/`, outside the repo.

## 3. After the freeze: load it and run the proof

Only once the `detector-frozen` tag exists (`git fetch --tags && bun run freeze:check` shows ✓):

```sh
bun run data --spec data/patterns/heldout/seed99.json --keys ~/threadpull-heldout   # loads seed 99 into Supabase
bun run hazel --spec data/patterns/heldout/seed99.json                              # the proof run (live CRS)
```

- `bun run hazel` refuses any seed other than 13 unless detection code matches the tag, and `run.json` records the
  frozen commit.
- Use live CRS for the proof run: real sandbox recordings cover only 8 personas, so `--crs recorded` would mark the
  others' identity checks simulated.
- The board shows the run at `/?run=<run_id>`, and the drawer and Twin Compare load seed 99.

## 4. After the proof run

Move the spec to `data/patterns/seed99.json` and commit it, so anyone (a judge) can regenerate seed 99 and check the
numbers. Report the numbers as they came out. If detection code changes after anyone has seen seed 99's results,
those results are no longer held-out: say so next to any later number.
