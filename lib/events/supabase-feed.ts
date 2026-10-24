// Live feed: one run's rows from the Supabase `events` table. It subscribes to Realtime inserts, then reads
// the history ordered by seq (again once Postgres changes are confirmed flowing, so no row falls between).
// Every row is checked against the contract. Rows are released strictly in seq order: a row that arrives
// ahead of a missing seq waits; if the gap is still open after a re-read, the later rows are shown and the
// gap is reported, and if the missing row turns up after all, the board is rebuilt from the ordered history.
// So the board always receives rows in seq order and ends up the same as a refresh would build it.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { RunEventFeed } from "./feed";
import { EventSchema, type RunEvent } from "./types";

export const GAP_WAIT_MS = 1500;

export function supabaseFeed(client: SupabaseClient, runId: string, gapWaitMs = GAP_WAIT_MS): RunEventFeed {
  return {
    mode: "live",
    runId,
    subscribe(onEvents, onError = () => {}, onReset = () => {}) {
      let last = 0;
      let gen = 0; // bumped on every rebuild; reads started before it are ignored
      let closed = false;
      let queue: Promise<void> = Promise.resolve();
      let gapTimer: ReturnType<typeof setTimeout> | null = null;
      const pending = new Map<number, RunEvent>();
      const skipped = new Set<number>();

      const parse = (rows: unknown[]) =>
        rows.flatMap((row) => {
          const r = EventSchema.safeParse(row);
          if (r.success) return [r.data];
          const seq = (row as { seq?: unknown })?.seq;
          onError(`Event row seq ${String(seq)} doesn't match the event contract: ${r.error.issues[0]?.message}`);
          return [];
        });

      // Release the unbroken run of seqs after `last`; with `skipGap`, release everything waiting.
      const release = (skipGap = false) => {
        if (closed) return;
        const out: RunEvent[] = [];
        for (;;) {
          let next = pending.get(last + 1);
          if (!next && skipGap && pending.size > 0) {
            const seq = Math.min(...pending.keys());
            for (let s = last + 1; s < seq; s++) skipped.add(s);
            onError(`Event seq ${last + 1}${seq - 1 > last + 1 ? `–${seq - 1}` : ""} is missing from run ${runId}; showing later rows.`);
            next = pending.get(seq);
          }
          if (!next) break;
          pending.delete(next.seq);
          last = next.seq;
          out.push(next);
        }
        if (out.length) onEvents(out);
        if (pending.size > 0 && !gapTimer)
          gapTimer = setTimeout(() => {
            gapTimer = null;
            void catchUp(true);
          }, gapWaitMs);
      };

      // Queue new rows; true when a row we already gave up on has arrived, so the board must be rebuilt.
      const accept = (rows: RunEvent[]) => {
        let late = false;
        for (const e of rows) {
          if (e.seq <= last) late ||= skipped.has(e.seq);
          else if (!pending.has(e.seq)) pending.set(e.seq, e);
        }
        return late;
      };

      const rebuild = () => {
        gen++;
        last = 0;
        pending.clear();
        skipped.clear();
        if (gapTimer) clearTimeout(gapTimer);
        gapTimer = null;
        onReset();
        void catchUp();
      };

      // Every row after the last released seq. Chained so two reads never interleave.
      const catchUp = (skipGap = false) => {
        const started = gen;
        return (queue = queue.then(async () => {
          if (closed || started !== gen) return;
          try {
            const { data, error } = await client
              .from("events")
              .select("*")
              .eq("run_id", runId)
              .gt("seq", last)
              .order("seq", { ascending: true });
            if (started !== gen) return;
            if (error) onError(`Couldn't read the run's events: ${error.message}`);
            else accept(parse(data ?? []));
          } catch (e) {
            onError(`Couldn't read the run's events: ${e instanceof Error ? e.message : String(e)}`);
          }
          release(skipGap);
        }));
      };

      const channel = client
        .channel(`events:${runId}`)
        .on(
          "postgres_changes",
          { event: "INSERT", schema: "public", table: "events", filter: `run_id=eq.${runId}` },
          (payload) => {
            if (accept(parse([payload.new]))) rebuild();
            else release();
          },
        )
        // Realtime confirms the Postgres listener separately from SUBSCRIBED; read again once it does.
        .on("system", {}, (payload: { extension?: string; status?: string }) => {
          if (payload?.extension === "postgres_changes" && payload?.status === "ok") void catchUp();
        })
        .subscribe((status, err) => {
          if (status === "SUBSCRIBED") void catchUp();
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT")
            onError(`Realtime ${status === "TIMED_OUT" ? "timed out" : "channel error"}${err ? `: ${err.message}` : ""}`);
        });

      return () => {
        closed = true;
        if (gapTimer) clearTimeout(gapTimer);
        void client.removeChannel(channel);
      };
    },
  };
}
