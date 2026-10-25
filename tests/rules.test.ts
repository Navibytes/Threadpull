// Ticket 11: ask once, remember forever. The hospital question becomes R-001, the next lookalike clears itself
// citing it, and the 38-staff dental group (outside the scope) asks again.
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ToolResult } from "@/lib/contracts/tool-result";
import { RuleSchema, type EvidenceItem, type Rule, type RuleContext } from "@/lib/contracts/rule";
import { EventSchema } from "@/lib/contracts/event";
import { createDataRoom, runTool, type DataRoom } from "@/lib/agent";
import type { EmployerCheck } from "@/lib/evidence";
import { loadReference } from "@/lib/ingest/reference";
import {
  answerQuestion, applyRule, askHuman, confidence, currentRules, employerLink, employerQuestion, matchRule,
  MemoryRuleStore, reasonFor, route, type TenureFact,
} from "@/lib/rules";
import { generate, type AnswerKey } from "@/data/generate";

let key: AnswerKey, freshRoom: () => DataRoom;
beforeAll(() => {
  const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
  const r = generate(join(import.meta.dir, "..", "data", "patterns", "seed13.json"), tmp(), tmp());
  key = JSON.parse(readFileSync(join(r.keyDir, "answer_key.json"), "utf8"));
  const ref = loadReference(r.outDir);
  freshRoom = () => createDataRoom(r.normalized, ref);
});

// Tenure comes from crs_credit_report once B's ticket 06 lands; here it's a labelled test stand-in.
const tenure = (loanId: string, value = true): TenureFact =>
  ({ value, sources: [{ kind: "lookup", name: "test_credit_file_tenure", key: loanId, simulated: true }] });
const employerOf = (room: DataRoom, loanId: string) => room.graph.entitiesOf(loanId).find((e) => room.graph.kind(e) === "employer")!;
const check = (room: DataRoom, loanId: string) =>
  runTool(room, "check_employer", { employer: employerOf(room, loanId) }) as ToolResult<EmployerCheck>;
const askAbout = (store: MemoryRuleStore, room: DataRoom, loanId: string, t?: TenureFact) => {
  const link = employerLink(room.graph, loanId, check(room, loanId), t);
  return askHuman(store, { run_id: "r13-test", loan_ids: [loanId], question: employerQuestion(link.proposed_rule), topic: "policy",
    context: link.context, evidence: link.evidence, proposed_rule: link.proposed_rule, sources: link.sources });
};

describe("asking the right person", () => {
  test("code routes each topic", () => {
    expect([route("policy"), route("fraud_alert"), route("partial_data"), route("bureau_disagreement"), route("buyback"), route("sanctions")])
      .toEqual(["CRO", "CRO", "credit analyst", "credit analyst", "legal", "compliance"]);
  });

  test("confidence and reason come from the evidence, not the model", () => {
    const item = (weight: number): EvidenceItem => ({ label: "x", weight, sources: [] });
    expect(confidence({ for: [], against: [] })).toBe(50);
    expect(confidence({ for: [item(3)], against: [item(1)] })).toBe(75);
    expect(reasonFor({ for: [item(1)], against: [] })).toBe("no precedent");
    expect(reasonFor({ for: [item(1)], against: [item(1)] })).toBe("sources disagree");
  });

  test("a ring employer scores low: tiny company, most of its staff borrowed, other links stand", () => {
    const room = freshRoom(), lead = key.rings[0].loan_ids[0];
    const link = employerLink(room.graph, lead, check(room, lead));
    expect(confidence(link.evidence)).toBeLessThanOrEqual(34);
    expect(reasonFor(link.evidence)).toBe("sources disagree");
  });
});

