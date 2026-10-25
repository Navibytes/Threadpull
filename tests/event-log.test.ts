// lib/agent/event-log.ts: numbering, notes, and the Supabase sink (with a fake table: no network).
import { describe, expect, test } from "bun:test";
import type { Event } from "@/lib/contracts/event";
import { clampNote, EventLog, memorySink, supabaseSink, type EventsTable } from "@/lib/agent";

const fakeTable = (fail: (e: Event) => string | null = () => null, crash = false) => {
  const inserted: Event[] = [];
  const table: EventsTable = { from: () => ({ insert: async (row) => {
    if (crash) throw new Error("network down");
    const message = fail(row);
    if (!message) inserted.push(row);
    return { error: message ? { message } : null };
  } }) };
  return { table, inserted };
};
const row = (note = "x") => ({ type: "check_run" as const, loan_ids: ["L0037"], tool: "inspect_loan", result: {}, sources: [], note, simulated: false });

describe("event log", () => {
  test("rows are numbered 1, 2, 3 and carry the ledger's budget", async () => {
    let spent = 0;
    const log = new EventLog("r-test", () => ({ spent, limit: 60 }));
    await log.append(row()); spent = 3; await log.append(row());
    expect(log.rows.map((e) => [e.seq, e.budget.spent])).toEqual([[1, 0], [2, 3]]);
  });

  test("notes are cut to two sentences", () => {
    expect(clampNote("One. Two! Three? Four.")).toBe("One. Two!");
  });

  test("a number with a decimal point is never cut in two (seed 13's lead note was stored as \"4352).\")", () => {
    expect(clampNote("Top lead by rank (score 3.4352).")).toBe("Top lead by rank (score 3.4352).");
    expect(clampNote("Weight 0.25 on the employer. IP 198.51.100.13 is shared. Third.")).toBe("Weight 0.25 on the employer. IP 198.51.100.13 is shared.");
    expect(clampNote("  no  full stop  at the end ")).toBe("no full stop at the end");
    expect(clampNote("")).toBe("");
  });

  test("the Supabase sink inserts every row, in order", async () => {
    const { table, inserted } = fakeTable();
    const errors: string[] = [];
    const log = new EventLog("r-test", () => ({ spent: 0, limit: 60 }), [supabaseSink(table, (_, m) => errors.push(m))]);
    for (let i = 0; i < 3; i++) await log.append(row());
    expect([inserted.map((e) => e.seq), errors]).toEqual([[1, 2, 3], []]);
  });

  test("a failed insert is reported, never stops the run, and the row is still kept elsewhere", async () => {
    const { table, inserted } = fakeTable((e) => (e.seq === 2 ? "duplicate key value violates unique constraint" : null));
    const kept: Event[] = [], errors: string[] = [];
    const log = new EventLog("r-test", () => ({ spent: 0, limit: 60 }), [supabaseSink(table, (e, m) => errors.push(`${e.seq}: ${m}`)), memorySink(kept)]);
    for (let i = 0; i < 3; i++) await log.append(row());
    expect(inserted.map((e) => e.seq)).toEqual([1, 3]);
    expect(errors).toEqual(["2: duplicate key value violates unique constraint"]);
    expect(kept.map((e) => e.seq)).toEqual([1, 2, 3]);
  });

  test("a client that throws is caught the same way", async () => {
    const { table } = fakeTable(undefined, true);
    const errors: string[] = [];
    const log = new EventLog("r-test", () => ({ spent: 0, limit: 60 }), [supabaseSink(table, (_, m) => errors.push(m))]);
    await log.append(row());
    expect(errors).toEqual(["network down"]);
  });
});
