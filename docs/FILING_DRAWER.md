# Filing drawer (Ticket 09, component only)

Worktree: `C:\code\CalHacks13.0\Threadpull-drawer`, branch `feature/filing-drawer`.

The drawer is not mounted in the investigator view. No board, notebook, Hazel, event, backend, contract or migration code is changed.

## Review locally

Run `bun install`, then `bun run dev -- --port 3011` in this worktree and open <http://localhost:3011/dev/drawer>.
This development-only route returns 404 in a production build, following the existing `/dev/hazel` convention.
It starts with an explicitly labeled synthetic preview of 1,000 loans. The checkbox switches to the existing API; it never silently substitutes preview data for a failed request.

## Integration after review

Mount the drawer in a **client component**; its selection callback cannot cross a server-to-client boundary.
Give its container a bounded height and your desired width (for example 22rem), with `min-height: 0` inside a flex layout. The drawer fills that container and scrolls its file list.

```tsx
"use client";

import { useState } from "react";
import { FilingDrawer } from "@/components/drawer";

export function LoanPicker() {
  const [selectedLoanId, setSelectedLoanId] = useState<string | null>(null);
  return (
    <aside className="h-[800px] min-h-0 w-full max-w-sm">
      <FilingDrawer
        seed={13}
        selectedLoanId={selectedLoanId}
        onSelectLoan={(loan) => {
          setSelectedLoanId(loan.loan_id);
          // Pass loan.loan_id to the investigator's existing selection/focus handler.
          // Selection does not change a disposition, emit an event, or start a run.
        }}
      />
    </aside>
  );
}
```

`onSelectLoan` receives the original validated `Loan`; `selectedLoanId` is controlled by the parent.
The drawer does not import the board's selection type or assume that a loan has a card on the current board.
The integrator must resolve a loan ID to an existing board card before focusing it, and handle loans with no card.

The default adapter requests `GET /api/loans?seed=13` (or the supplied seed), checks `LoanSchema`, and rejects duplicate IDs or unknown statuses. It embeds no credentials or database keys; browser fetch retains normal same-origin cookie behavior. It never renders SSN, birth date, contact details, documents, or bank account fields. The endpoint still returns the full existing loan contract; this component does not change that server-owned response.

Records load on mount, seed/source changes, and manual Refresh/Retry. Pending requests are aborted on cleanup and stale responses cannot replace a newer source. A source change or refresh starts a fresh list/filter session; the selected ID remains parent-owned. This first version does **not** subscribe to run events or claim live/replay synchronization. When a parent already owns current validated loans, use the exported `LoanList` with `loans`, `selectedLoanId`, and `onSelectLoan` to avoid a second fetch. Keep preview provenance visible if using `LoanList` directly with fixtures.

## Status and filtering semantics

- The exact four disposition labels come from `LOAN_STATUSES`: Investigate, No material anomaly found, Insufficient evidence, Human-confirmed disposition.
- `Not reviewed` is a separate review-state option, shown with a neutral dashed chip. It is never converted into a favorable finding or inferred from missing data.
- Search is a case-insensitive loan-ID substring match; outer whitespace is ignored. It does not search personal data.
- Dealer options are deduplicated and matched by `submission.dealer_id`; labels include both dealer name and ID.
- Filters intersect. Changing or clearing a filter resets to page 1. Only 25 loan buttons render at once; all 1,000 records remain searchable across 40 pages.
- No records, no filter matches, loading, and request errors have distinct messages. Retry and Refresh reload the selected source.

## Preview adapter

```tsx
import { previewLoanSource } from "@/components/drawer/preview-loan-source";
// Inside a client component:
<FilingDrawer source={previewLoanSource} onSelectLoan={(loan) => console.log(loan.loan_id)} />
```

Preview data uses only existing `Loan` fields and passes the unchanged schema. It is deliberately independent of the generator, planted cases, CRS personas and event fixtures. Example dispositions are synthetic UI examples, not investigation outcomes. Preview metadata belongs to the adapter, not to invented backend fields. The public component entrypoint does not import fixtures.

The drawer inherits the existing cream, paper, cork, walnut, terracotta, sage, dusty and honey tokens, plus the current display and sans fonts. CSS is scoped to the drawer; global styles and the existing visual system are unchanged. Controls use native input/select/button behavior, visible focus, wrapping labels, and status text in addition to color. There are no added animation dependencies.

## Validation

Run `bun test tests/drawer.test.tsx`, `bun run typecheck`, and `bun run build`.
Focused tests cover contract-valid fixtures, exact status semantics, intersecting filters, ID-based dealers, complete bounded pagination, adapter validation/errors/abort, selection markup, loading provenance and empty state.

Validation on this Windows worktree: all 15 focused tests, typecheck, and production build pass. Browser checks passed at desktop, 390px and 320px widths for filtering, page reset, keyboard selection, API missing-seed/retry, intercepted API success/empty/invalid records, loading and source-switch races, and long content without horizontal overflow. The actual local API has no generated seed available; successful API responses in browser QA were intercepted contract-valid fixtures, not a verified Supabase portfolio. The full suite reports 79 passing tests, five failures and four errors, matching the baseline failures below.

At 320×640, the drawer's outer content also scrolls to keep all controls reachable; keyboard activation and touch activation of Next were verified through pages 2 and 3. Production route metadata confirms `/dev/drawer` returns 404. Independent visual review returned `ship` for this component scope, and documentation review confirmed no new global tokens or design-system changes.

Before this change, typecheck and build passed. The full test suite already failed on Windows: `tests/architecture.test.ts` compares a Windows relative path to `data/generate`, and the generator constructs an invalid `\\C:\...` persona path, breaking evidence-documents, evidence-explanations, evidence-injection, and portfolio tests. These baseline issues are outside this drawer change.
