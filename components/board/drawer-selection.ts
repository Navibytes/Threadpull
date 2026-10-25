import type { BoardState } from "@/lib/events";
import type { LoanSource } from "@/components/drawer/loan-source";

// Resolves only existing event-backed cards. No reducer, status, or graph mutation happens here.
export function resolveDrawerSelection(board: BoardState, loanId: string, source: LoanSource["kind"]) {
  if (source === "preview") {
    return { cardId: null, message: `${loanId} is a synthetic drawer preview file, not part of this investigation.` };
  }
  if (board.cards.some((card) => card.id === loanId)) return { cardId: loanId, message: null };
  return { cardId: null, message: `${loanId} is not on the active investigation board. No card or connection was added.` };
}
