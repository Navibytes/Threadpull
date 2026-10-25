// How far a run has got, read only from its rows (the progress strip on the board). Hazel doesn't walk the loans one
// by one, so there is no "n of 1,000 checked": the graph scores every loan at once, she follows the leads it ranks, the
// sweep spot-checks the largest unverified balances, and the run ends when the budget is spent or no lead is left.
// So progress is the budget (a real cap), the phase and the counts the rows record.
import type { RunEvent } from "./types";

export type RunPhase = "starting" | "leads" | "spot_checks" | "done";
export const PHASES: { id: Exclude<RunPhase, "starting">; label: string }[] = [
  { id: "leads", label: "Following leads" },
  { id: "spot_checks", label: "Spot checks" },
  { id: "done", label: "Done" },
];

export type RunProgress = {
  phase: RunPhase;
  loans: number | null; // the portfolio size, from run_started
  spent: number; limit: number | null;
  cases: number; // leads Hazel opened
  spotChecks: number; // loans the sweep opened
  decided: number; // loans with a status
  flagged: number; // loans whose latest status is Investigate
  questionsWaiting: number;
  startedAt: number | null; finishedAt: number | null; // epoch ms
  stopReason: string | null;
};

export function runProgress(events: readonly RunEvent[]): RunProgress {
  const rows = [...events].sort((a, b) => a.seq - b.seq);
  const started = rows.find((e) => e.type === "run_started");
  const finished = rows.find((e) => e.type === "run_finished");
  const opened = rows.filter((e) => e.type === "lead_opened");
  const spot = opened.filter((e) => e.result?.sweep === true).length;
  const status = new Map<string, string>();
  for (const e of rows) if (e.type === "status_changed" && typeof e.result?.status === "string") for (const id of e.loan_ids) status.set(id, e.result.status);
  const asked = new Set(rows.filter((e) => e.type === "question_asked").map((e) => String(e.result?.question_id ?? e.seq)));
  for (const e of rows) if (e.type === "question_answered") asked.delete(String(e.result?.question_id));
  const last = rows.at(-1);
  const loans = started?.result?.loans;
  return {
    phase: finished ? "done" : spot > 0 ? "spot_checks" : opened.length ? "leads" : "starting",
    loans: typeof loans === "number" ? loans : null,
    spent: last?.budget.spent ?? 0, limit: last?.budget.limit ?? null,
    cases: opened.length - spot, spotChecks: spot,
    decided: status.size, flagged: [...status.values()].filter((s) => s === "Investigate").length,
    questionsWaiting: asked.size,
    startedAt: started ? Date.parse(started.ts) : null, finishedAt: finished ? Date.parse(finished.ts) : null,
    stopReason: finished && typeof finished.result?.stop_reason === "string" ? finished.result.stop_reason : null,
  };
}

/** 0:47, 1:06, 12:03 */
export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
