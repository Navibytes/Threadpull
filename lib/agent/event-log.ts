// One run's event log (SKELETON §8): every row the board will draw, in order. The log stamps run_id, a contiguous
// seq (1, 2, 3, …) and ts, takes the budget from the ledger, and validates each row against C's event contract
// before any sink sees it. Sinks: memory (tests, replay), JSONL file (runs/<run_id>/events.jsonl); Supabase later.
import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { EventSchema, type Budget, type Event } from "@/lib/contracts/event";
import type { EventRow } from "@/lib/event-rows";

export type EventSink = (event: Event) => void | Promise<void>;
export type NewEvent = Omit<EventRow, "budget"> & { budget?: Budget };

/** Hazel's notes stay short: at most two sentences, at most 280 characters (code enforces it, not the prompt). */
export function clampNote(note: string): string {
  // a sentence ends at . ! or ? followed by a space or the end, so a number like 3.4352 or 0.25 is never cut in two
  const sentences = note.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  const two = sentences.slice(0, 2).join(" ");
  return two.length > 280 ? `${two.slice(0, 279).trimEnd()}…` : two;
}

export class EventLog {
  private readonly events: Event[] = [];

  constructor(readonly runId: string, private readonly budget: () => Budget, private readonly sinks: EventSink[] = [],
    private readonly now: () => Date = () => new Date()) {}

  get rows(): readonly Event[] { return this.events; }
  get last(): Event | undefined { return this.events[this.events.length - 1]; }

  /** Append one row. The seq is taken synchronously, so rows from overlapping tool calls never share or skip a number. */
  async append(row: NewEvent): Promise<Event> {
    const event = EventSchema.parse({
      run_id: this.runId, seq: this.events.length + 1, ts: this.now().toISOString(),
      ...row, note: clampNote(row.note), budget: row.budget ?? this.budget(),
    });
    this.events.push(event);
    for (const sink of this.sinks) await sink(event);
    return event;
  }
}

export const memorySink = (into: Event[]): EventSink => (e) => { into.push(e); };

/** The slice of a Supabase client this sink needs (so tests can pass a fake). */
export type EventsTable = { from(table: "events"): { insert(row: Event): PromiseLike<{ error: { message: string } | null }> } };

/**
 * Insert each row into the Supabase `events` table (insert-only; the board follows it over Realtime).
 * A failed insert doesn't stop the run: it's passed to onError, and the row stays in the other sinks.
 */
export function supabaseSink(client: EventsTable, onError: (event: Event, message: string) => void): EventSink {
  return async (e) => {
    try {
      const { error } = await client.from("events").insert(e);
      if (error) onError(e, error.message);
    } catch (err) {
      onError(e, (err as Error).message);
    }
  };
}

/** One JSON object per line; the directory is created on first write. */
export function jsonlSink(path: string): EventSink {
  let ready = false;
  return (e) => {
    if (!ready) { mkdirSync(dirname(path), { recursive: true }); ready = true; }
    appendFileSync(path, JSON.stringify(e) + "\n");
  };
}
