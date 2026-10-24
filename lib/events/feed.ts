// The board's only data input. A feed delivers a run's rows in seq order: history first, then new rows.
// Preview reads the fixture; replay and live (Supabase history + Realtime) will implement the same shape.
import { PREVIEW_EVENTS, PREVIEW_RUN_ID } from "./preview-run";
import type { RunEvent } from "./types";

export type FeedMode = "preview" | "replay" | "live";

export interface RunEventFeed {
  mode: FeedMode;
  runId: string;
  // Calls onEvents with batches of rows; returns an unsubscribe.
  subscribe(onEvents: (events: RunEvent[]) => void): () => void;
}

const bySeq = (a: RunEvent, b: RunEvent) => a.seq - b.seq;

// Delivers every fixture row at once on subscribe: no timers, so nothing on screen is a scripted step.
export function previewFeed(events: RunEvent[] = PREVIEW_EVENTS, runId = PREVIEW_RUN_ID): RunEventFeed {
  return {
    mode: "preview",
    runId,
    subscribe(onEvents) {
      onEvents([...events].sort(bySeq));
      return () => {};
    },
  };
}
