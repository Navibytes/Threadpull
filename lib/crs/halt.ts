// Deceased halt (ticket 06): once a CRS answer says a loan's SSN belongs to a deceased person, the loan-based CRS tools stop
// sending requests for it. Only that loan is halted; the ledger belongs to one run, so the next run starts fresh.
import { toolError, type ToolName, type ToolResult } from "@/lib/contracts/tool-result";
import type { Ledger } from "@/lib/ledger";

/** TransUnion identity code for a deceased SSN (CLAUDE.md). The credit report says the same through its own error. */
export const DECEASED_CODE = "2301";

/** A refusal (nothing sent, nothing charged) when an earlier answer halted this loan; undefined when the call may go ahead. */
export function refuseIfHalted(tool: ToolName, loanId: string, ledger: Ledger): ToolResult<null> | undefined {
  const why = ledger.haltedBecause(loanId);
  return why ? toolError(tool, `halted, nothing sent: ${why}`) : undefined;
}
