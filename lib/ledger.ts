// Acorn ledger (ticket 03): code enforces the budget, Claude never counts acorns (CLAUDE.md hard rule 1).
// A paid call is charged once, from TOOL_SPECS, and only when it succeeds; `onSpend` is where the `budget_spent` event is written.
import { toolError, TOOL_SPECS, type Cost, type SourceRef, type ToolName, type ToolResult } from "@/lib/contracts/tool-result";

export const DEFAULT_BUDGET = 60; // acorns per run (SKELETON §7)

/** Everything a `budget_spent` event row is built from. */
export type Spend = { tool: ToolName; cost: Cost; sources: SourceRef[]; simulated: boolean; budget: { spent: number; limit: number } };

export class Ledger {
  private used = 0;
  private readonly halted = new Map<string, string>();

  constructor(readonly limit = DEFAULT_BUDGET, private readonly onSpend: (spend: Spend) => void | Promise<void> = () => {}) {}

  get spent() { return this.used; }
  get remaining() { return this.limit - this.used; }

  /** A CRS answer ruled this loan out for the rest of the run (a deceased result): the loan-based CRS tools refuse it from now on. */
  halt(loanId: string, reason: string) {
    if (!this.halted.has(loanId)) this.halted.set(loanId, reason);
  }
  haltedBecause(loanId: string): string | undefined { return this.halted.get(loanId); }

  /**
   * Run one tool call under the budget. The cost is reserved before the call, so tool calls running in parallel
   * cannot overspend together, and given back if the call fails or throws. Free tools (0 acorns) emit no spend.
   */
  async run<T>(tool: ToolName, call: () => ToolResult<T> | Promise<ToolResult<T>>): Promise<ToolResult<T> | ToolResult<null>> {
    const { acorns } = TOOL_SPECS[tool];
    if (acorns > this.remaining) return toolError(tool, `over budget: ${tool} costs ${acorns} acorns, ${this.remaining} of ${this.limit} left`);
    this.used += acorns;
    let result: ToolResult<T>;
    try {
      result = await call();
    } catch (e) {
      this.used -= acorns;
      throw e;
    }
    if (!result.ok) {
      this.used -= acorns;
      return result;
    }
    if (acorns > 0) {
      await this.onSpend({ tool, cost: result.cost, sources: result.sources, simulated: result.simulated, budget: { spent: this.used, limit: this.limit } });
    }
    return result;
  }
}
