// What Hazel's thought bubble and verdict stamp say, and when. Pure: no React, no clock of its own.
// Everything shown is read from a recorded event row (worded by the same describeEvent the audit log uses); a row
// that says little produces little. Her private reasoning is not in the log, so it is not shown: a "thought" here
// is what she is doing now, and a "verdict" is a conclusion she recorded (a lead closed with a status, or a thread
// taken down by a cited check).
import { ClueExplainedResultSchema } from "@/lib/contracts/event";
import { LOAN_STATUSES, type LoanStatus } from "@/lib/contracts/loan";
import { describeEvent } from "@/lib/dashboard/describe";
import { joinPhrases, loanName, type RunEvent } from "@/lib/events";

export type Stage = "lead" | "check" | "link" | "rule" | "ask" | "warning" | "drop" | "recover" | "done";

export const STAGE_LABEL: Record<Stage, string> = {
  lead: "Opening a lead",
  check: "Running a check",
  link: "Found a connection",
  rule: "Applying a saved rule",
  ask: "Waiting on a person",
  warning: "Ignoring hidden instructions",
  drop: "Dropping a lead",
  recover: "Recovering",
  done: "Finished",
};

const STAGE_FOR: Partial<Record<RunEvent["type"], Stage>> = {
  lead_opened: "lead",
  check_run: "check",
  link_found: "link",
  rule_applied: "rule",
  question_asked: "ask",
  question_answered: "ask",
  attack_detected: "warning",
  lead_dropped: "drop",
  recovery: "recover",
  run_finished: "done",
};

// Opening a lead and running a check happen constantly; when the bubble falls behind these are the steps it skips.
const ROUTINE: ReadonlySet<Stage> = new Set(["lead", "check"]);

export type Thought = {
  key: string; // the row's identity: a row is never shown twice
  seq: number;
  stage: Stage;
  title: string;
  detail: string | null;
  acorns: { spent: number; limit: number } | null;
  simulated: boolean;
};

export type Verdict = {
  key: string;
  seq: number;
  kind: "status" | "explained";
  label: string; // the exact status word, or "Explained"
  status: LoanStatus | null;
  names: string; // the loan(s) it is about, in plain words
  reason: string | null; // her own reason when the row carries one
  cited: string | null; // for an explanation, the check or rule that explains it
  simulated: boolean;
};

const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const words = (s: string) => s.replace(/_/g, " ");
const isStatus = (s: unknown): s is LoanStatus => typeof s === "string" && s !== "Not reviewed" && (LOAN_STATUSES as readonly string[]).includes(s);
const rowKey = (e: RunEvent) => `${e.run_id}:${e.seq}`;

/** A row as a step in what Hazel is doing, or null for bookkeeping and for rows that are conclusions (see verdictFor). */
export function thoughtFor(e: RunEvent): Thought | null {
  const stage = STAGE_FOR[e.type];
  if (!stage) return null;
  const d = describeEvent(e);
  // "inspect_loan ran." is the log's own boilerplate, not something she said
  const detail = d.detail && !/^\w+ ran\.?$/.test(d.detail) ? d.detail : null;
  return { key: rowKey(e), seq: e.seq, stage, title: d.title, detail, acorns: e.budget ?? null, simulated: e.simulated };
}

/** A conclusion: a lead closed with a supported status, or a thread taken down with its cited check. */
export function verdictFor(e: RunEvent): Verdict | null {
  if (e.type === "status_changed") {
    const status = e.result.status;
    if (!isStatus(status) || e.loan_ids.length === 0) return null;
    return {
      key: rowKey(e), seq: e.seq, kind: "status", label: status, status,
      names: e.loan_ids.map(loanName).join(", "), reason: str(e.result.reason) ?? (e.note.trim() || null), cited: null, simulated: e.simulated,
    };
  }
  if (e.type === "clue_explained") {
    const r = ClueExplainedResultSchema.safeParse(e.result);
    if (!r.success) return null;
    const by = r.data.explained_by === "rule" ? `rule ${r.data.rule_id}` : words(r.data.explained_by);
    return {
      key: rowKey(e), seq: e.seq, kind: "explained", label: "Explained", status: null,
      names: joinPhrases(e.loan_ids.map(loanName)), reason: r.data.reason, cited: by, simulated: e.simulated,
    };
  }
  return null;
}

// How long each thing stays up. A connection or a conclusion lingers; routine steps flash by; and when the run is
// producing rows faster than they can be read, dwell shrinks and routine steps are skipped rather than queued.
export const PACE = {
  thoughtMs: 650,
  lingerMs: 1100,
  hurriedMs: 380,
  verdictMs: 3800,
  verdictHurriedMs: 1600,
  idleMs: 3500, // after the last step, the bubble fades
  maxBacklog: 4,
} as const;

export type ThoughtView = { thought: Thought | null; verdict: Verdict | null };
type Slot<T> = { item: T; until: number };

export class ThoughtQueue {
  private thoughts: Thought[] = [];
  private verdicts: Verdict[] = [];
  private thought: Slot<Thought> | null = null;
  private verdict: Slot<Verdict> | null = null;
  /** routine steps dropped because the run outran the bubble */
  skipped = 0;

  push(rows: RunEvent[]) {
    for (const row of rows) {
      const v = verdictFor(row);
      if (v) this.verdicts.push(v);
      const t = thoughtFor(row);
      if (t) this.thoughts.push(t);
    }
    while (this.thoughts.length > PACE.maxBacklog) {
      const i = this.thoughts.findIndex((t) => ROUTINE.has(t.stage));
      if (i < 0) break; // only connections and warnings left: keep them all
      this.thoughts.splice(i, 1);
      this.skipped++;
    }
  }

  get pending() {
    return this.thoughts.length + this.verdicts.length;
  }

  /** What to show at `now` (milliseconds on any monotonic clock). Call as often as you like; it only advances on schedule. */
  tick(now: number): ThoughtView {
    if (this.verdict && now >= this.verdict.until) this.verdict = null;
    if (!this.verdict && this.verdicts.length) {
      const item = this.verdicts.shift()!;
      this.verdict = { item, until: now + (this.verdicts.length > 0 ? PACE.verdictHurriedMs : PACE.verdictMs) };
    }
    if ((!this.thought || now >= this.thought.until) && this.thoughts.length) {
      const item = this.thoughts.shift()!;
      const dwell = this.thoughts.length > 2 ? PACE.hurriedMs : item.stage === "link" || item.stage === "warning" ? PACE.lingerMs : PACE.thoughtMs;
      this.thought = { item, until: now + dwell };
    } else if (this.thought && this.thoughts.length === 0 && now >= this.thought.until + PACE.idleMs) {
      this.thought = null;
    }
    return { thought: this.thought?.item ?? null, verdict: this.verdict?.item ?? null };
  }
}
