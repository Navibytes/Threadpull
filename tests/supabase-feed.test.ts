// The live feed against a fake Supabase client: history in seq order, Realtime inserts appended,
// gaps caught up from the table, duplicates and bad rows dropped. The real round trip is in docs/board-proof.md.
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
        on: (_t: string, _f: unknown, cb: typeof onInsert) => ((onInsert = cb), ch),
        subscribe: (cb: typeof onStatus) => ((onStatus = cb), ch),
      };
      return ch;
    },
    removeChannel: async () => "ok",
  } as unknown as SupabaseClient;
  return { client, queries, insert: (r: unknown) => onInsert({ new: r }), status: (s: string) => onStatus(s) };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("supabase feed", () => {
  test("reads history only after the subscription is live, in seq order", async () => {
    const db = fakeClient([row(3), row(1), row(2)]);
    const got: number[] = [];
    supabaseFeed(db.client, RUN).subscribe((rows) => got.push(...rows.map((r) => r.seq)));
    await flush();
    expect(got).toEqual([]);
    db.status("SUBSCRIBED");
    await flush();
    expect(got).toEqual([1, 2, 3]);
  });

  test("appends the next Realtime insert without another query", async () => {
    const table = [row(1)];
    const db = fakeClient(table);
    const got: number[] = [];
    supabaseFeed(db.client, RUN).subscribe((rows) => got.push(...rows.map((r) => r.seq)));
    db.status("SUBSCRIBED");
    await flush();
    db.insert(row(2));
    expect(got).toEqual([1, 2]);
    expect(db.queries).toEqual([0]);
  });

  test("a seq gap is filled from the table before the later row is shown", async () => {
    const table = [row(1)];
    const db = fakeClient(table);
    const got: number[] = [];
    supabaseFeed(db.client, RUN).subscribe((rows) => got.push(...rows.map((r) => r.seq)));
    db.status("SUBSCRIBED");
    await flush();
    table.push(row(2), row(3));
    db.insert(row(3)); // 2 hasn't arrived over Realtime yet
    await flush();
    db.insert(row(2)); // late duplicate
    expect(got).toEqual([1, 2, 3]);
  });

  test("a row inserted while history loads is neither lost nor duplicated", async () => {
    const table = [row(1), row(2)];
    const db = fakeClient(table);
    const got: number[] = [];
    supabaseFeed(db.client, RUN).subscribe((rows) => got.push(...rows.map((r) => r.seq)));
    db.status("SUBSCRIBED");
    table.push(row(3));
    db.insert(row(3)); // arrives before the history query resolves
    await flush();
    await flush();
    expect(got).toEqual([1, 2, 3]);
  });

  test("rows that break the contract are reported, not drawn", async () => {
    const db = fakeClient([row(1)]);
    const got: number[] = [];
    const errors: string[] = [];
    supabaseFeed(db.client, RUN).subscribe((rows) => got.push(...rows.map((r) => r.seq)), (m) => errors.push(m));
    db.status("SUBSCRIBED");
    await flush();
    db.insert({ ...row(2), type: "not_a_type" });
    expect(got).toEqual([1]);
    expect(errors[0]).toContain("seq 2");
  });

  test("a refresh (new subscription) rebuilds the same board", async () => {
    const table = [row(1), row(2), row(3)];
    const boards = [];
    for (let i = 0; i < 2; i++) {
      const db = fakeClient(table);
      const rows: RunEvent[] = [];
      supabaseFeed(db.client, RUN).subscribe((r) => rows.push(...r));
      db.status("SUBSCRIBED");
      await flush();
      boards.push(reduceEvents(rows));
    }
    expect(boards[1]).toEqual(boards[0]);
    expect(boards[0].threads).toHaveLength(3);
  });
});
