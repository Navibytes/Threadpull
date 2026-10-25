// The budgets a live run from the upload page may have, in acorns. Shared by the route (POST /api/tapes/{id}/runs?budget=)
// and the page, so the page offers exactly what the route accepts. No imports: the browser bundle loads it too.
export const RUN_BUDGETS = [30, 60, 120] as const;
export const DEFAULT_RUN_BUDGET = 60;

/** The budget a request asked for, the default when it asked for none, or null when it asked for one not offered. */
export function runBudget(raw: string | null): number | null {
  if (raw === null || raw === "") return DEFAULT_RUN_BUDGET;
  const n = Number(raw);
  return (RUN_BUDGETS as readonly number[]).includes(n) ? n : null;
}
