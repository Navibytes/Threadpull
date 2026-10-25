// "Hazel's Case Notes": what we found, what it means, what's next, written only from the run's own figures. A
// line appears only when the figures support it; with no run the notes say so instead of guessing. Nothing here
// scores, predicts or judges a borrower, and a connection is always called a lead, never proof.
import { NOT_PROOF, sharedLabel } from "@/lib/events";
import type { RunMetrics } from "./metrics";

export type CaseNotes = { found: string[]; means: string[]; next: string[] };

const n = (x: number) => x.toLocaleString("en-US");
const plural = (x: number, one: string, many = `${one}s`) => `${n(x)} ${x === 1 ? one : many}`;

export function caseNotes(run: RunMetrics | null, opts: { sample: boolean }): CaseNotes | null {
  if (!run) return null;
  const open = run.linksFound - run.linksExplained;
  const kinds = Object.entries(run.linkKinds).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const found = [
    `Hazel opened ${plural(run.casesInvestigated, "case")} and ran ${plural(run.checks, "check")}${run.crsChecks ? `, ${n(run.crsChecks)} of them with a CRS lookup` : ""}.`,
    run.linksFound === 0
      ? "She has not found any connections between loans yet."
      : `She found ${plural(run.linksFound, "connection")} between loans: ${kinds.map(([k, c]) => `${sharedLabel(k).toLowerCase()} (${n(c)})`).join(", ")}.`,
  ];

  const means = [
    run.linksFound === 0 ? "With no connections yet, there is nothing to weigh." : NOT_PROOF,
    ...(run.linksFound > 0
      ? [
          run.linksExplained === 0
            ? "No connection has an explanation yet."
            : `${plural(run.linksExplained, "connection")} ${run.linksExplained === 1 ? "has" : "have"} an innocent explanation backed by a cited check${open > 0 ? `; ${n(open)} still ${open === 1 ? "has" : "have"} none` : ""}.`,
        ]
      : []),
    ...(run.budget ? [`${n(run.budget.spent)} of ${n(run.budget.limit)} acorns of the checking budget used.`] : []),
    ...(opts.sample
      ? ["This is the built-in sample run, so none of this is a result."]
      : run.simulatedRows > 0
        ? [`${n(run.simulatedRows)} of ${n(run.rows)} rows are simulated sample data, so treat this as a demonstration.`]
        : []),
  ];

  const next = [
    open > 0
      ? `${plural(open, "connection")} still ${open === 1 ? "needs" : "need"} an explanation. Open the board to see the records behind ${open === 1 ? "it" : "them"}.`
      : run.linksFound > 0
        ? "Every connection found has an explanation."
        : "Nothing to follow up on from this run yet.",
    run.dispositions === 0 ? "No human decision is recorded yet. A person approves any decision." : `${plural(run.dispositions, "loan")} ${run.dispositions === 1 ? "has" : "have"} a recorded human decision.`,
    ...(run.finished ? [] : ["This run has not finished, so these notes may change."]),
  ];

  return { found, means, next };
}

// The short version for the top of the page: a headline and two sentences, what Hazel did and what is still unknown. Same
// rule as the full notes: every clause is read from the run's own figures, and nothing says a connection is fraud. (That
// the run is a sample is said once, in the page's sample notice, not repeated here.)
export type Briefing = { headline: string; found: string; unknown: string };

export function briefing(run: RunMetrics | null): Briefing | null {
  if (!run) return null;
  const open = run.linksFound - run.linksExplained;
  const kinds = Object.entries(run.linkKinds).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const headline =
    run.linksFound === 0
      ? `No connections found yet across ${plural(run.casesInvestigated, "case")}.`
      : `${plural(run.linksFound, "connection")} found across ${plural(run.casesInvestigated, "case")}: ${n(run.linksExplained)} explained by a cited check, ${n(open)} still open.`;
  const found =
    run.linksFound === 0
      ? `Hazel ran ${plural(run.checks, "check")} so far and has not found any connections.`
      : `She ran ${plural(run.checks, "check")} and linked loans by ${kinds.map(([k, c]) => `${sharedLabel(k).toLowerCase()} (${n(c)})`).join(" and ")}.`;
  const unknown = [
    open > 0
      ? `${plural(open, "connection")} ${open === 1 ? "has" : "have"} no explanation yet, and a shared detail is a lead to check, not proof.`
      : run.linksFound > 0
        ? "Every connection found has an explanation."
        : "There is nothing to weigh yet.",
    ...(run.finished ? [] : ["This run has not finished."]),
  ].join(" ");
  return { headline, found, unknown };
}