describe("ask once, remember forever (seed 13)", () => {
  const store = new MemoryRuleStore();
  let room: DataRoom, hospital: string[], dental: string[], rule: Rule;
  beforeAll(() => {
    room = freshRoom();
    hospital = key.lookalikes.find((x) => x.loan_ids.length === 40)!.loan_ids;
    dental = key.lookalikes.find((x) => x.loan_ids.length === 3)!.loan_ids;
  });

  test("1. no rule yet: one precise question to the CRO", async () => {
    const out = await askAbout(store, room, hospital[0], tenure(hospital[0]));
    if (out.status !== "asked") throw new Error(out.status);
    const q = out.question;
    expect([q.id, q.to, q.reason, q.topic]).toEqual(["q-001", "CRO", "no precedent", "policy"]);
    expect(q.confidence).toBeGreaterThanOrEqual(90);
    expect(q.proposed_rule).toEqual({ link_kind: "employer", min_group_size: 500, tenure_on_credit_file: true });
    expect(q.question).toBe("Is a shared employer with 500+ staff a valid explanation if tenure is on the credit file?");
    expect(out.event.result).toMatchObject({ question_id: "q-001", to: "CRO" });
  });

  test("2. the same open question is never asked twice", async () => {
    const out = await askAbout(store, room, hospital[1], tenure(hospital[1]));
    expect(out.status).toBe("already_asked");
    expect((await store.questions()).length).toBe(1);
    expect((await store.questions())[0].loan_ids).toContain(hospital[1]);
  });

  test("3. the CRO's yes becomes R-001 v1", async () => {
    const out = await answerQuestion(store, { question_id: "q-001", decision: "yes", answered_by: "CRO",
      text: "Large employer; tenure confirmed on the credit file." }, new Date("2026-10-24T22:42:00Z"));
    rule = out.rule!;
    expect(RuleSchema.parse(rule)).toMatchObject({ id: "R-001", version: 1, then: "explain_link",
      created_from: "question q-001, answered by CRO at 2026-10-24T22:42:00.000Z",
      when: { link_kind: "employer", min_group_size: 500, tenure_on_credit_file: true } });
    expect(out.event.sources).toContainEqual({ kind: "human", question_id: "q-001", answered_by: "CRO" });
    await expect(answerQuestion(store, { question_id: "q-001", decision: "no", answered_by: "CRO", text: "x" })).rejects.toThrow();
  });

  test("4. the next lookalike clears itself citing R-001, with no new question", async () => {
    const loan = hospital[2], entity = employerOf(room, loan);
    const out = await askAbout(store, room, loan, tenure(loan));
    if (out.status !== "rule_applies") throw new Error(out.status);
    const done = applyRule(room.graph, out.match.rule, loan, entity, { simulated: true, at: { run_id: "r13-test", seq: 12 } })!;
    expect(done.edges.length).toBe(39);
    expect(done.edges.every((e) => e.kind === "employer" && e.explained && e.weight === 0 && e.explanation_ref!.check === "rule")).toBe(true);
    expect(done.applied).toMatchObject({ rule_id: "R-001", version: 1 });
    expect(done.clue.sources).toContainEqual({ kind: "rule", rule_id: "R-001", version: 1 });
    expect((await store.questions()).length).toBe(1);
    // the clue_explained payload fits C's event contract as is
    expect(EventSchema.safeParse({ run_id: "r13-test", seq: 13, ts: "2026-10-24T22:43:00Z", type: "clue_explained",
      loan_ids: done.clue.loan_ids, tool: null, result: done.clue.result, sources: done.clue.sources,
      note: "Same hospital as an earlier ruling; R-001 covers it.", budget: { spent: 9, limit: 60 }, simulated: done.clue.simulated }).success).toBe(true);
    expect(applyRule(room.graph, out.match.rule, loan, entity, { simulated: true })).toBeNull(); // nothing left to take down
  });

  test("5. tenure not checked yet: check first, don't ask", async () => {
    const out = await askAbout(store, room, hospital[3]);
    expect(out.status).toBe("check_first");
    if (out.status === "check_first") expect(out.match.missing).toEqual(["tenure_on_credit_file"]);
  });

  test("6. a 38-staff employer is outside R-001's scope: Hazel asks again", async () => {
    const out = await askAbout(store, room, dental[0], tenure(dental[0]));
    if (out.status !== "asked") throw new Error(out.status);
    expect([out.question.id, out.question.context?.group_size, out.question.proposed_rule?.min_group_size]).toEqual(["q-002", 38, 38]);
  });

  test("7. a no saves no rule, and the links stay up", async () => {
    const out = await answerQuestion(store, { question_id: "q-002", decision: "no", answered_by: "CRO", text: "Too small to rule on in general." });
    expect([out.rule, out.question.answer?.rule_id]).toEqual([null, null]);
    expect((await currentRules(store)).map((r) => r.id)).toEqual(["R-001"]);
    expect(room.graph.edgesOf(dental[0]).filter((e) => e.kind === "employer").every((e) => !e.explained)).toBe(true);
  });
});

