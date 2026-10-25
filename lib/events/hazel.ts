// What Hazel's avatar and notebook show, read only from the run's applied event rows (in seq order).
// Nothing here makes up a claim: a field the event doesn't carry stays null and the UI says so.
import { ClueExplainedResultSchema } from "@/lib/contracts/event";
import { loanName, NOT_PROOF, sharedPhrase } from "./plain";
import type { RunEvent } from "./types";

export const HAZEL_POSES = ["idle", "thinking", "discovery", "resolved"] as const;
export type HazelPose = (typeof HAZEL_POSES)[number];

// The only event types that change the pose. Everything else leaves the last pose in place, except
// run_finished, which settles her (see hazelState).
export const POSE_FOR_EVENT: Partial<Record<RunEvent["type"], HazelPose>> = {
  check_run: "thinking",
  link_found: "discovery",
  clue_explained: "resolved",
};

// Whole-sprite reactions (the artwork is a flat PNG, so nothing moves on its own): she leans toward the board
// for a check, perks up at a link, nods when a clue is explained. run_finished only settles the pose.
export type HazelReaction = "lean" | "perk" | "nod" | "settle";
export const REACTION_FOR_EVENT: Partial<Record<RunEvent["type"], HazelReaction>> = {
  check_run: "lean",
  link_found: "perk",
  clue_explained: "nod",
  run_finished: "settle",
};

// `cue`: the reaction to play now, or null. Its key is the row's identity (run and seq), so the same row never
// plays twice however often the board re-renders, and a reloaded page doesn't replay history: rows at or below
// `animateAfterSeq` (history when the board loaded) set the pose without a reaction.
export type HazelState = {
  pose: HazelPose;
  seq: number | null; // the row that set the pose
  cue: { kind: HazelReaction; key: string } | null;
};

// Deterministic: the same applied rows and the same animateAfterSeq give the same state. A replay that has
// applied rows up to its cursor gets exactly the state of that cursor.
export function hazelState(events: RunEvent[], animateAfterSeq = Number.POSITIVE_INFINITY): HazelState {
  for (let i = events.length - 1; i >= 0; i--) {
    const e = events[i];
    const kind = REACTION_FOR_EVENT[e.type];
    if (!kind) continue;
    // Once the run is over no check is running, so a leftover "thinking" settles to idle. A discovery or a
    // resolved clue still describes the board, so that pose stays.
    const pose =
      e.type === "run_finished" ? (lastPose(events, i) === "thinking" ? "idle" : lastPose(events, i)) : POSE_FOR_EVENT[e.type]!;
    const cue = e.seq > animateAfterSeq ? { kind, key: `${e.run_id}:${e.seq}` } : null;
    return { pose, seq: e.seq, cue };
  }
  return { pose: "idle", seq: null, cue: null };
}

function lastPose(events: RunEvent[], before: number): HazelPose {
  for (let i = before - 1; i >= 0; i--) {
    const pose = POSE_FOR_EVENT[events[i].type];
    if (pose) return pose;
  }
  return "idle";
}

// The pose set by the latest pose-changing row; idle until there is one.
export function hazelPose(events: RunEvent[]): { pose: HazelPose; seq: number | null } {
  const { pose, seq } = hazelState(events);
  return { pose, seq };
}

export type NotebookEntry = {
  seq: number;
  ts: string;
  type: RunEvent["type"];
  tool: string | null;
  loanIds: string[];
  simulated: boolean;
  saw: string | null; // the row's own note, or a finding read from its fields
  why: string | null; // an interpretation the row's own fields support, or null
  next: string | null; // a check or user action the row's own fields make known, or null
  budget: RunEvent["budget"];
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const words = (s: string) => s.replace(/_/g, " ");

// What the row itself says she saw: her note; for a link with no note, the link's own fields.
function saw(e: RunEvent): string | null {
  const note = e.note.trim();
  if (note) return note;
  if (e.type === "link_found" && e.loan_ids.length >= 2 && str(e.result.kind))
    return `${loanName(e.loan_ids[0])} and ${loanName(e.loan_ids[1])} share ${sharedPhrase(str(e.result.kind)!)}.`;
  return null;
}

// Why it matters, only where the row's fields carry it. Anything else stays null ("Not recorded").
function why(e: RunEvent): string | null {
  switch (e.type) {
    case "link_found": {
      const kind = str(e.result.kind);
      if (!kind) return null;
      // hard rule 4: a shared attribute counts in proportion to how rare it is; a connection is not proof
      return `${NOT_PROOF} The rarer ${sharedPhrase(kind)} is across all the loans, the more it counts.`;
    }
    case "clue_explained": {
      const r = ClueExplainedResultSchema.safeParse(e.result);
      if (!r.success) return null;
      const by = r.data.explained_by === "rule" ? `rule ${r.data.rule_id}` : words(r.data.explained_by);
      return `This looked suspicious but has an innocent explanation: ${r.data.reason} (${by}). The shared detail stays on the board as a fact.`;
    }
    case "status_changed": {
      const status = str(e.result.status), reason = str(e.result.reason);
      if (!status || !reason || e.loan_ids.length === 0) return null;
      return `${loanName(e.loan_ids[0])} is now ${status}: ${reason}`;
    }
    case "attack_detected":
      // hard rule 5: document text is data; the row exists because injected text was refused
      return "Instructions found in a document were treated as data and changed nothing.";
    default:
      return null;
  }
}

// Next, only when the row makes it known: who a question waits on, or what you can do on the board now.
function next(e: RunEvent): string | null {
  switch (e.type) {
    case "question_asked": {
      const to = str(e.result.to);
      return to ? `Waiting for an answer from ${words(to)}.` : null;
    }
    case "link_found":
      return e.loan_ids.length >= 2 ? "Click the red thread to see the records behind this match." : null;
    case "clue_explained":
      return "Click the pale dashed thread to see which check explained it.";
    case "run_finished":
      return "The run is over; no further checks are planned in it.";
    default:
      return null;
  }
}

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
    saw: saw(e),
    why: why(e),
    next: next(e),
    budget: e.budget,
  };
}
