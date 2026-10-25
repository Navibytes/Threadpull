// Check a pattern spec end to end before anyone runs on it (ticket 12):
//
//   bun run data:check --spec data/patterns/heldout/seed99.json [--keys ~/threadpull-heldout-keys]
//
// Validates the spec, generates the portfolio into a temporary folder, then checks the result: the answer key
// resolves, every planted ring link is visible to the evidence graph, every case loan's CRS body passes the persona
// guard, and Hazel's loop runs on it (a scripted model, recorded CRS: no API key, no network). Prints only pass/fail
// lines, never loan ids or truths, so the output can be pasted in the team chat without revealing a held-out set.
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { EventSchema, type Event } from "@/lib/contracts/event";
import type { Loan } from "@/lib/contracts/loan";
import { HAZEL_MODEL, runHazel } from "@/lib/agent";
import { bodyForLoan } from "@/lib/crs/persona-guard";
import { buildGraph } from "@/lib/graph";
import { loadReference } from "@/lib/ingest/reference";
import { MemoryRuleStore } from "@/lib/rules";
import { client as recordedCrs } from "@/tests/crs-replay";
import { generate, type AnswerKey } from "./generate";
import { parseSpec } from "./spec";

export type Check = { ok: boolean; line: string };

const GRAPH_KIND = { phone: "phone", bank_account: "bank_account", device_id: "device", ip_address: "ip_address" } as const;

/** A fake Messages API: opens the top lead's connections, closes it, stops. Enough to run the loop end to end. */
function smokeModel(lead: string) {
  const turns = [
    [{ name: "find_connections", input: { entity_id: lead } }],
    [{ name: "inspect_loan", input: { loan_id: lead } }],
    [{ name: "close_lead", input: { loan_id: lead } }],
  ];
  let n = 0;
  const fetch = (async () => {
    const turn = turns[n++];
    const content = turn ? turn.map((c, i) => ({ type: "tool_use", id: `toolu_${n}_${i}`, name: c.name, input: c.input })) : [{ type: "text", text: "done" }];
    return new Response(JSON.stringify({ id: `msg_${n}`, type: "message", role: "assistant", model: HAZEL_MODEL, content,
      stop_reason: turn ? "tool_use" : "end_turn", stop_sequence: null, usage: { input_tokens: 1, output_tokens: 1 } }),
    { status: 200, headers: { "content-type": "application/json" } });
  }) as unknown as typeof globalThis.fetch;
  return new Anthropic({ apiKey: "check-only", fetch, maxRetries: 0 });
}

export async function checkSpec(specPath: string, keysRoot = mkdtempSync(join(tmpdir(), "tp-keys-"))): Promise<Check[]> {
  const out: Check[] = [];
  const pass = (ok: boolean, line: string) => { out.push({ ok, line }); return ok; };

  let spec;
  try {
    spec = parseSpec(JSON.parse(readFileSync(specPath, "utf8")), specPath);
  } catch (e) {
    pass(false, e instanceof Error ? e.message : String(e));
    return out;
  }
  pass(true, "spec is valid (schema, references, personas planted once, dates and counts)");

  const gen = generate(specPath, mkdtempSync(join(tmpdir(), "tp-out-")), keysRoot);
  const key: AnswerKey = JSON.parse(readFileSync(join(gen.keyDir, "answer_key.json"), "utf8"));
  const loans: Loan[] = gen.normalized;
  const byId = new Map(loans.map((l) => [l.loan_id, l]));
  pass(loans.length === spec.n_loans, `the portfolio has n_loans loans and every one passes the loan schema`);

  // the answer key: every id resolves, and no loan is in two truth groups
  const groups = [...key.rings, ...key.lookalikes, ...key.review_cases, ...key.risky_real, ...key.dealer_bursts].map((g) => g.loan_ids);
  const all = groups.flat();
  pass(all.every((id) => byId.has(id)) && groups.every((g) => g.length > 0),
    "every answer-key group resolves to loans of the portfolio");
  pass(new Set(all).size === all.length, "no loan sits in two answer-key groups");

  // every link a ring's spec plants is in the evidence graph (same entity on both loans)
  const graph = buildGraph(loans);
  const rings = spec.patterns.filter((p) => p.type === "ring");
  let links = 0, missing = 0;
  rings.forEach((ring, i) => {
    const names = [...ring.personas, ...Array.from({ length: ring.background_members }, (_, k) => `bg${k + 1}`)];
    const idOf = new Map(names.map((m, k) => [m, key.rings[i].loan_ids[k]]));
    for (const s of ring.shared) {
      const [first, ...rest] = s.members.map((m) => idOf.get(m)!);
      const entity = graph.entitiesOf(first).find((e) => graph.kind(e) === GRAPH_KIND[s.kind]);
      for (const other of rest) {
        links++;
        if (!entity || !graph.loansOf(entity).includes(other)) missing++;
      }
    }
  });
  pass(missing === 0, missing ? `${missing} planted ring link(s) are not in the evidence graph` : "every planted ring link is in the evidence graph");

  // CRS: every case loan's request body is a sandbox persona body (nothing would reach the real vendor)
  const cases = Object.keys(key.case_loans);
  const refused = cases.filter((id) => { try { bodyForLoan("tu_identity", byId.get(id)!); return false; } catch { return true; } });
  pass(refused.length === 0, refused.length ? `${refused.length} case loan(s) would be refused by the persona guard` : "every case loan's CRS body passes the persona guard");

  // Hazel's loop on this portfolio, end to end, with a scripted model and recorded CRS answers
  const lead = graph.rankLeads()[0].loan_id;
  try {
    const run = await runHazel({ runId: `check-${spec.seed}`, loans, seed: spec.seed, reference: loadReference(gen.outDir),
      anthropic: smokeModel(lead), crs: recordedCrs(), rules: new MemoryRuleStore(), now: () => new Date("2026-10-25T00:00:00Z") });
    const valid = run.events.every((e: Event) => EventSchema.safeParse(e).success);
    pass(valid && run.events.at(-1)?.type === "run_finished" && run.statuses.size === 1,
      "Hazel's loop runs on it end to end (scripted model, recorded CRS): every event row is valid");
  } catch (e) {
    pass(false, `Hazel's loop failed on this portfolio: ${e instanceof Error ? e.message : String(e)}`);
  }
  return out;
}

if (import.meta.main) {
  const { values } = parseArgs({ options: { spec: { type: "string" }, keys: { type: "string" } } });
  if (!values.spec) {
    console.error("usage: bun run data:check --spec <pattern spec> [--keys <folder for the answer key>]");
    process.exit(2);
  }
  const checks = await checkSpec(values.spec, values.keys);
  for (const c of checks) console.log(`${c.ok ? "✓" : "✗"} ${c.line}`);
  const failed = checks.filter((c) => !c.ok).length;
  console.log(failed ? `\n${failed} check(s) failed.` : "\nAll checks passed. Nothing above names a loan or a truth, so this output is safe to share.");
  process.exit(failed ? 1 : 0);
}
