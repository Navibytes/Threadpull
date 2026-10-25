// Ticket 10: the server side of the CRO screen, against a run written to a temp folder exactly as eval/hazel-run.ts writes it.
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventSchema } from "@/lib/contracts/event";
import { listRuns, loadReport, loansFor, readRun, recordDisposition } from "@/lib/deal/service";
import { dealRun, type DealRun } from "./deal-run";

let run: DealRun, root: string;
const file = (id = run.run_id) => join(root, id, "events.jsonl");

beforeAll(async () => {
  run = await dealRun();
  root = mkdtempSync(join(tmpdir(), "tp-runs-"));
  mkdirSync(join(root, run.run_id));
  writeFileSync(file(), run.events.map((e) => JSON.stringify(e)).join("\n") + "\n");
  writeFileSync(join(root, run.run_id, "run.json"), JSON.stringify({ run_id: run.run_id, spec: "data/patterns/seed13.json", seed: 13, crs: "recorded", model_note: "scripted stand-in for Claude" }));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));
const deps = () => ({ root, loans: run.loans });

describe("reading a run", () => {
  test("meta and every event row, in order", () => {
    const r = readRun(run.run_id, root)!;
    expect(r.events).toHaveLength(run.events.length);
    expect(r.events.map((e) => e.seq)).toEqual(run.events.map((e) => e.seq));
    expect(r.meta).toMatchObject({ seed: 13, crs: "recorded" });
    expect(r.skipped).toBe(0);
  });
  test("the runs are listed, with the note that says what produced them", () => {
    expect(listRuns(root)).toEqual([{ run_id: run.run_id, started_at: null, crs: "recorded", note: "scripted stand-in for Claude", events: run.events.length }]);
  });
  test("a run id that is not a plain name finds nothing, so it cannot walk out of the runs folder", () => {
    for (const bad of ["../etc", "..", "a/b", "a\\b", "", ".hidden", "x".repeat(200)]) expect(readRun(bad, root)).toBeNull();
    expect(readRun("missing-run", root)).toBeNull();
  });
  test("a malformed row is skipped and counted, not repaired", () => {
    mkdirSync(join(root, "damaged"));
    writeFileSync(file("damaged"), run.events.slice(0, 3).map((e) => JSON.stringify(e)).join("\n") + '\n{"not":"an event"}\nnot json at all\n');
    const r = readRun("damaged", root)!;
    expect([r.events.length, r.skipped]).toEqual([3, 2]);
  });
});

describe("the run's loans", () => {
  test("a seed whose tape has not been generated says how to make it", async () => {
    await expect(loansFor({ run_id: "x", seed: 424242 })).rejects.toThrow("run bun run data --no-db");
  });
  test("a seed that is not a whole number never reaches a file path", async () => {
    for (const seed of ["13/../../x", 1.5, Number.NaN, null]) await expect(loansFor({ run_id: "x", seed: seed as number })).rejects.toThrow("whole-number seed");
  });
});

describe("loading the report", () => {
  test("the report and its drafts, with the run's notes", async () => {
    const out = (await loadReport(run.run_id, {}, deps()))!;
    expect(out.report.totals.reviewed).toBe(6);
    expect(out.buyback_demands.length).toBeGreaterThan(0);
    expect(out.document_requests.map((d) => d.loan_id)).toEqual([run.ids.fraudAlert]);
    expect(out.report.run.note).toContain("scripted stand-in for Claude");
    expect(out.report.run.note).toContain("CRS answers: recorded");
  });
  test("the analyst's assumptions change the bid", async () => {
    const base = (await loadReport(run.run_id, {}, deps()))!.report;
    const tighter = (await loadReport(run.run_id, { margin: 0.1, lgd: 0.7 }, deps()))!.report;
    expect(tighter.assumptions).toMatchObject({ margin: 0.1, lgd: 0.7 });
    expect(tighter.totals.proposed_price).toBeLessThan(base.totals.proposed_price);
  });
  test("an unknown run is null", async () => {
    expect(await loadReport("nope", {}, deps())).toBeNull();
  });
});

describe("recording a decision", () => {
  const approve = (over = {}) => ({ run_id: run.run_id, loan_ids: [run.ids.lead], decision: "approve", decided_by: "CRO", ...over });

  test("an invalid decision is refused before anything is written", async () => {
    for (const bad of [null, "text", { ...approve(), loan_ids: [] }, approve({ decision: "override", final_verdict: "Clear" }), approve({ decided_by: "" })]) {
      const out = await recordDisposition(bad, deps());
      expect(out).toMatchObject({ ok: false, status: 400 });
    }
  });
  test("an unknown run is 404, a loan the run never investigated is 422", async () => {
    expect(await recordDisposition(approve({ run_id: "nope" }), deps())).toMatchObject({ ok: false, status: 404 });
    expect(await recordDisposition(approve({ loan_ids: ["L0001"] }), deps())).toMatchObject({ ok: false, status: 422, error: expect.stringContaining("L0001") });
  });
  test("an approval is appended as the next row, and the loan then reads Human-confirmed disposition", async () => {
    const before = readRun(run.run_id, root)!.events.length;
    const out = await recordDisposition(approve(), deps());
    expect(out.ok).toBe(true);
    const after = readRun(run.run_id, root)!;
    expect(after.events).toHaveLength(before + 1);
    expect(after.events.map((e) => e.seq)).toEqual(after.events.map((_, i) => i + 1)); // still 1, 2, 3, ... with no gap
    expect(after.events.at(-1)).toMatchObject({ type: "disposition_recorded", loan_ids: [run.ids.lead] });
    for (const e of after.events) expect(EventSchema.safeParse(e).success).toBe(true);
    const row = (await loadReport(run.run_id, {}, deps()))!.report.loans.find((l) => l.loan_id === run.ids.lead)!;
    expect([row.status, row.verdict, row.confirmed?.decided_by]).toEqual(["Human-confirmed disposition", "Exclude", "CRO"]);
  });
  test("an override with a reason is recorded with that reason", async () => {
    const out = await recordDisposition(approve({ loan_ids: [run.ids.fraudAlert], decision: "override", final_verdict: "Clear", reason: "CRO confirmed the alert was lifted." }), deps());
    expect(out.ok).toBe(true);
    if (out.ok) expect(out.event.result).toMatchObject({ decision: "override", reason: "CRO confirmed the alert was lifted." });
    const row = (await loadReport(run.run_id, {}, deps()))!.report.loans.find((l) => l.loan_id === run.ids.fraudAlert)!;
    expect(row.verdict).toBe("Clear");
  });
  test("rows a person appended by hand do not break the next sequence number", async () => {
    const last = readRun(run.run_id, root)!.events.at(-1)!;
    appendFileSync(file(), JSON.stringify({ ...last, seq: last.seq + 5 }) + "\n");
    const out = await recordDisposition(approve({ loan_ids: [run.ids.p12] }), deps());
    expect(out.ok && out.event.seq).toBe(last.seq + 6);
  });
});

describe("the run's note on the screen", () => {
  test("each note is a sentence, joined without stray punctuation", async () => {
    const note = (await loadReport(run.run_id, {}, deps()))!.report.run.note!;
    expect(note).not.toContain(".;");
    expect(note).not.toContain("..");
    expect(note).toMatch(/^Scripted|^scripted/i);
    expect(note.endsWith(".")).toBe(true);
  });
});
