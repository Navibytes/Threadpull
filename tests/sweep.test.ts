// The verification sweep (lib/agent/hazel.ts): when Hazel is done, code spends the budget left on the largest balances
// nobody verified, identity first, then a credit report when the identity checks out; statuses come from decideStatus.
// Scripted model that stops at once, recorded CRS answers (no network).
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { generate } from "@/data/generate";
import { HAZEL_MODEL, runHazel, type HazelRun } from "@/lib/agent";
import type { Event } from "@/lib/contracts/event";
import type { Loan } from "@/lib/contracts/loan";
import { canQuery } from "@/lib/crs";
import { loadReference, type Reference } from "@/lib/ingest/reference";
import { MemoryRuleStore } from "@/lib/rules";
import { client as replayCrs } from "./crs-replay";

const doneAtOnce = () => new Anthropic({ apiKey: "test-key", maxRetries: 0, fetch: (async () => new Response(JSON.stringify({
  id: "msg_1", type: "message", role: "assistant", model: HAZEL_MODEL, content: [{ type: "text", text: "Nothing more to pull." }],
  stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { "content-type": "application/json" } })) as unknown as typeof fetch });

let loans: Loan[], reference: Reference;
beforeAll(() => {
  const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
  const g = generate(join(import.meta.dir, "..", "data", "patterns", "seed13.json"), tmp(), tmp());
  loans = g.normalized;
  reference = loadReference(g.outDir);
});
const run = (extra: Partial<Parameters<typeof runHazel>[0]> = {}) => runHazel({ runId: "r13-sweep", loans, reference, anthropic: doneAtOnce(),
  crs: replayCrs(), rules: new MemoryRuleStore(), now: () => new Date("2026-10-25T04:00:00Z"), ...extra });
const ofType = (events: readonly Event[], type: Event["type"]) => events.filter((e) => e.type === type);

describe("the verification sweep", () => {
  let out: HazelRun;
  beforeAll(async () => { out = await run(); });

  test("it opens loans by balance, largest first, only ones CRS can be asked about, marked as the sweep", () => {
    const swept = ofType(out.events, "lead_opened").filter((e) => e.result.sweep === true);
    expect(swept.length).toBeGreaterThan(0);
    const amount = (id: string) => loans.find((l) => l.loan_id === id)!.funding_info.amount_financed;
    const ids = swept.map((e) => e.loan_ids[0]);
    expect(ids.every((id) => canQuery(loans.find((l) => l.loan_id === id)!))).toBe(true);
    expect(ids.map(amount)).toEqual([...ids.map(amount)].sort((a, b) => b - a));
    const eligible = loans.filter((l) => canQuery(l)).sort((a, b) => b.funding_info.amount_financed - a.funding_info.amount_financed);
    expect(ids[0]).toBe(eligible[0].loan_id);
    expect(swept[0].note).toMatch(/^Verification sweep: no lead left and 60 acorns to spend; the largest unverified balance/);
  });

  test("it never goes over the budget and stops when an identity check no longer fits", () => {
    expect(out.spent).toBeLessThanOrEqual(60);
    // either the budget ran out (less than one identity check left) or every loan CRS can be asked about was tried
    // (recorded answers cover 8 personas; the others are refused for free)
    const tried = new Set(ofType(out.events, "lead_opened").map((e) => e.loan_ids[0]));
    expect(out.limit - out.spent < 3 || loans.filter((l) => canQuery(l)).every((l) => tried.has(l.loan_id))).toBe(true);
  });

  test("identity first; a credit report only when the identity checks out; code decides each status", () => {
    const checks = ofType(out.events, "check_run");
    for (const e of ofType(out.events, "status_changed")) {
      const id = e.loan_ids[0];
      const ident = checks.find((c) => c.tool === "crs_identity_check" && c.loan_ids[0] === id)!;
      expect(ident.result.ok).toBe(true);
      const credit = checks.find((c) => c.tool === "crs_credit_report" && c.loan_ids[0] === id);
      if (credit) expect(credit.seq).toBeGreaterThan(ident.seq);
      expect(e.tool).toBe("close_lead");
    }
    expect(ofType(out.events, "status_changed").length).toBe(out.statuses.size);
  });

  test("a loan whose identity check could not run gets no status from the sweep", () => {
    const refused = ofType(out.events, "check_run").filter((c) => c.tool === "crs_identity_check" && c.result.ok === false).map((c) => c.loan_ids[0]);
    for (const id of refused) expect(out.statuses.has(id)).toBe(false);
  });

  test("the run still ends with run_finished, after the sweep", () => {
    expect(out.events.at(-1)!.type).toBe("run_finished");
  });

  test("sweep: false leaves the budget unspent", async () => {
    const off = await run({ sweep: false });
    expect([off.spent, off.statuses.size]).toEqual([0, 0]);
  });
});
