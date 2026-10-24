// Live feed: one run's rows from the Supabase `events` table. It subscribes to Realtime inserts first,
// then reads the history ordered by seq, so no row can fall between the two. Every row is checked
// against the contract. A row that skips ahead of the last delivered seq triggers a catch-up query,
// so the board always receives rows in seq order and a refresh rebuilds the same board.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunEventFeed } from "./feed";
import { EventSchema, type RunEvent } from "./types";

export function supabaseFeed(client: SupabaseClient, runId: string): RunEventFeed {
  return {
    mode: "live",
    runId,
    subscribe(onEvents, onError = () => {}) {
      let last = 0;
      let closed = false;
      let queue: Promise<void> = Promise.resolve();

      const parse = (rows: unknown[]) =>
        rows.flatMap((row) => {
          const r = EventSchema.safeParse(row);
          if (r.success) return [r.data];
          const seq = (row as { seq?: unknown })?.seq;
          onError(`Event row seq ${String(seq)} doesn't match the event contract: ${r.error.issues[0]?.message}`);
          return [];
        });

      const deliver = (rows: RunEvent[]) => {
        const fresh = rows.filter((e) => e.seq > last).sort((a, b) => a.seq - b.seq);
        if (closed || fresh.length === 0) return;
        last = fresh[fresh.length - 1].seq;
        onEvents(fresh);
      };

      // Every row after the last delivered seq. Chained so two catch-ups never interleave.
      const catchUp = () =>
        (queue = queue.then(async () => {
          if (closed) return;
          try {
            const { data, error } = await client
              .from("events")
              .select("*")
              .eq("run_id", runId)
              .gt("seq", last)
              .order("seq", { ascending: true });
            if (error) onError(`Couldn't read the run's events: ${error.message}`);
            else deliver(parse(data ?? []));
          } catch (e) {
            onError(`Couldn't read the run's events: ${e instanceof Error ? e.message : String(e)}`);
          }
        }));

      const channel = client
        .channel(`events:${runId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "events", filter: `run_id=eq.${runId}` },
          (payload) => {
            const [row] = parse([payload.new]);
            if (!row || row.seq <= last) return;
            if (row.seq === last + 1) deliver([row]);
            else void catchUp();
          },
        )
        .subscribe((status, err) => {
          // History is read after the subscription is live (and again after a reconnect).
          if (status === "SUBSCRIBED") void catchUp();
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
            onError(`Realtime ${status === "TIMED_OUT" ? "timed out" : "channel error"}${err ? `: ${err.message}` : ""}`);
        });

      return () => {
        closed = true;
        void client.removeChannel(channel);
      };
    },
  };
}
