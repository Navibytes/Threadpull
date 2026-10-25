// Portfolio Intelligence numbers, computed only from recorded data: the loan files (status per loan) and one
// run's event rows. Nothing here estimates, scores or compares; a figure that can't be computed is null so the
// page shows an empty state instead of a zero. Every definition is stated next to its figure and on the page.
import { LOAN_STATUSES, type Loan, type LoanStatus } from "@/lib/contracts/loan";
import { crsRequestIds, reduceEvents, type RunEvent } from "@/lib/events";

export const OFFICIAL_STATUSES = LOAN_STATUSES.filter((s): s is Exclude<LoanStatus, "Not reviewed"> => s !== "Not reviewed");

export type StatusBreakdown = {
  counts: Record<LoanStatus, number>; // every loan counted exactly once: sums to `total`
  total: number;
  fromRun: number; // loans whose status here was set by a status_changed row in this run (the rest: the loan file's)
  outsidePortfolio: number; // loans a run set a status on that are not in the loaded portfolio (not counted above)
  ignoredRows: number; // status_changed rows whose status isn't one of the supported words
};

export type RunMetrics = {
  runId: string;
  rows: number;
  simulatedRows: number;
  firstTs: string;
  lastTs: string;
  casesInvestigated: number; // distinct loans named by lead_opened rows
  checks: number; // check_run rows
  crsChecks: number; // of those, rows that cite at least one CRS source
  simulatedChecks: number; // of the checks, rows marked simulated: a stand-in, never a live call
  linksFound: number; // distinct threads from link_found rows
  linksExplained: number; // of those, threads taken down by a valid clue_explained row that cites its proof
  linkKinds: Record<string, number>; // distinct threads by what they share (phone, address, ...)
  finished: boolean; // the run has a run_finished row
  explanationsWithoutThread: number; // valid clue_explained rows naming no thread (for example a dealer burst)
  budget: { spent: number; limit: number } | null; // the budget on the run's last row
  dispositions: number; // distinct loans named by disposition_recorded rows
  sourceRefs: Record<string, number>; // source references by kind, across all rows
  crsRequestIds: number; // distinct CRS RequestIDs cited
  recent: RunEvent[]; // newest first
};

export type DashboardMetrics = {
  loansLoaded: number | null;
  statuses: StatusBreakdown | null;
  run: RunMetrics | null;
};

const distinct = <T>(items: T[]) => new Set(items).size;

export function runMetrics(events: RunEvent[], recentCount = 14): RunMetrics | null {
  if (events.length === 0) return null;
  // reduceEvents puts rows in seq order and ignores a seq it already applied, so a row delivered twice counts once
  const board = reduceEvents(events);
  const rows = board.events;
  const ofType = (t: RunEvent["type"]) => rows.filter((e) => e.type === t);
  const sourceRefs: Record<string, number> = {};
  for (const e of rows) for (const s of e.sources) sourceRefs[s.kind] = (sourceRefs[s.kind] ?? 0) + 1;
  const checks = ofType("check_run");
  const explained = board.threads.filter((t) => t.explained);
  const clueRows = ofType("clue_explained");
  const last = rows.at(-1)!;
  return {
    runId: last.run_id,
    rows: rows.length,
    simulatedRows: rows.filter((e) => e.simulated).length,
    firstTs: rows[0].ts,
    lastTs: last.ts,
    casesInvestigated: distinct(ofType("lead_opened").flatMap((e) => e.loan_ids)),
    checks: checks.length,
    crsChecks: checks.filter((e) => e.sources.some((s) => s.kind === "crs")).length,
    simulatedChecks: checks.filter((e) => e.simulated).length,
    linksFound: board.threads.length,
    linksExplained: explained.length,
    linkKinds: board.threads.reduce<Record<string, number>>((k, t) => ({ ...k, [t.kind]: (k[t.kind] ?? 0) + 1 }), {}),
    finished: rows.some((e) => e.type === "run_finished"),
    explanationsWithoutThread: clueRows.filter((e) => !(e.result.edge_ids as unknown[] | undefined)?.length).length,
    budget: last.budget ?? null,
    dispositions: distinct(ofType("disposition_recorded").flatMap((e) => e.loan_ids)),
    sourceRefs,
    crsRequestIds: distinct(rows.flatMap((e) => crsRequestIds(e.sources))),
    recent: [...rows].reverse().slice(0, recentCount),
  };
}

const isStatus = (s: unknown): s is LoanStatus => typeof s === "string" && (LOAN_STATUSES as readonly string[]).includes(s);

// Each loan once: the status on its loan file, replaced by the latest status this run set on it.
export function statusBreakdown(loans: Loan[], events: RunEvent[]): StatusBreakdown {
  const byId = new Map<string, LoanStatus>(loans.map((l) => [l.loan_id, l.status]));
  const fromRun = new Set<string>();
  const outside = new Set<string>();
  let ignoredRows = 0;
  for (const e of reduceEvents(events).events) {
    if (e.type !== "status_changed") continue;
    const status = e.result.status;
    if (!isStatus(status)) {
      ignoredRows++;
      continue;
    }
    for (const id of e.loan_ids) {
      if (byId.has(id)) {
        byId.set(id, status);
        fromRun.add(id);
      } else outside.add(id);
    }
  }
  const counts = Object.fromEntries(LOAN_STATUSES.map((s) => [s, 0])) as Record<LoanStatus, number>;
  for (const s of byId.values()) counts[s]++;
  return { counts, total: byId.size, fromRun: fromRun.size, outsidePortfolio: outside.size, ignoredRows };
}

export function computeDashboard(loans: Loan[] | null, events: RunEvent[] | null): DashboardMetrics {
  return {
    loansLoaded: loans ? loans.length : null,
    statuses: loans ? statusBreakdown(loans, events ?? []) : null,
    run: events ? runMetrics(events) : null,
  };
}
