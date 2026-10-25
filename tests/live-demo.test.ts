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
