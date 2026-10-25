// The live feed against a fake Supabase client: history in seq order, Realtime inserts appended, rows that
// arrive ahead of a missing seq held back, permanent gaps reported. The real round trip is in docs/board-proof.md.
import { describe, expect, test } from "bun:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { PREVIEW_EVENTS, reduceEvents, supabaseFeed, type RunEvent } from "@/lib/events";

const RUN = "r-test";
const row = (seq: number, extra: Partial<RunEvent> = {}): RunEvent => ({
  ...PREVIEW_EVENTS[2],
  run_id: RUN,
  seq,
  loan_ids: [`A${seq}`, `B${seq}`],
  result: { edge_id: `e${seq}`, kind: "phone", weight: 0.5 },
  ...extra,
});

function fakeClient(table: RunEvent[]) {
  let onInsert: (p: { new: unknown }) => void = () => {};
  let onSystem: (p: unknown) => void = () => {};
  let onStatus: (s: string) => void = () => {};
  const queries: number[] = [];
  const client = {
    from: () => {
      let after = 0;
      const q = {
        select: () => q,
        eq: () => q,
        gt: (_: string, v: number) => ((after = v), q),
        order: async () => {
          queries.push(after);
          return { data: table.filter((r) => r.seq > after).sort((a, b) => a.seq - b.seq), error: null };
        },
      };
      return q;
    },
    channel: () => {
      const ch = {
        on: (type: string, _f: unknown, cb: (p: { new: unknown }) => void) => {
          if (type === "postgres_changes") onInsert = cb;
          else onSystem = cb as (p: unknown) => void;
          return ch;
        },
        subscribe: (cb: typeof onStatus) => ((onStatus = cb), ch),
      };
      return ch;
    },
    removeChannel: async () => "ok",
  } as unknown as SupabaseClient;
  return {
    client,
    queries,
    insert: (r: unknown) => onInsert({ new: r }),
    status: (s: string) => onStatus(s),
    ready: () => onSystem({ extension: "postgres_changes", status: "ok" }),
  };
}

const flush = () => new Promise((r) => setTimeout(r, 0));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function follow(table: RunEvent[], gapWaitMs = 20) {
  const db = fakeClient(table);
  const got: number[] = [];
  const errors: string[] = [];
  const stop = supabaseFeed(db.client, RUN, gapWaitMs).subscribe(
    (rows) => got.push(...rows.map((r) => r.seq)),
    (m) => errors.push(m),
  );
  return { db, got, errors, stop };
}

describe("supabase feed", () => {
  test("reads history only after the subscription is live, in seq order", async () => {
    const f = follow([row(3), row(1), row(2)]);
    await flush();
    expect(f.got).toEqual([]);
    f.db.status("SUBSCRIBED");
    await flush();
    expect(f.got).toEqual([1, 2, 3]);
    f.stop();
  });

  test("appends the next Realtime insert without another query", async () => {
    const f = follow([row(1)]);
    f.db.status("SUBSCRIBED");
    await flush();
    f.db.insert(row(2));
    expect(f.got).toEqual([1, 2]);
    expect(f.db.queries).toEqual([0]);
    f.stop();
  });

  test("a row inserted before the Postgres listener is ready is read once it is", async () => {
    const table = [row(1)];
    const f = follow(table);
    f.db.status("SUBSCRIBED");
    await flush();
    table.push(row(2)); // committed in the window Realtime didn't see
    f.db.ready();
    await flush();
    expect(f.got).toEqual([1, 2]);
    f.stop();
  });

  test("a row that arrives ahead of a missing seq waits for it", async () => {
    const f = follow([row(1)], 1000);
    f.db.status("SUBSCRIBED");
    await flush();
    f.db.insert(row(3)); // seq 2 isn't committed yet
    expect(f.got).toEqual([1]);
    f.db.insert(row(2));
    expect(f.got).toEqual([1, 2, 3]);
    f.db.insert(row(2)); // late duplicate
    expect(f.got).toEqual([1, 2, 3]);
    f.stop();
  });

  test("a gap Realtime missed is filled from the table", async () => {
    const table = [row(1)];
    const f = follow(table);
    f.db.status("SUBSCRIBED");
    await flush();
    table.push(row(2), row(3));
    f.db.insert(row(3)); // Realtime never delivers 2
    await wait(40);
    expect(f.got).toEqual([1, 2, 3]);
    expect(f.errors).toEqual([]);
    f.stop();
  });

  test("a permanent gap is reported and later rows are still shown in order", async () => {
    const f = follow([row(1), row(3), row(4)]);
    f.db.status("SUBSCRIBED");
    await wait(40);
    expect(f.got).toEqual([1, 3, 4]);
    expect(f.errors[0]).toContain("seq 2 is missing");
    f.stop();
  });

  test("a row given up on that arrives late rebuilds the board in seq order", async () => {
    const table = [row(1), row(3)];
    const db = fakeClient(table);
    let rows: RunEvent[] = [];
    let resets = 0;
    const stop = supabaseFeed(db.client, RUN, 20).subscribe(
      (r) => rows.push(...r),
      () => {},
      () => ((rows = []), resets++),
    );
    db.status("SUBSCRIBED");
    await wait(40); // gap at 2 given up on: 1, 3 shown
    expect(rows.map((r) => r.seq)).toEqual([1, 3]);
    table.push(row(2));
    db.insert(row(2)); // the missing row finally commits
    await wait(40);
    expect(resets).toBe(1);
    expect(rows.map((r) => r.seq)).toEqual([1, 2, 3]);
    expect(reduceEvents(rows)).toEqual(reduceEvents(table));
    stop();
  });

  test("rows that break the contract are reported, not drawn", async () => {
    const f = follow([row(1)]);
    f.db.status("SUBSCRIBED");
    await flush();
    f.db.insert({ ...row(2), type: "not_a_type" });
    expect(f.got).toEqual([1]);
    expect(f.errors[0]).toContain("seq 2");
    f.stop();
  });

  test("a refresh (new subscription) rebuilds the same board", async () => {
    const table = [row(1), row(2), row(3)];
    const boards = [];
    for (let i = 0; i < 2; i++) {
      const db = fakeClient(table);
      const rows: RunEvent[] = [];
      const stop = supabaseFeed(db.client, RUN).subscribe((r) => rows.push(...r));
      db.status("SUBSCRIBED");
      await flush();
      boards.push(reduceEvents(rows));
      stop();
    }
    expect(boards[1]).toEqual(boards[0]);
    expect(boards[0].threads).toHaveLength(3);
  });
});
