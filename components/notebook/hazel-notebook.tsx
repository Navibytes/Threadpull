"use client";

import { hazelPose, notebookEntry, type BoardState, type FeedMode, type HazelPose } from "@/lib/events";

const POSE_LABEL: Record<HazelPose, string> = {
  idle: "Waiting",
  thinking: "Running a check",
  discovery: "Found a link",
  resolved: "Explained a clue",
};

// Hazel's notebook: her latest step, read only from the run's applied event rows. Hazel herself stands on
// the board (HazelStanding); the pose line here is the text equivalent of her picture.
export function HazelNotebook({ board, mode }: { board: BoardState; mode: FeedMode }) {
  const { pose, seq: poseSeq } = hazelPose(board.events);
  const entry = notebookEntry(board.events);
  // A PREVIEW row's budget is part of a hand-written fixture, not a measured spend.
  const budget = entry && mode !== "preview" ? entry.budget : null;

  return (
    <section
      aria-label="Hazel's notebook"
      className="notebook-paper shrink-0 rounded-lg pb-3 pl-6 pr-4 pt-3 shadow-[0_18px_30px_-16px_rgb(0_0_0/0.65),0_3px_8px_rgb(0_0_0/0.35)]"
    >
      <div>
        <div>
          {/* titled by the side panel it opens in */}
          <p className="text-sm font-medium" aria-live="polite">
            {POSE_LABEL[pose]}
          </p>
          {entry ? (
            <details className="mt-1 text-xs text-walnut/80">
              <summary className="cursor-pointer">Technical details</summary>
              <p className="mt-1">
                Latest event: <span className="font-medium text-walnut">{entry.type}</span>
                {entry.tool && <> · {entry.tool}</>}
                {entry.loanIds.length > 0 && <> · {entry.loanIds.join(", ")}</>}{" "}
                <span className="whitespace-nowrap">· seq {entry.seq}</span>
                {poseSeq !== null && <> · pose from seq {poseSeq}</>}
                {entry.simulated && <> · simulated (made-up sample data)</>}
              </p>
            </details>
          ) : (
            <p className="mt-1 text-xs text-walnut/80">Nothing has happened yet.</p>
          )}
        </div>
      </div>

      <dl className="mt-2.5 space-y-2 text-[13px] leading-snug">
        {/* only what the row's own fields support; otherwise it says there isn't enough to go on */}
        <Note label="What I found" text={entry?.saw} empty="Nothing recorded yet." />
        <Note label="Why it matters" text={entry?.why} empty="This event doesn't record enough to say." />
        <Note label="What's next" text={entry?.next} empty="No next step is recorded yet." />
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
            no budget recorded yet
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
