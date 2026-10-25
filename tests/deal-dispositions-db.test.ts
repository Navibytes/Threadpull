// Ticket 10: the Supabase copy of a decision. The run's event log is the record of truth; the copy is best effort, and its
// failure is reported and never undoes the decision. A fake stands in for the hosted project: under `bun test` the real one
// is never used, whatever keys the developer has in .env.local.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventSchema, type Event } from "@/lib/contracts/event";
import { buildReport, dispositionRow } from "@/lib/deal";
import { defaultDispositionsDb, dispositionRows, mirrorDisposition, type DispositionRow, type DispositionsTable } from "@/lib/deal/dispositions-db";
import { recordDisposition } from "@/lib/deal/service";
import { dealRun, type DealRun } from "./deal-run";

let run: DealRun, root: string;
beforeAll(async () => {
  run = await dealRun();
  root = mkdtempSync(join(tmpdir(), "tp-runs-"));
  mkdirSync(join(root, run.run_id));
  writeFileSync(join(root, run.run_id, "events.jsonl"), run.events.map((e) => JSON.stringify(e)).join("\n") + "\n");
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

type Call = { table: string; rows: DispositionRow[]; options: { onConflict: string; ignoreDuplicates: boolean } };
/** A fake hosted project that records what it is asked to write, and can be told to fail. */
function fakeDb(mode: "ok" | "error" | "throw" = "ok") {
  const calls: Call[] = [];
  const db: DispositionsTable = {
    from: (table) => ({
      upsert: async (rows, options) => {
        calls.push({ table, rows, options });
        if (mode === "throw") throw new Error("network down");
        return { error: mode === "error" ? { message: 'relation "dispositions" does not exist' } : null };
      },
    }),
  };
  return { db, calls };
}

const proposalOf = () => {
  const report = buildReport({ run_id: run.run_id, loans: run.loans, events: run.events });
  return (id: string) => {
    const l = report.loans.find((x) => x.loan_id === id);
    return l && { proposed: l.proposed_verdict, status_seq: l.event_seqs[0] };
  };
};
function eventFor(input: Parameters<typeof dispositionRow>[0]): Event {
  const built = dispositionRow(input, proposalOf(), run.events.at(-1)!.budget);
  if (!built.ok) throw new Error(built.error);
  return EventSchema.parse({ run_id: run.run_id, seq: 99, ts: "2026-10-24T21:00:00Z", ...built.row });
}
const approve = { run_id: "r13-sample", loan_ids: ["L0037", "L0190"], decision: "approve" as const, decided_by: "CRO" };

describe("the rows to copy", () => {
  test("one row per loan, tied to the event row, an approval carrying no reason", () => {
    const rows = dispositionRows(eventFor(approve));
    expect(rows).toEqual([
      { run_id: run.run_id, loan_id: "L0037", decision: "approve", proposed_verdict: "Exclude", final_verdict: "Exclude", reason: null, decided_by: "CRO", event_seq: 99 },
      { run_id: run.run_id, loan_id: "L0190", decision: "approve", proposed_verdict: "Exclude", final_verdict: "Exclude", reason: null, decided_by: "CRO", event_seq: 99 },
    ]);
  });
  test("an override keeps its reason and both verdicts", () => {
    const [row] = dispositionRows(eventFor({ ...approve, loan_ids: [run.ids.fraudAlert], decision: "override", final_verdict: "Clear", reason: "CRO confirmed the alert was lifted." }));
    expect(row).toMatchObject({ decision: "override", proposed_verdict: "Review", final_verdict: "Clear", reason: "CRO confirmed the alert was lifted." });
  });
  test("an event that is not a decision gives no rows", () => {
    expect(dispositionRows({ ...run.events[0] })).toEqual([]);
  });
});

describe("copying to Supabase", () => {
  test("the rows go to the dispositions table, and writing the same decision twice is harmless", async () => {
    const { db, calls } = fakeDb();
    expect(await mirrorDisposition(eventFor(approve), db)).toEqual({ status: "saved" });
    expect(calls).toHaveLength(1);
    expect(calls[0].table).toBe("dispositions");
    expect(calls[0].rows).toHaveLength(2);
    expect(calls[0].options).toEqual({ onConflict: "run_id,event_seq,loan_id", ignoreDuplicates: true });
  });
  test("a failed write is reported with its reason, not thrown", async () => {
    expect(await mirrorDisposition(eventFor(approve), fakeDb("error").db)).toEqual({ status: "failed", error: 'relation "dispositions" does not exist' });
    expect(await mirrorDisposition(eventFor(approve), fakeDb("throw").db)).toEqual({ status: "failed", error: "network down" });
  });
  test("with no database configured the copy is skipped, and says why", async () => {
    expect(await mirrorDisposition(eventFor(approve), null)).toEqual({ status: "skipped", why: "Supabase is not configured here" });
  });
  test("under bun test the hosted client is never used, even with keys in the environment", () => {
    const keep = { url: process.env.SUPABASE_URL, key: process.env.SUPABASE_SERVICE_ROLE_KEY };
    process.env.SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "not-a-real-key";
    try {
      expect(defaultDispositionsDb()).toBeNull();
    } finally {
      if (keep.url === undefined) delete process.env.SUPABASE_URL; else process.env.SUPABASE_URL = keep.url;
      if (keep.key === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = keep.key;
    }
  });
});

describe("recording a decision, end to end", () => {
  const logRows = () => readFileSync(join(root, run.run_id, "events.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l) as Event);

  test("the event log is written, and the copy is attempted with the same rows", async () => {
    const { db, calls } = fakeDb();
    const out = await recordDisposition({ ...approve, run_id: run.run_id, loan_ids: [run.ids.lead] }, { root, loans: run.loans, db });
    expect(out.ok && out.mirror).toEqual({ status: "saved" });
    const last = logRows().at(-1)!;
    expect(last.type).toBe("disposition_recorded");
    expect(calls[0].rows[0]).toMatchObject({ run_id: run.run_id, loan_id: run.ids.lead, event_seq: last.seq });
  });
  test("a failed copy never undoes the decision: it stays in the log and the answer is ok with a failed copy", async () => {
    const before = logRows().length;
    const out = await recordDisposition({ ...approve, run_id: run.run_id, loan_ids: [run.ids.p12] }, { root, loans: run.loans, db: fakeDb("error").db });
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.mirror).toMatchObject({ status: "failed" });
    expect(logRows()).toHaveLength(before + 1);
  });
  test("a decision that is refused is not copied", async () => {
    const { db, calls } = fakeDb();
    const out = await recordDisposition({ ...approve, run_id: run.run_id, loan_ids: ["L0001"] }, { root, loans: run.loans, db });
    expect(out.ok).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("the migration", () => {
  const sql = readFileSync(join(import.meta.dir, "..", "supabase", "migrations", "20261025000000_dispositions.sql"), "utf8");
  test("it is closed to the browser, idempotent, and enforces the override rule", () => {
    expect(sql).toContain("enable row level security");
    expect(sql).not.toMatch(/create policy/i);
    expect(sql).toContain("create table if not exists public.dispositions");
    expect(sql).toContain("unique (run_id, event_seq, loan_id)");
    expect(sql).toContain("decision = 'approve' or length(coalesce(reason, '')) >= 10");
    for (const v of ["Clear", "Reprice", "Review", "Exclude"]) expect(sql).toContain(`'${v}'`);
  });
});
