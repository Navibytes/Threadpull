// Ticket 14: the CRO memo. The model is a scripted stand-in (no key, no network): what is tested is the code around it, which
// lays out the facts, and keeps only the sentences it can check. Real Hazel run on seed 13 with credit reports (tests/deal-run.ts).
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import Anthropic from "@anthropic-ai/sdk";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MEMO_MODEL } from "@/lib/agent/models";
import { buildReport, type DealReport } from "@/lib/deal";
import { checkSentences, memoFacts, numberTokens, writeMemo, type Facts, type MemoSentence } from "@/lib/deal/memo";
import { makeMemo, readMemo, recordDisposition } from "@/lib/deal/service";
import { dealRunWithCredit, type DealRun } from "./deal-run";

type Request = { model: string; system: string; messages: { role: string; content: string }[]; output_config: { effort: string; format: { type: string } } };

/** A fake Messages API that records the request and answers with `reply` as the model's text (or an error status). */
function fakeClaude(reply: unknown, status = 200) {
  const requests: Request[] = [];
  const fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    requests.push(JSON.parse(String(init?.body)));
    const body = status === 200
      ? { id: "msg_memo", type: "message", role: "assistant", model: MEMO_MODEL, content: [{ type: "text", text: typeof reply === "string" ? reply : JSON.stringify(reply) }],
        stop_reason: "end_turn", stop_sequence: null, usage: { input_tokens: 100, output_tokens: 50 } }
      : { type: "error", error: { type: "api_error", message: "the model is overloaded" } };
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "request-id": "req_memo" } });
  }) as typeof globalThis.fetch;
  return { anthropic: new Anthropic({ apiKey: "scripted", fetch, maxRetries: 0 }), requests };
}

const usd0 = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
let run: DealRun, report: DealReport, facts: Facts, finding: MemoSentence, money: MemoSentence;
const boundsOf = () => run.events.filter((e) => e.type === "run_started" || e.type === "run_finished").map((e) => e.seq);

beforeAll(async () => {
  run = await dealRunWithCredit();
  report = buildReport({ run_id: run.run_id, loans: run.loans, events: run.events, note: "Scripted stand-in for Claude." });
  facts = memoFacts(report, run.events);
  const lead = report.loans.find((l) => l.loan_id === run.ids.lead)!;
  const ring = report.concentration.rings[0];
  finding = { section: "findings", text: `The run found ${lead.loan_id}, with a balance of ${usd0(lead.balance)}, joined to the other loans in ${ring.ring_id}.`, event_seqs: ring.event_seqs };
  money = { section: "money", text: `The investigation spent ${report.spend.spent} acorns of the ${report.spend.limit} available.`, event_seqs: report.spend.event_seqs };
});

