# 10: CRO screen and deal engine

**Owner:** B (Verification)  
**Target:** H15, Sun 00:00

**What to build:** After a run, the Chief Risk Officer opens a clean, professional screen with the totals, the three actions and the drafted documents, and can approve or override.

**Blocked by:** 05 Hazel v1: the first ring, end to end

**Status:** done (B, Sun 2026-10-25). The `dispositions` migration is applied on the hosted project (checked read-only: the server key reads the table and the browser key sees no rows); decisions are copied into it (5 rows when checked, from one run), so the copy works end to end. `/cro` is linked from the board's run progress panel once a run finishes (`components/board/run-progress.tsx`), not from the site header. On the public demo (`PUBLIC_DEMO=1`) decisions are refused; they run in the local app.

- [x] The deal engine (plain TypeScript, `lib/deal`) computes total principal, proposed price, balance under review, concentration by dealer and by ring, and spend vs the cost of checking everything (`tests/deal-pricing.test.ts`, `deal-report.test.ts`, `deal-report-credit.test.ts`). The price is balance x (1 - PD x LGD) x (1 - margin); the PD tiers, LGD (55%) and margin (4%) are labeled "assumed" on screen, and a loan with no credit score is priced with the margin only.
- [x] Actions: Exclude, Reprice (price scenarios from analyst-entered LGD and margin) and Protect, each with the loans behind it (`components/cro/actions.tsx`).
- [x] Drafts: a buyback demand per dealer with its evidence list, and a document request for each `Insufficient evidence` loan (`lib/deal/drafts.ts`, `tests/deal-drafts.test.ts`).
- [x] Approve and Override (override needs a reason of at least 10 characters) produce `disposition_recorded` and set `Human-confirmed disposition` (`lib/deal/dispositions.ts`, `tests/deal-dispositions.test.ts`).
- [x] Every number links to the events behind it: each loan row and total shows its event sequence numbers.
- [x] Neutral styling, separate from the cork look, built with plain Tailwind and not shadcn/ui (`components/ui` was never generated, and nothing on this screen needed a primitive). Superseded: C's second-pass redesign moved the screen into the board's walnut and cream palette (`components/cro/cro.module.css`), so it is no longer separate from the cork look.
- [x] Dispositions are stored in the run's event log (the record of truth) and copied to Supabase `dispositions` (`tests/deal-dispositions-db.test.ts`); `bun test` covers the money math. The copy stays off under `bun test`, so tests never touch the hosted database.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
