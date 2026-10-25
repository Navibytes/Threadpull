// Ticket 07: a thread falls on the board, end to end. Hazel's loop (scripted model, recorded CRS) writes the rows;
// the board's own reducer (lib/events/board-state.ts) turns them into threads. Whatever order the model calls the
// tools in, a link that comes down was drawn first, so the fall is visible, and it cites its check or rule.
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { Event } from "@/lib/contracts/event";
import type { Loan } from "@/lib/contracts/loan";
import { HAZEL_MODEL, runHazel, type HazelRun } from "@/lib/agent";
import { reduceEvents } from "@/lib/events";
import { loadReference, type Reference } from "@/lib/ingest/reference";
import { MemoryRuleStore } from "@/lib/rules";
import { generate, type AnswerKey } from "@/data/generate";
import { client as replayCrs } from "./crs-replay";

type Call = { name: string; input: Record<string, unknown> };
function scriptedClaude(turns: (Call[] | string)[]) {
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

let loans: Loan[], reference: Reference, key: AnswerKey;
beforeAll(() => {
  const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
  const r = generate(join(import.meta.dir, "..", "data", "patterns", "seed13.json"), tmp(), tmp());
  key = JSON.parse(readFileSync(join(r.keyDir, "answer_key.json"), "utf8"));
  loans = r.normalized;
  reference = loadReference(r.outDir);
});

const run = (turns: (Call[] | string)[], rules = new MemoryRuleStore()): Promise<HazelRun> =>
  runHazel({ runId: "r-fall", loans, reference, anthropic: scriptedClaude([...turns, "done"]), crs: replayCrs(), rules, sweep: false,
    now: () => new Date("2026-10-24T20:00:00Z") });
const ofType = (events: readonly Event[], type: Event["type"]) => events.filter((e) => e.type === type);
const lookalike = (check: string) => key.lookalikes.find((x) => x.proving_check.startsWith(check))!.loan_ids;

const BOARDS_WORTH = 8; // links drawn per call at most (MAX_LINKS_PER_QUERY in lib/agent/hazel.ts)

/**
 * Every clue_explained comes down on threads already drawn by earlier link_found rows, at their weight before the
 * fall: all of them, or a board's worth when more come down at once (a 40-loan employer).
 */
function expectDrawnBeforeFall(events: readonly Event[]) {
  const drawn = new Map<string, Event>();
  for (const e of events) {
    if (e.type === "link_found") drawn.set(String(e.result.edge_id), e);
    if (e.type !== "clue_explained") continue;
    const ids = e.result.edge_ids as string[];
    const before = ids.map((id) => drawn.get(id)).filter((l): l is Event => !!l && l.seq < e.seq);
    expect(before.length).toBe(Math.min(ids.length, BOARDS_WORTH));
    for (const l of before) expect(Number(l.result.weight)).toBeGreaterThan(0);
  }
}

describe("a thread falls on the board", () => {
  test("check_address straight away: the twins' thread is drawn, then falls, citing the check", async () => {
    const [a, b] = lookalike("check_address");
    const address = loans.find((l) => l.loan_id === a)!.derived.address_key;
    const out = await run([[{ name: "check_address", input: { address } }]]);
    expectDrawnBeforeFall(out.events);
    const board = reduceEvents([...out.events]);
    expect(board.cards.map((c) => c.id)).toEqual(expect.arrayContaining([a, b]));
    const [thread] = board.threads;
    expect(board.threads).toHaveLength(1);
    expect(thread).toMatchObject({ kind: "address", a, b, explained: { explainedBy: "check_address", simulated: true } });
    expect(thread.weight).toBeGreaterThan(0); // drawn at its real thickness, not the 0 it drops to
    expect(thread.explained!.sources[0]).toEqual({ kind: "event", run_id: "r-fall", seq: ofType(out.events, "check_run")[0].seq });
  });

  test("after find_connections the same thread is not drawn twice", async () => {
    const [a] = lookalike("check_address");
    const address = loans.find((l) => l.loan_id === a)!.derived.address_key;
    const out = await run([[{ name: "find_connections", input: { entity_id: a } }], [{ name: "check_address", input: { address } }]]);
    expectDrawnBeforeFall(out.events);
    const ids = ofType(out.events, "link_found").map((e) => e.result.edge_id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(reduceEvents([...out.events]).threads.filter((t) => t.explained)).toHaveLength(1);
  });

  test("a household: the pair's phone and address threads fall; nothing else", async () => {
    const [a, b] = lookalike("household check");
    const out = await run([[{ name: "check_household", input: { loan_a: a, loan_b: b } }]]);
    expectDrawnBeforeFall(out.events);
    const board = reduceEvents([...out.events]);
    expect(board.threads.map((t) => t.kind).sort()).toEqual(["address", "phone"]);
    expect(board.threads.every((t) => t.explained?.explainedBy === "check_household")).toBe(true);
  });

  test("a saved rule: the employer threads are drawn (a board's worth) and fall citing the rule", async () => {
    const rules = new MemoryRuleStore();
    await rules.addRuleVersion({ id: "R-001", version: 1, created_from: "test", when: { link_kind: "employer", min_group_size: 500 },
      then: "explain_link", reason_text: "Large employer: sharing it is expected.", ruled_at: "2026-10-24T20:00:00Z", confirmed_by: "CRO" });
    const hospital = key.lookalikes.find((x) => x.loan_ids.length === 40)!.loan_ids[0];
    const employer = loans.find((l) => l.loan_id === hospital)!.employment_info.employer_name;
    const out = await run([[{ name: "check_employer", input: { employer, loan_id: hospital } }]], rules);
    expectDrawnBeforeFall(out.events);
    const links = ofType(out.events, "link_found");
    expect(links.length).toBe(8); // capped like find_connections: 39 links come down, the board shows 8 of them fall
    const board = reduceEvents([...out.events]);
    expect(board.threads).toHaveLength(8);
    expect(board.threads.every((t) => t.explained?.ruleId === "R-001")).toBe(true);
    expect(ofType(out.events, "rule_applied")[0].seq).toBeGreaterThan(links.at(-1)!.seq);
  });

  test("a closed lead's card shows the status code decided, and a junk status changes nothing", async () => {
    const out = await run([[{ name: "crs_identity_check", input: { loan_id: "L0037" } }],
      [{ name: "close_lead", input: { loan_id: "L0037", proposed_status: "No material anomaly found" } }]]);
    const board = reduceEvents([...out.events]);
    expect(board.cards.find((c) => c.id === "L0037")!.status).toBe("Investigate");
    const [closed] = ofType(out.events, "status_changed");
    const junk = { ...closed, seq: out.events.length + 1, result: { status: "Approved by the AI" } };
    expect(reduceEvents([...out.events, junk]).cards.find((c) => c.id === "L0037")!.status).toBe("Investigate");
  });

  test("a check of another employer never clears this loan's link, whatever loan_id comes with it", async () => {
    const rules = new MemoryRuleStore();
    await rules.addRuleVersion({ id: "R-001", version: 1, created_from: "test", when: { link_kind: "employer", min_group_size: 500 },
      then: "explain_link", reason_text: "Large employer: sharing it is expected.", ruled_at: "2026-10-24T20:00:00Z", confirmed_by: "CRO" });
    const hospital = key.lookalikes.find((x) => x.loan_ids.length === 40)!.loan_ids[0];
    const employer = loans.find((l) => l.loan_id === hospital)!.employment_info.employer_name;
    const lead = key.rings[0].loan_ids[0]; // the ring's small employer: the hospital's 500+ staff say nothing about it
    const out = await run([[{ name: "check_employer", input: { employer, loan_id: lead } }]], rules);
    expect(ofType(out.events, "rule_applied")).toHaveLength(0);
    expect(ofType(out.events, "clue_explained")).toHaveLength(0);
  });

  test("a dealer burst explains no link: nothing is drawn for it", async () => {
    const dealer = key.dealer_bursts[0].dealer_id;
    const out = await run([[{ name: "dealer_timeline", input: { dealer_id: dealer } }]]);
    expect(ofType(out.events, "clue_explained").length).toBeGreaterThan(0);
    expect(ofType(out.events, "link_found")).toHaveLength(0);
    expect(reduceEvents([...out.events]).threads).toHaveLength(0);
  });
});
