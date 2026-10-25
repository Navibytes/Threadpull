// Ticket 13: the evaluator. Hazel's numbers come only from her event rows, the baselines run the same CRS tools at
// the same prices, and the score reads the answer key. Seed 13, recorded CRS answers, no network.
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Event } from "@/lib/contracts/event";
import type { Loan } from "@/lib/contracts/loan";
import { generate, type AnswerKey } from "@/data/generate";
import { checkEverything, fixedRules, type AgentResult } from "@/eval/baselines";
import { hazelFromEvents, renderProof, ringCompleteAt, score } from "@/eval/evaluate";
import { client as replayCrs } from "./crs-replay";

let loans: Loan[], key: AnswerKey;
beforeAll(() => {
  const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
  const r = generate(join(import.meta.dir, "..", "data", "patterns", "seed13.json"), tmp(), tmp());
  key = JSON.parse(readFileSync(join(r.keyDir, "answer_key.json"), "utf8"));
  loans = r.normalized;
});

const row = (seq: number, type: Event["type"], extra: Partial<Event> = {}): Event => ({
  run_id: "r", seq, ts: new Date(Date.UTC(2026, 9, 25, 0, 0, seq)).toISOString(), type, loan_ids: [], tool: null, result: {},
  sources: [], note: "", budget: { spent: 0, limit: 60 }, simulated: false, ...extra,
});

describe("Hazel's numbers come from her rows", () => {
  test("last status per loan, the last row's budget, charged CRS calls, questions and runtime", () => {
    const r = hazelFromEvents([
      row(1, "run_started"),
      row(2, "budget_spent", { tool: "crs_identity_check", budget: { spent: 3, limit: 60 } }),
      row(3, "budget_spent", { tool: "compare_documents", budget: { spent: 4, limit: 60 } }),
      row(4, "status_changed", { loan_ids: ["L0001"], result: { status: "Investigate" } }),
      row(5, "question_asked"),
      row(6, "status_changed", { loan_ids: ["L0001"], result: { status: "No material anomaly found" } }),
      row(7, "run_finished", { budget: { spent: 4, limit: 60 } }),
    ]);
    expect(r).toMatchObject({ acorns: 4, crs_calls: 1, simulated_calls: 0, questions: 1, runtime_ms: 6000 });
    expect([...r.statuses]).toEqual([["L0001", "No material anomaly found"]]);
  });
});

describe("the score reads the answer key", () => {
  test("ring found, innocents flagged, other flags and review cases", () => {
    const ring = key.rings[0].loan_ids, twins = key.lookalikes.find((x) => x.proving_check === "check_address")!.loan_ids;
    const review = key.review_cases[0];
    const statuses = new Map([...ring.slice(0, 4).map((id) => [id, "Investigate"] as const), [twins[0], "Investigate"],
      [review.loan_ids[0], review.expected_status], ["L0002", "Investigate"]]) as AgentResult["statuses"];
    const s = score({ agent: "t", statuses, acorns: 9, crs_calls: 3, simulated_calls: 0, questions: 0, runtime_ms: 0 }, key);
    expect(s).toMatchObject({ ring_found: 4, ring_total: 6, innocents_flagged: 1, review_right: 1, review_total: 3 });
    expect(s.other_flagged).toBe(ring.includes("L0002") || twins.includes("L0002") ? 0 : 1);
  });
});

describe("the baselines", () => {
  test("fixed rules: the whole ring, but also the apartment twins and the spouses (no innocent explanations)", async () => {
    const s = score(await fixedRules(loans, replayCrs()), key);
    expect(s.ring_found).toBe(6);
    const flagged = (await fixedRules(loans, replayCrs())).statuses;
    const twins = key.lookalikes.find((x) => x.proving_check === "check_address")!.loan_ids;
    const spouses = key.lookalikes.find((x) => x.proving_check.startsWith("household"))!.loan_ids;
    expect([...twins, ...spouses].every((id) => flagged.get(id) === "Investigate")).toBe(true);
    expect(s.acorns).toBeLessThanOrEqual(60);
  });

  test("check everything: only the ring members with a bureau file, at the full price of every CRS product", async () => {
    const r = await checkEverything(loans, replayCrs(), Date.parse("2026-10-24T23:11:57Z"));
    const s = score(r, key);
    expect(s.ring_found).toBe(3); // the three personas; background ring members have no sandbox file
    const p16 = key.review_cases.find((x) => x.reason.includes("fraud alert"))!.loan_ids[0];
    expect(r.statuses.get(p16)).toBe("Investigate");
    expect(r.acorns).toBeGreaterThan(60);
  });
});

describe("the proof table", () => {
  test("one row per agent, the run and the detector named, and a not-frozen run says so", () => {
    const s = score({ agent: "Threadpull (Hazel)", statuses: new Map(), acorns: 10, crs_calls: 3, simulated_calls: 1, questions: 0, runtime_ms: 58_100 }, key);
    const md = renderProof([s], { seed: 13, run_id: "r13-x", crs: "recorded", commit: "abc1234", detector: "not frozen", generated_at: "2026-10-25 07:30 UTC" });
    expect(md).toContain("## Seed 13");
    expect(md).toContain("| Threadpull (Hazel) | 0 of 6 | 0 of 50 | 0 | 0 of 3 | 10 | 3 (1 simulated) | 0 | 58.1 s |");
    expect(md).toContain("detector: not frozen");
    expect(md).toContain("recorded, not live");
  });
});

describe("when the ring was complete", () => {
  test("the budget on the row where the last ring member Hazel flags was first marked Investigate", () => {
    const ring = key.rings[0].loan_ids;
    const at = (seq: number, ids: string[], status: string, spent: number) => row(seq, "status_changed", { loan_ids: ids, result: { status }, budget: { spent, limit: 60 } });
    const events = [row(1, "run_started"), at(2, ring.slice(0, 3), "Investigate", 6), at(3, ["L0002"], "No material anomaly found", 7),
      at(4, ring.slice(3), "Investigate", 9), at(5, ["L0003"], "Insufficient evidence", 60)];
    expect(ringCompleteAt(events, key)).toBe(9);
    expect(ringCompleteAt([row(1, "run_started")], key)).toBeNull();
    const md = renderProof([], { seed: 13, run_id: "r", crs: "live", commit: "c", detector: "d", generated_at: "t", hazel_ring_acorns: { at: 9, total: 60 } });
    expect(md).toContain("all marked Investigate after **9 acorns**; the other 51 went on");
  });
});
