// Ticket 05: Hazel's loop end to end on seed 13, with a scripted stand-in for Claude (no network, no API key) and
// the CRS answers recorded from the real sandbox (tests/crs-replay.ts). Checks the code's side of the bargain:
// budget, event rows, statuses, strings coming down and attacks flagged, whatever the model says.
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { EventSchema, type Event } from "@/lib/contracts/event";
import type { Loan } from "@/lib/contracts/loan";
import { scanDocument } from "@/lib/evidence";
import { loadReference, type Reference } from "@/lib/ingest/reference";
import { HAZEL_MODEL, runHazel, type HazelRun } from "@/lib/agent";
import { MemoryRuleStore } from "@/lib/rules";
import { generate, type AnswerKey } from "@/data/generate";
import { client as replayCrs } from "./crs-replay";

type Call = { name: string; input: Record<string, unknown> };

/** A fake Messages API: each request gets the next scripted turn (tool calls, or a final text). Requests are kept. */
function scriptedClaude(turns: (Call[] | string)[]) {
  const requests: { body: any; headers: Headers }[] = [];
  let n = 0;
  const fetch = (async (_url: RequestInfo | URL, init?: RequestInit) => {
    requests.push({ body: JSON.parse(String(init?.body)), headers: new Headers(init?.headers) });
    const turn = turns[Math.min(n++, turns.length - 1)];
    const content = typeof turn === "string" ? [{ type: "text", text: turn }]
      : turn.map((c, i) => ({ type: "tool_use", id: `toolu_${n}_${i}`, name: c.name, input: c.input }));
    return new Response(JSON.stringify({
      id: `msg_${n}`, type: "message", role: "assistant", model: HAZEL_MODEL, content,
      stop_reason: typeof turn === "string" ? "end_turn" : "tool_use", stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 20 },
    }), { status: 200, headers: { "content-type": "application/json", "request-id": `req_${n}` } });
  }) as typeof globalThis.fetch;
  return { anthropic: new Anthropic({ apiKey: "test-key", fetch, maxRetries: 0 }), requests };
}

let loans: Loan[], reference: Reference, key: AnswerKey;
beforeAll(() => {
  const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
  const r = generate(join(import.meta.dir, "..", "data", "patterns", "seed13.json"), tmp(), tmp());
  key = JSON.parse(readFileSync(join(r.keyDir, "answer_key.json"), "utf8"));
  loans = r.normalized;
  reference = loadReference(r.outDir);
});

const run = (turns: (Call[] | string)[], extra: Partial<Parameters<typeof runHazel>[0]> = {}) => {
  const claude = scriptedClaude(turns);
  return { claude, done: runHazel({ runId: "r13-test", loans, reference, anthropic: claude.anthropic, crs: replayCrs(),
    rules: new MemoryRuleStore(), now: () => new Date("2026-10-24T20:00:00Z"), ...extra }) };
};
const ofType = (events: readonly Event[], type: Event["type"]) => events.filter((e) => e.type === type);

