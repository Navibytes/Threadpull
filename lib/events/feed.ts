// The board's only data input. A feed delivers a run's rows in seq order: history first, then new rows.
// Preview reads the hand-written fixture; live reads Supabase (supabase-feed.ts); replay will follow.
import { PREVIEW_EVENTS, PREVIEW_RUN_ID } from "./preview-run";
import type { RunEvent } from "./types";

export type FeedMode = "preview" | "replay" | "live";

export interface RunEventFeed {
  mode: FeedMode;
  runId: string;
  // Calls onEvents with batches of rows in seq order, onError with readable problems, onReset when the
  // board must be rebuilt from scratch (the rows that follow start again at the run's first seq), and
  // onHistory once the rows recorded so far have been delivered (again after each reset), with the last
  // seq delivered (0 if none). Rows after that point are new. Returns an unsubscribe.
  subscribe(
    onEvents: (events: RunEvent[]) => void,
    onError?: (message: string) => void,
    onReset?: () => void,
    onHistory?: (lastSeq: number) => void,
  ): () => void;
}

const bySeq = (a: RunEvent, b: RunEvent) => a.seq - b.seq;

// Delivers every fixture row at once on subscribe: no timers, so nothing on screen is a scripted step.
export function previewFeed(events: RunEvent[] = PREVIEW_EVENTS, runId = PREVIEW_RUN_ID): RunEventFeed {
  return {
    mode: "preview",
    runId,
    subscribe(onEvents, _onError, _onReset, onHistory) {
      const rows = [...events].sort(bySeq);
      onEvents(rows);
      onHistory?.(rows.at(-1)?.seq ?? 0);
      return () => {};
    },
  };
}
