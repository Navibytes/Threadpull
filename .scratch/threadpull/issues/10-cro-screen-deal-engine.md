# 10: CRO screen and deal engine

**Owner:** B (Verification)  
**Target:** H15, Sun 00:00

**What to build:** After a run, the Chief Risk Officer opens a clean, professional screen with the totals, the three actions and the drafted documents, and can approve or override.

**Blocked by:** 05 Hazel v1: the first ring, end to end

**Status:** ready-for-agent

- [ ] The deal engine (plain TypeScript, `lib/deal`) computes total principal, proposed price, balance under review, concentration by dealer and by ring, and spend vs the cost of checking everything.
- [ ] Actions: Exclude, Reprice (price scenarios from analyst-entered assumptions), Protect.
- [ ] Drafts: a buyback demand per dealer with its evidence list, and a document request for each `Insufficient evidence` loan.
- [ ] Approve and Override (override needs a reason) produce `disposition_recorded` and set `Human-confirmed disposition`.
- [ ] Every number links to the events behind it.
- [ ] Neutral shadcn/ui styling, separate from the cork look.
- [ ] Dispositions stored in Supabase `dispositions`; `bun test` covers the money math.

Spec: SKELETON.md (contracts, rules and the 24-hour plan).