describe("the facts the model gets", () => {
  test("one line per fact, each with the event rows it comes from", () => {
    const lines = facts.text.split("\n");
    expect(lines[0]).toMatch(/^- \[events #\d+, #\d+\] Portfolio: 1000 loans, total principal \$[\d,]+\./);
    expect(lines.every((l) => /^- \[(events #\d+(, #\d+)*|no events)\] /.test(l))).toBe(true);
  });
  test("every loan that is not clear has a line with its proposed verdict; a clear loan has none", () => {
    for (const l of report.loans.filter((x) => x.verdict !== "Clear")) expect(facts.text).toContain(`${l.loan_id}: proposed ${l.proposed_verdict}`);
    expect(facts.text).not.toContain(`${run.ids.clean}:`);
    expect(facts.text).toContain("Credit score 660.");
  });
  test("the allow-lists hold what the facts mention and nothing else", () => {
    expect(facts.loans.has(run.ids.lead)).toBe(true);
    expect(facts.loans.has(run.ids.clean)).toBe(false);
    expect(facts.numbers.has("1000")).toBe(true);
    expect(facts.numbers.has("12345")).toBe(false);
    for (const q of report.concentration.rings[0].event_seqs) expect(facts.seqs.has(q)).toBe(true);
    expect(facts.seqs.has(999_999)).toBe(false);
  });
  test("free-text event notes never reach the model", () => {
    for (const e of run.events.filter((x) => x.type === "check_run" && x.note.length > 15)) expect(facts.text).not.toContain(e.note);
  });
});

describe("numbers in a sentence", () => {
  test("money and percentages are read as numbers; event numbers and loan ids are not", () => {
    expect(numberTokens("It is $1,234.50, or 13.5% of L0037 (events #14, #15), in 2026, 5 loans.")).toEqual(["1234.5", "13.5", "2026", "5"]);
  });
});

describe("which sentences stand", () => {
  test("a sentence with references the facts mention, loans from the report and numbers the report contains stands", () => {
    const { kept, dropped } = checkSentences([finding, money], facts);
    expect(dropped).toEqual([]);
    expect(kept.map((s) => s.text)).toEqual([finding.text, money.text]);
  });
  test("its event numbers are de-duplicated and in order", () => {
    const { kept } = checkSentences([{ ...money, event_seqs: [...money.event_seqs].reverse().concat(money.event_seqs) }], facts);
    expect(kept[0].event_seqs).toEqual(money.event_seqs);
  });
  const cases = (): [string, MemoSentence, string][] => [
    ["no event reference", { ...finding, event_seqs: [] }, "no event reference"],
    ["an event the facts do not mention", { ...finding, event_seqs: [999_999] }, "cites an event the facts do not mention"],
    ["a loan outside the report", { ...finding, text: "The run found L9999 in the ring." }, "names a loan outside the report"],
    ["a number the report does not contain", { ...money, text: "The investigation spent 12345 acorns." }, "uses a number the report does not contain"],
    ["a money amount worked out by the model", { ...money, text: "The bid is $1,000,001 lower." }, "uses a number the report does not contain"],
    ["calling a borrower a fraudster", { ...finding, text: `${run.ids.lead} is a fraudster.` }, "breaks the wording rules"],
    ["calling a rank the chance of fraud", { ...finding, text: "The rank shows the chance of fraud." }, "breaks the wording rules"],
    ["nothing at all", { ...finding, text: "  " }, "empty"],
  ];
  test("each of these is dropped, with its reason", () => {
    for (const [name, sentence, reason] of cases()) {
      const { kept, dropped } = checkSentences([sentence], facts);
      expect([name, kept]).toEqual([name, []]);
      expect([name, dropped]).toEqual([name, [{ text: sentence.text, reason }]]);
    }
  });
});

describe("asking the model", () => {
  test("keeps what passes, lists what does not, and records what the memo was written from", async () => {
    const { anthropic } = fakeClaude({ sentences: [finding, { ...finding, event_seqs: [] }, money, { ...money, text: "It saved 12345 acorns." }] });
    const memo = await writeMemo(anthropic, report, run.events, () => new Date("2026-10-25T08:00:00Z"));
    expect(memo.sentences.map((s) => s.text)).toEqual([finding.text, money.text]);
    expect(memo.dropped.map((d) => d.reason)).toEqual(["no event reference", "uses a number the report does not contain"]);
    expect(memo).toMatchObject({ run_id: run.run_id, based_on_seq: report.run.last_seq, written_at: "2026-10-25T08:00:00.000Z", model: "claude-sonnet-5-5", assumptions: { lgd: 0.55, margin: 0.04 } });
    expect(memo.basis).toEqual({ text: "Scripted stand-in for Claude.", event_seqs: boundsOf() });
  });
  test("a run with no note has no basis line", async () => {
    const plain = buildReport({ run_id: run.run_id, loans: run.loans, events: run.events });
    const memo = await writeMemo(fakeClaude({ sentences: [] }).anthropic, plain, run.events);
    expect(memo).toMatchObject({ sentences: [], dropped: [], basis: null });
  });
  test("the request: Sonnet 5.5 at medium effort, a JSON schema output, the rules, and only the report's facts", async () => {
    const { anthropic, requests } = fakeClaude({ sentences: [] });
    await writeMemo(anthropic, report, run.events);
    expect(requests).toHaveLength(1);
    expect(requests[0].model).toBe("claude-sonnet-5-5");
    expect(requests[0].output_config).toMatchObject({ effort: "medium", format: { type: "json_schema" } });
    expect(requests[0].system).toContain("Never call a person or a borrower a fraudster");
    expect(requests[0].messages).toEqual([{ role: "user", content: facts.text }]);
  });
  test("a reply that is not a memo is an error, not an empty memo", async () => {
    for (const reply of ["not json at all", { sentences: "none" }, { other: [] }])
      await expect(writeMemo(fakeClaude(reply).anthropic, report, run.events)).rejects.toThrow();
  });
  test("a run with no events has nothing to write about", async () => {
    await expect(writeMemo(fakeClaude({ sentences: [] }).anthropic, report, [])).rejects.toThrow("no events");
  });
});

describe("saved beside the run", () => {
  let root: string;
  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), "tp-memo-"));
    mkdirSync(join(root, run.run_id));
    writeFileSync(join(root, run.run_id, "events.jsonl"), run.events.map((e) => JSON.stringify(e)).join("\n") + "\n");
    writeFileSync(join(root, run.run_id, "run.json"), JSON.stringify({ run_id: run.run_id, spec: "data/patterns/seed13.json", seed: 13, model_note: "Scripted stand-in for Claude" }));
    mkdirSync(join(root, "empty"));
    writeFileSync(join(root, "empty", "events.jsonl"), "");
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));
  const deps = (anthropic?: Anthropic | null) => ({ root, loans: run.loans, db: null, anthropic });

  test("there is no memo before one is written", () => {
    expect(readMemo(run.run_id, root)).toBeNull();
    expect(readMemo("missing", root)).toBeNull();
  });
  test("without an API key, or for a run that is not there or has no events, no memo is attempted", async () => {
    expect(await makeMemo(run.run_id, {}, deps(null))).toMatchObject({ ok: false, status: 503 });
    expect(await makeMemo(run.run_id, {}, { root, loans: run.loans })).toMatchObject({ ok: false, status: 503 }); // under bun test the real client is never built
    expect(await makeMemo("missing", {}, deps(fakeClaude({ sentences: [] }).anthropic))).toMatchObject({ ok: false, status: 404 });
    expect(await makeMemo("empty", {}, deps(fakeClaude({ sentences: [] }).anthropic))).toMatchObject({ ok: false, status: 422 });
    expect(existsSync(join(root, run.run_id, "memo.json"))).toBe(false);
  });
  test("a memo is written under the analyst's assumptions and saved", async () => {
    const { anthropic, requests } = fakeClaude({ sentences: [finding] });
    const out = await makeMemo(run.run_id, { lgd: 0.7, margin: 0.1 }, deps(anthropic));
    if (!out.ok) throw new Error(out.error);
    expect(out.memo.assumptions).toEqual({ lgd: 0.7, margin: 0.1 });
    expect(requests[0].messages[0].content).toContain("loss given default 70.0%, margin 10.0%");
    expect(out.memo.sentences.map((s) => s.text)).toEqual([finding.text]);
    expect(readMemo(run.run_id, root)).toEqual({ memo: out.memo, stale: false });
  });
  test("a decision after the memo makes it stale", async () => {
    const before = readMemo(run.run_id, root)!;
    const done = await recordDisposition({ run_id: run.run_id, loan_ids: [run.ids.lead], decision: "approve", decided_by: "CRO" }, deps());
    expect(done.ok).toBe(true);
    expect(readMemo(run.run_id, root)).toEqual({ memo: before.memo, stale: true });
  });
  test("a model that fails leaves the saved memo as it was", async () => {
    const before = readMemo(run.run_id, root);
    const out = await makeMemo(run.run_id, {}, deps(fakeClaude(null, 500).anthropic));
    if (out.ok) throw new Error("the memo should not have been written");
    expect(out.status).toBe(502);
    expect(out.error).toContain("overloaded");
    expect(readMemo(run.run_id, root)).toEqual(before);
  });
});