describe("rule versions and matching", () => {
  const ctx = (group_size: number | null, tenure: boolean | null): RuleContext => ({ link_kind: "employer", group_size, tenure_on_credit_file: tenure });
  const rule = (id: string, when: Rule["when"], version = 1): Rule => ({ id, when, version, then: "explain_link",
    created_from: "test", reason_text: "test", ruled_at: "2026-10-24T00:00:00Z", confirmed_by: "CRO" });

  test("widening a rule saves v2 and keeps v1", async () => {
    const store = new MemoryRuleStore();
    const ask = (size: number) => askHuman(store, { run_id: "r", loan_ids: ["L0001"], question: "q?", topic: "policy",
      context: ctx(size, true), evidence: { for: [], against: [] }, proposed_rule: { link_kind: "employer", min_group_size: size }, sources: [] });
    const first = await ask(1000);
    if (first.status !== "asked") throw new Error(first.status);
    await answerQuestion(store, { question_id: first.question.id, decision: "yes", answered_by: "CRO", text: "v1" });
    const second = await ask(100); // outside v1's scope (500+), so it is asked
    if (second.status !== "asked") throw new Error(second.status);
    await answerQuestion(store, { question_id: second.question.id, decision: "yes", answered_by: "CRO", text: "v2", rule_id: "R-001" });
    expect((await store.ruleVersions()).map((r) => [r.id, r.version, r.when.min_group_size])).toEqual([["R-001", 1, 1000], ["R-001", 2, 100]]);
    expect((await currentRules(store)).map((r) => [r.id, r.version])).toEqual([["R-001", 2]]);
    await expect(answerQuestion(store, { question_id: "q-404", decision: "yes", answered_by: "CRO", text: "x" })).rejects.toThrow();
  });

  test("the most specific matching rule wins; unknown facts never count as holding", () => {
    const broad = rule("R-001", { link_kind: "employer", min_group_size: 500 });
    const narrow = rule("R-002", { link_kind: "employer", min_group_size: 500, tenure_on_credit_file: true });
    expect(matchRule([broad, narrow], ctx(48000, true))).toMatchObject({ status: "match", rule: { id: "R-002" } });
    expect(matchRule([narrow], ctx(48000, null))).toMatchObject({ status: "missing", missing: ["tenure_on_credit_file"] });
    expect(matchRule([narrow], ctx(null, true))).toMatchObject({ status: "missing", missing: ["group_size"] });
    expect(matchRule([narrow], ctx(38, true)).status).toBe("outside_scope");
    expect(matchRule([narrow], { ...ctx(48000, true), link_kind: "phone" }).status).toBe("no_rule");
  });

  test("a rule's scope can only use the known conditions", () => {
    expect(RuleSchema.safeParse({ ...rule("R-001", { link_kind: "employer" }), when: { link_kind: "employer", persona: "x" } }).success).toBe(false);
  });
});

test("lib/rules names no planted case, persona, employer or rule", () => {
  const dir = join(import.meta.dir, "..", "lib", "rules");
  for (const f of readdirSync(dir)) {
    const hits = readFileSync(join(dir, f), "utf8").match(/\bL\d{4}\b|\bP\d{2}\b|\bR-\d{3}\b|Meridian|Kestrel|Brightline|hospital/gi);
    expect([f, hits]).toEqual([f, null]);
  }
});
