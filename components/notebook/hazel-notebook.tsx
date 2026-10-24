"use client";

import { hazelPose, notebookEntry, type BoardState, type FeedMode, type HazelPose } from "@/lib/events";
import { HazelAvatar } from "./hazel-avatar";

const POSE_LABEL: Record<HazelPose, string> = {
  idle: "Waiting",
  thinking: "Running a check",
  discovery: "Found a link",
  resolved: "Explained a clue",
};

// Hazel's notebook: her pose and her latest step, read only from the run's applied event rows.
export function HazelNotebook({ board, mode }: { board: BoardState; mode: FeedMode }) {
  const { pose, seq: poseSeq } = hazelPose(board.events);
  const entry = notebookEntry(board.events);
  // A PREVIEW row's budget is part of a hand-written fixture, not a measured spend.
  const budget = entry && mode !== "preview" ? entry.budget : null;

  return (
    <section
      aria-label="Hazel's notebook"
      className="notebook-paper shrink-0 rounded-lg border border-walnut/15 pb-3 pl-6 pr-4 pt-3 shadow-[0_2px_10px_rgb(74_55_40/0.12)]"
    >
      <div className="flex items-start gap-3">
        <HazelAvatar pose={pose} />
        <div className="min-w-0 flex-1 pt-1">
          <h2 className="font-display text-lg font-semibold leading-tight">Hazel&rsquo;s notebook</h2>
          <p className="mt-0.5 text-sm font-medium" aria-live="polite">
            {POSE_LABEL[pose]}
            {poseSeq !== null && <span className="whitespace-nowrap font-normal text-walnut/80"> · seq {poseSeq}</span>}
          </p>
          {entry ? (
            <p className="mt-1 text-xs text-walnut/80">
              Latest: <span className="font-medium text-walnut">{entry.type}</span>
              {entry.tool && <> · {entry.tool}</>}
              {entry.loanIds.length > 0 && <> · {entry.loanIds.join(", ")}</>}{" "}
              <span className="whitespace-nowrap">· seq {entry.seq}</span>
              {entry.simulated && (
                <span className="ml-1.5 rounded-sm bg-honey/25 px-1 py-px text-[10px] font-semibold tracking-[0.08em] text-walnut">
                  SIMULATED
                </span>
              )}
            </p>
          ) : (
            <p className="mt-1 text-xs text-walnut/80">No events yet.</p>
          )}
        </div>
      </div>

      <dl className="mt-2.5 space-y-2 text-[13px] leading-snug">
        <Note label="What I saw" text={entry?.saw} empty="Nothing recorded yet." />
        <Note label="Why it matters" text={entry?.why} empty="Not recorded in this event." />
        <Note label="What's next" text={entry?.next} empty="Not recorded in this event." />
      </dl>

      <p className="mt-2.5 border-t border-dashed border-walnut/20 pt-2 text-xs">
        <span className="font-medium">Budget </span>
        {budget ? (
          <span>
            {budget.spent} of {budget.limit} acorns spent
            <span className="text-walnut/80"> · from seq {entry?.seq}</span>
          </span>
        ) : (
          <span className="text-walnut/80">
            {mode === "preview" ? "not tracked in PREVIEW" : "no budget recorded yet"}
          </span>
        )}
      </p>
    </section>
  );
}

function Note({ label, text, empty }: { label: string; text: string | null | undefined; empty: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-walnut/80">{label}</dt>
      <dd className={text ? "" : "italic text-walnut/80"}>{text ?? empty}</dd>
    </div>
  );
}
