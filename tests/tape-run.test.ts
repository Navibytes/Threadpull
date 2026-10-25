// Investigating an uploaded tape from the app (lib/runs/tape-run.ts): the run starts on the tape's accepted loans with
// the run's first row naming the tape, refuses what it can't do, runs one at a time, and the CRO screen reads the
// tape's loans. A fake run function stands in for Hazel (no model, no CRS, no Supabase).
import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generate } from "@/data/generate";
import type { HazelOptions, HazelRun } from "@/lib/agent";
import type { Event } from "@/lib/contracts/event";
import { intakeTape } from "@/lib/ingest/intake";
import { saveTape } from "@/lib/ingest/tapes";
import { missingConfig, startTapeRun, tapeRun, tapeTagged } from "@/lib/runs/tape-run";
import Anthropic from "@anthropic-ai/sdk";

const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
const g = generate(join(import.meta.dir, "..", "data", "patterns", "seed13.json"), tmp(), tmp());
const uploads = tmp();
const intake = intakeTape(readFileSync(join(g.outDir, "loans.json"), "utf8"));
saveTape(uploads, intake);
const TAPE = intake.report.tape_id;
const env = { ANTHROPIC_API_KEY: "k", CRS_USERNAME: "u", CRS_PASSWORD: "p" };
const anthropic = new Anthropic({ apiKey: "test-key" });

describe("starting a run on an uploaded tape", () => {
  test("refuses a bad id, a missing tape and missing keys, naming the keys only", () => {
    expect(startTapeRun("../etc", { env, uploads })).toMatchObject({ ok: false, status: 400 });
    expect(startTapeRun("t-000000000000", { env, uploads, anthropic, db: null })).toMatchObject({ ok: false, status: 404 });
    expect(startTapeRun(TAPE, { env: {}, uploads })).toEqual({ ok: false, status: 503,
      error: "a live run needs ANTHROPIC_API_KEY, CRS_USERNAME, CRS_PASSWORD in .env.local" });
    expect(missingConfig(env)).toEqual([]);
  });

  test("runs Hazel on the tape's loans, one run at a time, and the first row names the tape", async () => {
    let seen: HazelOptions | null = null, release!: () => void;
    const gate = new Promise<void>((r) => { release = r; });
    const run = async (opts: HazelOptions): Promise<HazelRun> => {
      seen = opts;
      const row = { run_id: opts.runId, seq: 1, ts: "2026-10-25T05:00:00Z", type: "run_started", loan_ids: [], tool: null,
        result: { model: "m", loans: opts.loans.length }, sources: [], note: "Run started.", budget: { spent: 0, limit: 60 }, simulated: false } as Event;
      for (const s of opts.sinks ?? []) await s(row);
      await gate;
      return { events: [row], statuses: new Map(), spent: 0, limit: 60, iterations: 0, stop_reason: "end_turn", recap: "" };
    };
    const runsDir = tmp();
    const out = startTapeRun(TAPE, { env, uploads, runsDir, run, anthropic, db: null, rules: join(runsDir, "rules.json"),
      now: () => new Date("2026-10-25T05:00:00Z") });
    if (!out.ok) throw new Error(out.error);
    expect(out.run.run_id).toBe(`rt-${TAPE.slice(2, 8)}-20261025T050000`);
    expect(startTapeRun(TAPE, { env, uploads, runsDir, run, anthropic, db: null })).toMatchObject({ ok: false, status: 409 });
    expect(seen!.loans).toHaveLength(intake.loans.length);
    expect(seen!.documentReader).toBeDefined();
    const dir = join(runsDir, out.run.run_id);
    expect(JSON.parse(readFileSync(join(dir, "run.json"), "utf8"))).toMatchObject({ run_id: out.run.run_id, tape_id: TAPE, crs: "live" });
    await Bun.sleep(10);
    const first = JSON.parse(readFileSync(join(dir, "events.jsonl"), "utf8").split("\n")[0]);
    expect(first.result).toMatchObject({ tape_id: TAPE, loans: intake.loans.length });
    expect(tapeRun(out.run.run_id)?.state).toBe("running");
    release();
    await Bun.sleep(10);
    expect(tapeRun(out.run.run_id)?.state).toBe("finished");
    expect(existsSync(join(dir, "events.jsonl"))).toBe(true);
  });

  test("tapeTagged adds the tape to run_started only", async () => {
    const got: Event[] = [];
    const sink = tapeTagged((e) => { got.push(e); }, TAPE);
    await sink({ type: "run_started", result: { seed: 1 } } as unknown as Event);
    await sink({ type: "check_run", result: { ok: true } } as unknown as Event);
    expect(got.map((e) => e.result)).toEqual([{ seed: 1, tape_id: TAPE }, { ok: true }]);
  });
});
