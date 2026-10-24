// What Hazel's avatar and notebook show, read only from the run's applied event rows (in seq order).
// Nothing here makes up a claim: a field the event doesn't carry stays null and the UI says so.
import type { RunEvent } from "./types";

export const HAZEL_POSES = ["idle", "thinking", "discovery", "resolved"] as const;
export type HazelPose = (typeof HAZEL_POSES)[number];

// The only event types that change the pose. Everything else leaves the last pose in place.
export const POSE_FOR_EVENT: Partial<Record<RunEvent["type"], HazelPose>> = {
  check_run: "thinking",
  link_found: "discovery",
  clue_explained: "resolved",
};

// The pose set by the latest pose-changing row; idle until there is one.
export function hazelPose(events: RunEvent[]): { pose: HazelPose; seq: number | null } {
  for (let i = events.length - 1; i >= 0; i--) {
    const pose = POSE_FOR_EVENT[events[i].type];
    if (pose) return { pose, seq: events[i].seq };
  }
  return { pose: "idle", seq: null };
}

export type NotebookEntry = {
  seq: number;
  ts: string;
  type: RunEvent["type"];
  tool: string | null;
  loanIds: string[];
  simulated: boolean;
  saw: string | null; // the row's own note
  why: string | null; // no event field for this yet (docs/contracts-event-review.md, question 7)
  next: string | null; // no event field for this yet (same question)
  budget: RunEvent["budget"];
};

// Hazel's latest step: the last applied row, whatever its type.
export function notebookEntry(events: RunEvent[]): NotebookEntry | null {
  const e = events.at(-1);
  if (!e) return null;
  return {
    seq: e.seq,
    ts: e.ts,
    type: e.type,
    tool: e.tool,
    loanIds: e.loan_ids,
    simulated: e.simulated,
    saw: e.note.trim() || null,
    why: null,
    next: null,
    budget: e.budget,
  };
}
