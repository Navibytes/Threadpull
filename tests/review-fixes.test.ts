// Fixes from the Sun 04:20 code review: a person's row never collides with a run still writing; a yes to a question
// with no scope is recorded without a rule; the uploaded-tape run registry is one per server.
import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Event } from "@/lib/contracts/event";
import type { Question } from "@/lib/contracts/rule";
import { recordAnswer } from "@/lib/deal/questions";
import { recordDisposition, stillRunning } from "@/lib/deal/service";
import { MemoryRuleStore } from "@/lib/rules";
import { MODEL_TIMEOUT_MS, tapeRun } from "@/lib/runs/tape-run";

const row = (seq: number, type: Event["type"], extra: Partial<Event> = {}): Event => ({
  run_id: "r13-live", seq, ts: new Date(Date.UTC(2026, 9, 25, 4, 0, seq)).toISOString(), type, loan_ids: [], tool: null, result: {},
  sources: [], note: "", budget: { spent: 0, limit: 60 }, simulated: false, ...extra,
});
const question = (over: Partial<Question> = {}): Question => ({
  id: "q-001", run_id: "r13-live", loan_ids: ["L0400"], question: "Hold L0400 until the frozen bureau is lifted?", topic: "partial_data",
  to: "credit analyst", confidence: 50, reason: "no precedent", confidence_basis: { for: [], against: [] }, context: null,
  proposed_rule: null, sources: [], asked_at: "2026-10-25T04:00:00Z", status: "pending", answer: null, ...over,
});
function runFolder(rows: Event[]) {
  const root = mkdtempSync(join(tmpdir(), "tp-runs-"));
  mkdirSync(join(root, "r13-live"));
  writeFileSync(join(root, "r13-live", "events.jsonl"), rows.map((r) => JSON.stringify(r)).join("\n") + "\n");
  return root;
}
const answer = { run_id: "r13-live", question_id: "q-001", decision: "yes", answered_by: "credit analyst", text: "Hold it until the bureau is lifted." };

describe("a person's row waits for the run to finish", () => {
  test("stillRunning: no run_finished row yet", () => {
    expect(stillRunning([row(1, "run_started")])).toBe(true);
    expect(stillRunning([row(1, "run_started"), row(2, "run_finished")])).toBe(false);
  });

  test("an answer to a run still writing is refused, and nothing is appended", async () => {
    const root = runFolder([row(1, "run_started"), row(2, "question_asked", { loan_ids: ["L0400"] })]);
    const store = new MemoryRuleStore();
    await store.saveQuestion(question());
    const out = await recordAnswer(answer, { root, store, db: null });
    expect(out).toMatchObject({ ok: false, status: 409 });
    expect(readFileSync(join(root, "r13-live", "events.jsonl"), "utf8").trim().split("\n")).toHaveLength(2);
    expect((await store.questions())[0].status).toBe("pending");
  });

  test("a decision on a run still writing is refused", async () => {
    const root = runFolder([row(1, "run_started")]);
    const out = await recordDisposition({ run_id: "r13-live", loan_ids: ["L0400"], decision: "approve", decided_by: "CRO" }, { root, loans: [], db: null });
    expect(out).toMatchObject({ ok: false, status: 409 });
  });
});

describe("a yes to a question that is not about a shared link", () => {
  test("is recorded as answered, with no rule and a question_answered row", async () => {
    const root = runFolder([row(1, "run_started"), row(2, "question_asked", { loan_ids: ["L0400"] }), row(3, "run_finished")]);
    const store = new MemoryRuleStore();
    await store.saveQuestion(question());
    const out = await recordAnswer(answer, { root, store, db: null, now: () => new Date("2026-10-25T04:30:00Z") });
    if (!out.ok) throw new Error(out.error);
    expect(out.rule).toBeNull();
    expect(out.event).toMatchObject({ seq: 4, type: "question_answered", result: { question_id: "q-001", decision: "yes", rule_id: null } });
    expect(out.event.note).toContain("no rule saved (the question is not about a shared link)");
    const q = (await store.questions())[0];
    expect([q.status, q.answer?.decision, q.answer?.rule_id]).toEqual(["answered", "yes", null]);
    expect(await store.ruleVersions()).toEqual([]);
    expect(await recordAnswer(answer, { root, store, db: null })).toMatchObject({ ok: false, status: 409 }); // answered once
  });
});

describe("the uploaded-tape run registry", () => {
  test("lives on globalThis, so every copy of the module in one server sees the same runs", () => {
    const g = globalThis as { __threadpullTapeRuns?: { runs: Map<string, unknown> } };
    expect(g.__threadpullTapeRuns?.runs).toBeInstanceOf(Map);
    g.__threadpullTapeRuns!.runs.set("rt-shared", { run_id: "rt-shared", tape_id: "t-000000000000", state: "running", started_at: "" });
    expect(tapeRun("rt-shared")?.state).toBe("running");
    g.__threadpullTapeRuns!.runs.delete("rt-shared");
  });

  test("a model request is dropped after 2 minutes, not the SDK's 10", () => {
    expect(MODEL_TIMEOUT_MS).toBe(120_000);
  });
});
