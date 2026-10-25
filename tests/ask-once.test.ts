// Ticket 11, end to end: ask once, remember forever, across two runs and a person's answer. Run 1 asks the CRO about the
// shared hospital employer; the CRO's yes on the answer API becomes R-001 in the rule store; run 2 takes the next hospital
// link down citing R-001 without asking, and asks again about the 38-staff dental group (outside the rule's scope).
// Scripted model and recorded CRS (no network); a real FileRuleStore and run folder in a temp directory.
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { generate } from "@/data/generate";
import { HAZEL_MODEL, jsonlSink, runHazel, type HazelRun } from "@/lib/agent";
import { EventSchema, type Event } from "@/lib/contracts/event";
import type { Loan } from "@/lib/contracts/loan";
import { questionsFor, recordAnswer } from "@/lib/deal/questions";
import { readRun } from "@/lib/deal/service";
import { loadReference, type Reference } from "@/lib/ingest/reference";
import { currentRules, employerLink, employerQuestion, FileRuleStore } from "@/lib/rules";
import { createDataRoom, runTool } from "@/lib/agent";
import type { ToolResult } from "@/lib/contracts/tool-result";
import type { EmployerCheck } from "@/lib/evidence";
import { client as replayCrs } from "./crs-replay";

type Call = { name: string; input: Record<string, unknown> };
function scripted(turns: (Call[] | string)[]) {
  let n = 0;
  const fetch = (async () => {
    const turn = turns[Math.min(n++, turns.length - 1)];
    const content = typeof turn === "string" ? [{ type: "text", text: turn }]
      : turn.map((c, i) => ({ type: "tool_use", id: `toolu_${n}_${i}`, name: c.name, input: c.input }));
    return new Response(JSON.stringify({ id: `msg_${n}`, type: "message", role: "assistant", model: HAZEL_MODEL, content,
      stop_reason: typeof turn === "string" ? "end_turn" : "tool_use", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }),
    { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof globalThis.fetch;
  return new Anthropic({ apiKey: "test-key", fetch, maxRetries: 0 });
}

// seed 13: P02's and P10's loans at Meridian Health System (48,000 staff), one of Kestrel Dental Group's (38 staff)
const [HOSPITAL_1, HOSPITAL_2, DENTAL] = ["L0534", "L0170", "L0398"];
const HOSPITAL = "Meridian Health System", DENTIST = "Kestrel Dental Group";

let loans: Loan[], reference: Reference, root: string, store: FileRuleStore;
beforeAll(() => {
  const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
  const g = generate(join(import.meta.dir, "..", "data", "patterns", "seed13.json"), tmp(), tmp());
  loans = g.normalized;
  reference = loadReference(g.outDir);
  root = tmp();
  store = new FileRuleStore(join(root, "rules.json"));
});

const hazel = (runId: string, leads: string[], turns: (Call[] | string)[]) => {
  return runHazel({ runId, loans, seed: 13, reference, anthropic: scripted(turns), crs: replayCrs(), rules: store, leads, sweep: false,
    sinks: [jsonlSink(join(root, runId, "events.jsonl"))], now: () => new Date("2026-10-25T03:00:00Z") });
};
const ofType = (events: readonly Event[], type: Event["type"]) => events.filter((e) => e.type === type);

describe("the employer question proposes only what the run can check", () => {
  test("no tenure fact: the scope is the headcount alone, and the question says so", () => {
    const room = createDataRoom(loans, reference);
    const entity = room.graph.entitiesOf(HOSPITAL_1).find((e) => room.graph.kind(e) === "employer")!;
    const link = employerLink(room.graph, HOSPITAL_1, runTool(room, "check_employer", { employer: entity }) as ToolResult<EmployerCheck>);
    expect(link.proposed_rule).toEqual({ link_kind: "employer", min_group_size: 500 });
    expect(employerQuestion(link.proposed_rule)).toBe("Is a shared employer with 500+ staff a valid explanation?");
  });
});

describe("ask once, remember forever, across runs", () => {
  let run1: HazelRun, run2: HazelRun;
  beforeAll(async () => {
    run1 = await hazel("r13-ask-1", [HOSPITAL_1], [
      [{ name: "check_employer", input: { employer: HOSPITAL, loan_id: HOSPITAL_1 } }],
      [{ name: "ask_human", input: { question: "Does a 48,000-staff hospital explain 40 loans naming it?", topic: "policy",
        loan_ids: [HOSPITAL_1], employer_loan_id: HOSPITAL_1 } }],
      [{ name: "close_lead", input: { loan_id: HOSPITAL_1 } }],
      "Asked the CRO about the hospital.",
    ]);
  });

  test("run 1: the operator's lead is worked first and recorded as the operator's choice", () => {
    const started = ofType(run1.events, "run_started")[0];
    expect(started.result.operator_leads).toEqual([HOSPITAL_1]);
    const lead = ofType(run1.events, "lead_opened")[0];
    expect([lead.loan_ids, lead.note]).toEqual([[HOSPITAL_1], expect.stringContaining("chosen by the operator")]);
  });

  test("run 1: no rule yet, so the CRO gets one question, kept in the store", async () => {
    const asked = ofType(run1.events, "question_asked");
    expect(asked).toHaveLength(1);
    expect(asked[0].result).toMatchObject({ question_id: "q-001", to: "CRO", topic: "policy" });
    expect(existsSync(join(root, "rules.json"))).toBe(true);
    const q = (await new FileRuleStore(join(root, "rules.json")).questions())[0]; // a second instance: it's on disk
    expect([q.id, q.status, q.run_id]).toEqual(["q-001", "pending", "r13-ask-1"]);
    expect(q.proposed_rule).toEqual({ link_kind: "employer", min_group_size: 500 });
    // held for the person, not cleared: a loan waiting on a question stays Investigate (lib/agent/status.ts)
    const status = ofType(run1.events, "status_changed").find((e) => e.loan_ids.includes(HOSPITAL_1))!;
    expect(status.result).toMatchObject({ status: "Investigate", reason: "waiting on a question to a person" });
  });

  test("the answer API: refusals first, then the CRO's yes becomes R-001 and a question_answered row", async () => {
    const deps = { root, store, db: null, now: () => new Date("2026-10-25T03:05:00Z") };
    const yes = { run_id: "r13-ask-1", question_id: "q-001", decision: "yes", answered_by: "CRO",
      text: "A large employer explains a shared employer link: many borrowers work there." };
    expect(await recordAnswer({ ...yes, text: "ok" }, deps)).toMatchObject({ ok: false, status: 400 });
    expect(await recordAnswer({ ...yes, run_id: "r13-nope" }, deps)).toMatchObject({ ok: false, status: 404 });
    expect(await recordAnswer({ ...yes, decision: "no", min_group_size: 100 }, deps)).toMatchObject({ ok: false, status: 400 });
    expect(await recordAnswer({ ...yes, extra: 1 }, deps)).toMatchObject({ ok: false, status: 400 });

    const out = await recordAnswer(yes, deps);
    if (!out.ok) throw new Error(out.error);
    expect(out.rule).toMatchObject({ id: "R-001", version: 1, when: { link_kind: "employer", min_group_size: 500 }, confirmed_by: "CRO" });
    expect(out.mirror).toEqual({ status: "skipped", why: "Supabase is not configured here" });
    const rows = readRun("r13-ask-1", root)!.events;
    const answered = rows.at(-1)!;
    expect(EventSchema.parse(answered).type).toBe("question_answered");
    expect(answered.seq).toBe(rows.at(-2)!.seq + 1);
    expect(answered.result).toMatchObject({ question_id: "q-001", decision: "yes", rule_id: "R-001", version: 1 });
    expect(answered.sources).toContainEqual({ kind: "human", question_id: "q-001", answered_by: "CRO" });
    expect(await recordAnswer(yes, deps)).toMatchObject({ ok: false, status: 409 }); // asked once, answered once
    const q = await questionsFor("r13-ask-1", deps);
    expect([q!.questions[0].status, q!.rules.map((r) => r.id)]).toEqual(["answered", ["R-001"]]);
  });

  test("run 2: the next hospital link comes down citing R-001, nobody is asked", async () => {
    expect((await currentRules(store)).map((r) => r.id)).toEqual(["R-001"]);
    run2 = await hazel("r13-ask-2", [HOSPITAL_2, DENTAL], [
      [{ name: "check_employer", input: { employer: HOSPITAL, loan_id: HOSPITAL_2 } }],
      [{ name: "close_lead", input: { loan_id: HOSPITAL_2 } }],
      [{ name: "check_employer", input: { employer: DENTIST, loan_id: DENTAL } }],
      [{ name: "ask_human", input: { question: "Does a 38-staff dental group explain the loans naming it?", topic: "policy",
        loan_ids: [DENTAL], employer_loan_id: DENTAL } }],
      [{ name: "close_lead", input: { loan_id: DENTAL } }],
      "R-001 covered the hospital; asked about the dental group.",
    ]);
    const applied = ofType(run2.events, "rule_applied");
    expect(applied).toHaveLength(1);
    expect(applied[0].result).toMatchObject({ rule_id: "R-001", version: 1 });
    expect(applied[0].loan_ids).toContain(HOSPITAL_2);
    const down = ofType(run2.events, "clue_explained").find((e) => e.result.explained_by === "rule")!;
    expect(down.result.rule_id).toBe("R-001");
    expect(down.sources).toContainEqual({ kind: "rule", rule_id: "R-001", version: 1 });
    // the threads the check drew (a board's worth, 8 at most) are among the ones that come down
    const drawn = ofType(run2.events, "link_found").filter((e) => e.tool === "check_employer" && e.seq < down.seq).map((e) => e.result.edge_id);
    expect(drawn.length).toBeGreaterThan(0);
    expect(drawn.every((id) => (down.result.edge_ids as string[]).includes(id as string))).toBe(true);
    expect(ofType(run2.events, "question_asked").some((e) => e.loan_ids.includes(HOSPITAL_2))).toBe(false);
    expect(run2.statuses.get(HOSPITAL_2)).toBe("No material anomaly found");
  });

  test("run 2: the operator's second lead is suggested next, and the 38-staff dental group, outside R-001, asks again", async () => {
    const leads = ofType(run2.events, "lead_opened");
    expect(leads.map((e) => e.loan_ids[0])).toEqual([HOSPITAL_2, DENTAL]);
    expect(leads[1].note).toContain("chosen by the operator");
    const asked = ofType(run2.events, "question_asked");
    expect(asked).toHaveLength(1);
    expect(asked[0].result).toMatchObject({ question_id: "q-002", to: "CRO" });
    expect(asked[0].loan_ids).toEqual([DENTAL]);
    const q2 = (await store.questions()).find((q) => q.id === "q-002")!;
    expect(q2.proposed_rule).toEqual({ link_kind: "employer", min_group_size: 38 });
    expect(ofType(run2.events, "rule_applied").some((e) => e.loan_ids.includes(DENTAL))).toBe(false);
  });

  test("an operator lead outside the portfolio is refused before the run starts", async () => {
    await expect(hazel("r13-ask-x", ["L9999"], ["done"])).rejects.toThrow("operator lead not in the portfolio: L9999");
  });

  test("with no operator leads the run starts at the top-ranked lead, as before", async () => {
    const plain = await hazel("r13-ask-plain", [], ["done"]);
    expect(ofType(plain.events, "run_started")[0].result.operator_leads).toBeUndefined();
    expect(ofType(plain.events, "lead_opened")[0].note).toMatch(/^Top lead by rank/);
  });
});

describe("FileRuleStore", () => {
  const rule = { id: "R-001", created_from: "question q-001, answered by CRO", when: { link_kind: "employer" as const, min_group_size: 500 },
    then: "explain_link" as const, reason_text: "Large employer.", version: 1, ruled_at: "2026-10-25T03:00:00Z", confirmed_by: "CRO" };
  test("no file yet: empty; versions are append-only and survive a new instance", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "tp-")), "nested", "rules.json");
    const a = new FileRuleStore(path);
    expect([await a.ruleVersions(), await a.questions()]).toEqual([[], []]);
    await a.addRuleVersion(rule);
    await expect(a.addRuleVersion(rule)).rejects.toThrow("R-001 v1 already saved");
    await a.addRuleVersion({ ...rule, version: 2, reason_text: "Large employer, v2." });
    const b = new FileRuleStore(path);
    expect((await b.ruleVersions()).map((r) => r.version)).toEqual([1, 2]);
    expect((await currentRules(b))[0].reason_text).toBe("Large employer, v2.");
    expect(JSON.parse(readFileSync(path, "utf8")).rules).toHaveLength(2);
  });
  test("an invalid rule is refused and nothing is written", async () => {
    const path = join(mkdtempSync(join(tmpdir(), "tp-")), "rules.json");
    const s = new FileRuleStore(path);
    await expect(s.addRuleVersion({ ...rule, id: "rule one" })).rejects.toThrow();
    expect(existsSync(path)).toBe(false);
  });
});
