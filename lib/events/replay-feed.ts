// Replay: a recorded run's rows played back in order, spaced like the original (clamped, and sped up by `speed`), so
// the board, Hazel and her thought bubble can be shown without running the agent or spending any budget. Nothing is
// scripted: every step on screen is still a recorded event row. Nothing counts as history, so every row animates.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FeedMode, RunEventFeed } from "./feed";
import { EventSchema, type RunEvent } from "./types";

export type Schedule = (fn: () => void, ms: number) => () => void;
const timer: Schedule = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

// Gaps between rows are clamped: parallel tool calls land together (play them a beat apart), and a long thinking pause
// is not worth waiting for in a demo.
export const REPLAY_GAP = { minMs: 120, maxMs: 2500 } as const;

/** How long to wait between two rows: their recorded gap, clamped, divided by the speed. */
export function replayGapMs(prev: RunEvent, next: RunEvent, speed: number): number {
  const raw = Date.parse(next.ts) - Date.parse(prev.ts);
  const gap = Number.isFinite(raw) ? raw : 0;
  return Math.min(REPLAY_GAP.maxMs, Math.max(REPLAY_GAP.minMs, gap)) / Math.max(0.1, speed);
}

type Options = { speed?: number; mode?: FeedMode; schedule?: Schedule };

/** `mode` is "replay" for a recorded run, and "preview" when the rows are a hand-written sample (so the room keeps saying so). */
export function replayFeed(rows: RunEvent[], runId: string, { speed = 1, mode = "replay", schedule = timer }: Options = {}): RunEventFeed {
  return {
    mode,
    runId,
    subscribe(onEvents, _onError, _onReset, onHistory) {
      const sorted = [...rows].sort((a, b) => a.seq - b.seq);
      onHistory?.(0); // nothing has happened yet: every row plays
      let i = 0;
      let cancel = () => {};
      const next = () => {
        const row = sorted[i++];
        if (!row) return;
        onEvents([row]);
        if (i < sorted.length) cancel = schedule(next, replayGapMs(row, sorted[i], speed));
      };
      cancel = schedule(next, 0);
      return () => cancel();
    },
  };
}

/** Replay a run recorded in the Supabase `events` table: read its rows once, then play them back. */
export function supabaseReplayFeed(client: SupabaseClient, runId: string, opts: Omit<Options, "mode"> = {}): RunEventFeed {
  return {
    mode: "replay",
    runId,
    subscribe(onEvents, onError = () => {}, onReset = () => {}, onHistory = () => {}) {
      let stop = () => {};
      let closed = false;
      void (async () => {
        const { data, error } = await client.from("events").select("*").eq("run_id", runId).order("seq", { ascending: true }).limit(5000);
        if (closed) return;
        if (error) return onError(`Couldn't read the run's events: ${error.message}`);
        const rows = (data ?? []).flatMap((row) => {
          const r = EventSchema.safeParse(row);
          if (r.success) return [r.data];
          onError(`Event row seq ${String((row as { seq?: unknown }).seq)} doesn't match the event contract: ${r.error.issues[0]?.message}`);
          return [];
        });
        if (rows.length === 0) return onError(`No rows were found for run ${runId}.`);
        stop = replayFeed(rows, runId, opts).subscribe(onEvents, onError, onReset, onHistory);
      })();
      return () => {
        closed = true;
        stop();
      };
    },
  };
}