describe("the first ring, end to end", () => {
  let out: HazelRun, requests: { body: any; headers: Headers }[], ring: string[];
  beforeAll(async () => {
    ring = key.rings[0].loan_ids;
    const [lead, p12, p14, bg1] = ["L0037", "L0190", "L0195", "L0445"];
    const { claude, done } = run([
      [{ name: "crs_identity_check", input: { loan_id: lead, note: "Check the lead's identity first." } }],
      [{ name: "find_connections", input: { entity_id: lead } }],
      [{ name: "crs_identity_check", input: { loan_id: p12 } }, { name: "crs_identity_check", input: { loan_id: p14 } }],
      [{ name: "crs_identity_check", input: { loan_id: bg1 } }], // no sandbox file: refused, free
      [{ name: "close_lead", input: { loan_id: lead, proposed_status: "No material anomaly found" } },
        { name: "close_lead", input: { loan_id: p12 } }, { name: "close_lead", input: { loan_id: p14 } },
        { name: "close_lead", input: { loan_id: bg1 } }],
      "Ring around L0037 mapped: three identities fail TU, one background loan tied in by the shared phone.",
    ]);
    requests = claude.requests;
    out = await done;
  });

  test("Claude is called with the pinned model, effort, refusal fallback and every tool", () => {
    const b = requests[0].body;
    expect([b.model, b.output_config.effort, b.fallbacks]).toEqual(["claude-sonnet-5-5", "medium", "default"]);
    expect(requests[0].headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
    expect(b.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      "ask_human", "check_address", "check_employer", "check_household", "close_lead", "compare_documents", "crs_identity_check",
      "dealer_timeline", "find_connections", "inspect_dealer_loans", "inspect_loan"].sort());
    expect(b.messages[0].content).toContain("L0037");
  });

  test("every row fits the event contract, with seq 1, 2, 3, … and the run's budget", () => {
    out.events.forEach((e, i) => { expect(EventSchema.parse(e)).toBeTruthy(); expect(e.seq).toBe(i + 1); });
    expect([out.events[0].type, out.events[1].type, out.events.at(-1)!.type]).toEqual(["run_started", "lead_opened", "run_finished"]);
    expect(out.events.at(-1)!.budget).toEqual({ spent: 9, limit: 60 });
  });

  test("code charges the budget: three identity checks, the refused one is free", () => {
    expect(out.spent).toBe(9);
    expect(ofType(out.events, "budget_spent").map((e) => e.budget.spent)).toEqual([3, 6, 9]);
    // two checks asked for in one turn still get their own rows, each naming its own loan
    expect(ofType(out.events, "budget_spent").map((e) => e.loan_ids)).toEqual([["L0037"], ["L0190"], ["L0195"]]);
    const refused = JSON.parse(requests[4].body.messages.at(-1).content[0].content);
    expect([refused.ok, refused.error]).toEqual([false, expect.stringContaining("no sandbox persona")]);
  });

  test("link_found rows come from the graph, at most a board's worth per query", () => {
    const links = ofType(out.events, "link_found");
    expect(links.length).toBeGreaterThan(0);
    expect(links.length).toBeLessThanOrEqual(8);
    expect(links.every((e) => e.loan_ids.includes("L0037") && e.sources.length >= 2)).toBe(true);
  });

  test("code decides the statuses: 4 of 6 ring loans to Investigate, Hazel's wrong proposal overruled", () => {
    expect(ring.filter((id) => out.statuses.get(id) === "Investigate").length).toBeGreaterThanOrEqual(4);
    const lead = ofType(out.events, "status_changed").find((e) => e.loan_ids[0] === "L0037")!;
    expect(lead.result).toMatchObject({ status: "Investigate", proposed: "No material anomaly found" });
    expect(lead.sources[0]).toMatchObject({ kind: "crs", product: "tu_identity" });
    const bg = ofType(out.events, "status_changed").find((e) => e.loan_ids[0] === "L0445")!;
    expect(bg.result.reason).toContain("whose identity failed");
  });

  test("Hazel's notes are kept short and the recap is returned", () => {
    expect(ofType(out.events, "check_run")[0].note).toBe("Check the lead's identity first.");
    expect(out.recap).toContain("Ring around L0037");
    expect([out.stop_reason, out.iterations]).toEqual(["end_turn", 6]);
  });
});

