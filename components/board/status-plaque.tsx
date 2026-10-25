"use client";

import { notebookEntry, type BoardState, type FeedMode } from "@/lib/events";
import type { BoardCase } from "./board-camera";
import { ModeBadge } from "./mode-badge";

// The room's small persistent status: where the data comes from, the active case, and the acorn budget.
// The budget is shown only when a real (LIVE or REPLAY) row carries it; a PREVIEW fixture's budget is not a spend.
export function StatusPlaque({
  board,
  mode,
  runId,
  cases,
  activeCase,
}: {
  board: BoardState;
  mode: FeedMode;
  runId: string;
  cases: BoardCase[];
  activeCase: number | null;
}) {
  const entry = notebookEntry(board.events);
  const budget = entry && mode !== "preview" ? entry.budget : null;
  const active = activeCase !== null ? cases[activeCase] : undefined;
  return (
    <section aria-label="Investigation status" className="flex shrink-0 flex-col gap-1 text-[13px]">
      <div className="flex items-center gap-3">
        <h1 className="font-display text-xl font-semibold leading-none text-walnut">Threadpull</h1>
        <ModeBadge mode={mode} runId={runId} />
      </div>
      <p className="whitespace-nowrap text-walnut/85">
        {active ? (
          <>
            Case <span className="font-semibold text-walnut">{active.lead}</span>
            {cases.length > 1 && ` (${activeCase! + 1} of ${cases.length})`}
          </>
        ) : (
          "No case open yet"
        )}
        <span aria-hidden className="mx-2 text-walnut/35">·</span>
        Budget{" "}
        {budget ? (
          <span className="font-semibold text-walnut">
            {budget.spent} of {budget.limit} acorns
          </span>
        ) : mode === "preview" ? (
          "not tracked in PREVIEW"
        ) : (
          "not recorded yet"
        )}
      </p>
    </section>
  );
}
