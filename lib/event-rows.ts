// Event rows for the acorn ledger and CRS recovery (ticket 03, SKELETON §8). Pure mappers: whoever appends events
// stamps run_id, seq and ts, so a row is an Event without those three.
import type { Budget, Event } from "@/lib/contracts/event";
import type { ToolName } from "@/lib/contracts/tool-result";
import type { CrsEndpoint, CrsRecovery } from "@/lib/crs";
import type { Spend } from "@/lib/ledger";

export type EventRow = Omit<Event, "run_id" | "seq" | "ts">;

/** `budget_spent`: one paid call. Wire it as `new Ledger(60, (spend) => append(budgetSpentRow(spend, { loan_ids })))`. */
export function budgetSpentRow(spend: Spend, opts: { loan_ids?: string[] } = {}): EventRow {
  const { acorns, unit } = spend.cost;
  return {
    type: "budget_spent",
    loan_ids: opts.loan_ids ?? [],
    tool: spend.tool,
    result: { acorns, unit },
    sources: spend.sources,
    note: `${spend.tool} cost ${acorns} ${acorns === 1 ? "acorn" : "acorns"} (${unit}).`,
    budget: spend.budget,
    simulated: spend.simulated,
  };
}

const TOOL_OF: Record<CrsEndpoint, ToolName> = {
  tu_identity: "crs_identity_check",
  credit_tu: "crs_credit_report",
  credit_efx: "crs_credit_report",
  credit_exp: "crs_credit_report",
  fraud_finder: "crs_fraud_finder",
  reverse_phone: "crs_reverse_phone",
};

/** `recovery`: CRS answered 429 and the client is waiting out Retry-After. Wire it as `createCrsClient({ onRecovery })`. */
export function recoveryRow(info: CrsRecovery, budget: Budget, opts: { loan_ids?: string[] } = {}): EventRow {
  return {
    type: "recovery",
    loan_ids: opts.loan_ids ?? [],
    tool: TOOL_OF[info.endpoint],
    result: { endpoint: info.endpoint, status: info.status, wait_ms: info.wait_ms, attempt: info.attempt },
    sources: [],
    note: `CRS rate-limited ${info.endpoint}; waiting ${info.wait_ms / 1000}s before retry ${info.attempt}.`,
    budget,
    simulated: false,
  };
}