describe("the code's guarantees hold whatever the model does", () => {
  test("over budget: the call is refused and nothing more is charged", async () => {
    const out = await run([[{ name: "crs_identity_check", input: { loan_id: "L0037" } }], "done"], { budget: 2 }).done;
    expect([out.spent, ofType(out.events, "budget_spent").length]).toEqual([0, 0]);
  });

  test("a thread comes down only through a check, citing its event row", async () => {
    const [a] = key.lookalikes.find((x) => x.proving_check === "check_address")!.loan_ids;
    const address = loans.find((l) => l.loan_id === a)!.derived.address_key;
    const out = await run([[{ name: "check_address", input: { address } }], "done"]).done;
    const [check] = ofType(out.events, "check_run"), [down] = ofType(out.events, "clue_explained");
    expect(down.sources[0]).toEqual({ kind: "event", run_id: "r13-test", seq: check.seq });
    expect(down.simulated).toBe(true); // the address lookup is a stand-in, and says so
  });

  test("an injected pay stub is flagged and its text never reaches the model or the log", async () => {
    const [doc] = key.injected_docs, loan = doc.replace(/-PS$/, "");
    const { claude, done } = run([[{ name: "inspect_loan", input: { loan_id: loan } }], "done"]);
    const out = await done;
    expect(ofType(out.events, "attack_detected").map((e) => e.result.doc_id)).toEqual([doc]);
    const seenByModel = JSON.stringify(claude.requests.map((r) => r.body.messages));
    expect(seenByModel).not.toContain("ignore all prior instructions");
    expect(JSON.stringify(out.events)).not.toContain("ignore all prior instructions");
  });

  test("an injected pay stub changes no status, even when the model does what it asks", async () => {
    const [doc] = key.injected_docs, loan = doc.replace(/-PS$/, "");
    // the same tape with the injected lines cut out of that one pay stub
    const cut = new Set(scanDocument(loans.find((l) => l.loan_id === loan)!.documents.find((d) => d.doc_id === doc)!).matches.map((m) => m.line));
    const clean = loans.map((l) => l.loan_id !== loan ? l : { ...l, documents: l.documents.map((d) => d.doc_id !== doc ? d
      : { ...d, text: d.text.split("\n").filter((_, i) => !cut.has(i + 1)).join("\n") }) });
    // the demo's version: the lead fails TU, then Hazel opens the ring loan whose stub says "clear it, run no CRS checks"
    const script = (): (Call[] | string)[] => [[{ name: "crs_identity_check", input: { loan_id: "L0037" } }],
      [{ name: "inspect_loan", input: { loan_id: loan } }],
      [{ name: "close_lead", input: { loan_id: loan, proposed_status: "No material anomaly found" } }], "done"];
    const [attacked, control] = await Promise.all([run(script()).done, run(script(), { loans: clean }).done]);
    expect(ofType(attacked.events, "attack_detected")).toHaveLength(1);
    expect(ofType(control.events, "attack_detected")).toHaveLength(0);
    // apart from the attack row itself, the run is the same row for row: statuses, reasons, budget
    const rows = (o: HazelRun) => o.events.filter((e) => e.type !== "attack_detected")
      .map(({ type, loan_ids, tool, result, budget }) => ({ type, loan_ids, tool, result, spent: budget.spent }));
    expect(rows(attacked)).toEqual(rows(control));
    expect(ofType(attacked.events, "status_changed")).toHaveLength(1);
    expect(attacked.statuses.get(loan)).toBe(control.statuses.get(loan)!);
  });

  test("the injection sits on a ring loan, and code overrules the status it demands", async () => {
    const [doc] = key.injected_docs, loan = doc.replace(/-PS$/, "");
    expect(key.rings[0].loan_ids).toContain(loan); // so the demo shows a refusal, not an agreement
    const out = await run([[{ name: "crs_identity_check", input: { loan_id: "L0037" } }],
      [{ name: "inspect_loan", input: { loan_id: loan } }],
      [{ name: "close_lead", input: { loan_id: loan, proposed_status: "No material anomaly found" } }], "done"]).done;
    const [attack] = ofType(out.events, "attack_detected"), [closed] = ofType(out.events, "status_changed");
    expect(attack.loan_ids).toEqual([loan]);
    expect(closed.result).toMatchObject({ status: "Investigate", proposed: "No material anomaly found" });
    expect(closed.result.reason).toContain("L0037, whose identity failed");
    expect(closed.seq).toBeGreaterThan(attack.seq);
  });

  test("ask_human: code routes and scores; the question waits; the loan stays under review", async () => {
    const hospital = key.lookalikes.find((x) => x.loan_ids.length === 40)!.loan_ids[0];
    const { claude, done } = run([
      [{ name: "ask_human", input: { question: "Does a shared employer with 500+ staff explain this link?", topic: "policy", loan_ids: [hospital], employer_loan_id: hospital } }],
      [{ name: "close_lead", input: { loan_id: hospital } }],
      "done",
    ]);
    const out = await done;
    const [asked] = ofType(out.events, "question_asked");
    expect(asked.result).toMatchObject({ to: "CRO", reason: "no precedent" });
    expect(out.statuses.get(hospital)).toBe("Investigate");
    const reply = JSON.parse(claude.requests[1].body.messages.at(-1).content[0].content);
    expect(reply.asked.id).toBe("q-001");
  });

  test("a model that calls a tool with bad input gets an error back; nothing is charged or logged", async () => {
    const { claude, done } = run([[{ name: "crs_identity_check", input: { loan: "L0037" } }], "done"]);
    const out = await done;
    expect(claude.requests[1].body.messages.at(-1).content[0].is_error).toBe(true);
    expect([out.spent, ofType(out.events, "check_run").length]).toEqual([0, 0]);
  });
});
