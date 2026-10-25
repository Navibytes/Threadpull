// The public deployment's live investigation (lib/demo.ts, app/api/tapes/[id]/runs): a passcode gates it, the tape can
// come in the request (no shared disk), and runs and uploads are looked for in the writable folder as well.
import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generate } from "@/data/generate";
import type { HazelOptions, HazelRun } from "@/lib/agent";
import { passcodeOk, uploadRoots, writableRuns, writableUploads } from "@/lib/demo";
import { intakeTape } from "@/lib/ingest/intake";
import { startTapeRun } from "@/lib/runs/tape-run";
import Anthropic from "@anthropic-ai/sdk";

const saved = { ...process.env };
afterEach(() => { for (const k of ["PUBLIC_DEMO", "INVESTIGATE_PASSCODE", "THREADPULL_SCRATCH", "VERCEL"]) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

describe("the passcode", () => {
  test("only the configured passcode passes; none configured, nothing passes", () => {
    expect(passcodeOk("tea-and-acorns", "tea-and-acorns")).toBe(true);
    expect(passcodeOk("tea-and-acorn", "tea-and-acorns")).toBe(false);
    expect(passcodeOk("", "tea-and-acorns")).toBe(false);
    expect(passcodeOk("anything", undefined)).toBe(false);
  });

  test("the route: no passcode configured is the read-only refusal; a wrong or missing passcode is 401", async () => {
    process.env.PUBLIC_DEMO = "1";
    const { POST } = await import("@/app/api/tapes/[id]/runs/route");
    const call = (headers: Record<string, string> = {}) => POST(new Request("http://x/api/tapes/t-000000000000/runs", { method: "POST", headers }),
      { params: Promise.resolve({ id: "t-000000000000" }) });
    delete process.env.INVESTIGATE_PASSCODE;
    expect((await call()).status).toBe(403);
    process.env.INVESTIGATE_PASSCODE = "tea-and-acorns";
    const noCode = await call();
    expect([noCode.status, (await noCode.json()).passcode_required]).toEqual([401, true]);
    expect((await call({ "x-threadpull-passcode": "wrong" })).status).toBe(401);
    expect((await call({ "x-threadpull-passcode": "tea-and-acorns" })).status).not.toBe(401); // past the gate (then: no such tape)
  });
});

describe("no shared disk", () => {
  test("on a serverless host, uploads and runs go to /tmp, and uploads are looked for there first", () => {
    process.env.VERCEL = "1";
    delete process.env.THREADPULL_SCRATCH;
    expect(writableUploads()).toBe("/tmp/threadpull/uploads");
    expect(writableRuns()).toBe("/tmp/threadpull/runs");
    expect(uploadRoots()[0]).toBe("/tmp/threadpull/uploads");
  });

  test("a run can start from the tape the request carried, with no upload on this server", () => {
    const g = generate(join(import.meta.dir, "..", "data", "patterns", "seed13.json"), mkdtempSync(join(tmpdir(), "tp-")), mkdtempSync(join(tmpdir(), "tp-")));
    const intake = intakeTape(readFileSync(join(g.outDir, "loans.json"), "utf8"));
    let seen: HazelOptions | null = null;
    const run = async (opts: HazelOptions): Promise<HazelRun> => { seen = opts; return { events: [], statuses: new Map(), spent: 0, limit: 60, iterations: 0, stop_reason: "end_turn", recap: "" }; };
    const out = startTapeRun(intake.report.tape_id, { env: { ANTHROPIC_API_KEY: "k", CRS_USERNAME: "u", CRS_PASSWORD: "p" }, run,
      tape: { loans: intake.loans, reference: intake.reference }, uploads: mkdtempSync(join(tmpdir(), "tp-empty-")),
      runsDir: mkdtempSync(join(tmpdir(), "tp-runs-")), anthropic: new Anthropic({ apiKey: "test-key" }), db: null, rules: join(mkdtempSync(join(tmpdir(), "tp-")), "rules.json") });
    if (!out.ok) throw new Error(out.error);
    expect(seen!.loans).toHaveLength(intake.loans.length);
    expect(out.done).toBeInstanceOf(Promise);
  });
});

describe("a run made on another server", () => {
  test("findRun reads it from the events table, with the tape it read as its meta", async () => {
    const { findRun } = await import("@/lib/deal/service");
    const rows = [
      { run_id: "rt-abc123-x", seq: 2, ts: "2026-10-25T12:38:24Z", type: "lead_opened", loan_ids: ["L0037"], tool: null, result: {}, sources: [], note: "", budget: { spent: 0, limit: 60 }, simulated: false },
      { run_id: "rt-abc123-x", seq: 1, ts: "2026-10-25T12:38:23Z", type: "run_started", loan_ids: [], tool: null, result: { tape_id: "t-abc123456789", loans: 1000 }, sources: [], note: "", budget: { spent: 0, limit: 60 }, simulated: false },
    ];
    const db = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ limit: async () => ({ data: rows.sort((a, b) => a.seq - b.seq), error: null }) }) }) }) }) };
    const run = await findRun("rt-abc123-x", undefined, db as never);
    expect(run?.meta).toMatchObject({ run_id: "rt-abc123-x", tape_id: "t-abc123456789" });
    expect(run?.events.map((e) => e.seq)).toEqual([1, 2]);
    expect(await findRun("../etc", undefined, db as never)).toBeNull();
  });

  test("a tape's Supabase seed is negative and stable; its loans come back in pages of 1,000", async () => {
    const { fetchTapeLoans, tapePortfolioSeed } = await import("@/lib/ingest/tapes");
    expect(tapePortfolioSeed("t-8be99367fefa")).toBe(-(parseInt("8be9936", 16) + 1));
    expect(tapePortfolioSeed("t-8be99367fefa")).toBe(tapePortfolioSeed("t-8be99367fefa"));
    const g = generate(join(import.meta.dir, "..", "data", "patterns", "seed13.json"), mkdtempSync(join(tmpdir(), "tp-")), mkdtempSync(join(tmpdir(), "tp-")));
    const all = [...g.normalized, ...g.normalized.slice(0, 200)].map((l) => ({ record: l })); // 1,200 rows: two pages
    const pages: number[] = [];
    const db = { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ range: async (a: number, b: number) => { pages.push(a); return { data: all.slice(a, b + 1), error: null }; } }) }) }) }) };
    const loans = await fetchTapeLoans(db as never, "t-8be99367fefa");
    expect([loans?.length, pages]).toEqual([1200, [0, 1000]]);
  });
});
