// The active case in five plain lines: who we are looking at, what was found, why it matters, what the evidence
// said, and what happens next. Every line is read from the board's recorded rows; where a row says nothing, the line
// says so instead of guessing.
import type { BoardState, BoardThread } from "./board-state";
import { notebookEntry } from "./hazel";
import { joinPhrases, loanName, NOT_PROOF_SHORT, sharedLabel, sharedPhrase } from "./plain";

export type CaseSummary = {
  who: string;
  found: string;
  why: string;
  evidence: string;
  next: string;
  sample: boolean; // some row in this case is simulated (made-up sample data)
  details: [string, string][]; // original ids and weights, for the expandable part
};

export function summarizeCase(board: BoardState, leadId: string | null): CaseSummary | null {
  if (!leadId) return null;
  const card = board.cards.find((c) => c.id === leadId);
  if (!card) return null;
  const links: BoardThread[] = board.threads.filter((t) => t.a === leadId || t.b === leadId);
  const other = (t: BoardThread) => (t.a === leadId ? t.b : t.a);
  const loans = [...new Set(links.map(other))];

  const spot = !!card.spotCheck && links.length === 0;
  const found =
    spot
      ? "A spot check of one of the largest unverified balances; no connection to another loan."
      : links.length === 0
      ? "No connections found yet."
      : loans.length === 1
        ? `Shares ${joinPhrases([...new Set(links.map((t) => sharedPhrase(t.kind)))])} with ${loanName(loans[0])}.`
        : `Shares ${joinPhrases([...new Set(links.map((t) => sharedPhrase(t.kind)))])} with ${loans.length} other loans.`;

  const explained = links.filter((t) => t.explained);
  const checks = board.events.filter((e) => e.type === "check_run" && e.loan_ids.includes(leadId)).length;
  const evidence = spot
    ? `${checks} check${checks === 1 ? "" : "s"} run on it; ${card.status === "Not reviewed" ? "no status yet" : `status: ${card.status}`}.`
    :
    explained.length > 0
      ? `Checked: ${explained[0].explained!.reason}. ${explained.length === links.length ? "An innocent explanation." : `${explained.length} of ${links.length} matches explained.`}`
      : checks > 0
        ? `${checks} check${checks === 1 ? "" : "s"} run so far; none has explained the match yet.`
        : links.length > 0
          ? "No check has been run on this match yet."
          : "Nothing to check yet.";

  // A recorded next step (a question waiting on someone, the run being over) wins; for a link or an explained
  // match the next step is just where to click, kept short so it fits the summary.
  const last = board.events.at(-1);
  const recorded = last && last.type !== "link_found" && last.type !== "clue_explained" ? (notebookEntry(board.events)?.next ?? null) : null;
  const next =
    recorded ??
    (links.some((t) => !t.explained)
      ? "Click the red thread to see its records."
      : links.length > 0
        ? "Click the pale dashed thread to see the check."
        : "No next step recorded yet.");

  const simulated = card.simulated || links.some((t) => t.simulated);
  return {
    who: loanName(leadId),
    found,
    why: spot ? "Not a suspicion: with no lead left, the run spends its remaining budget verifying the largest balances nobody had checked." : NOT_PROOF_SHORT,
    evidence,
    next,
    sample: simulated,
    details: [
      ["Original ID", leadId],
      ...links.map((t): [string, string] => [sharedLabel(t.kind), `${t.a} and ${t.b}, weight ${t.weight.toFixed(2)}${t.explained ? " (0 after explanation)" : ""}`]),
    ],
  };
}
