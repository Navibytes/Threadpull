// Run Hazel once on a seed and measure it against the answer key (ticket 05: 4 of 6 ring loans within 60 acorns).
// eval/ is the only code that reads answer keys; Hazel herself never sees them.
//
//   bun run hazel                      seed 13, live CRS sandbox (CRS_USERNAME / CRS_PASSWORD)
//   bun run hazel --crs recorded       CRS answers replayed from data/crs-recordings (real responses, 2026-10-24)
//   bun run hazel --spec data/patterns/seed99.json --budget 60
//   bun run hazel --no-db              don't write events to Supabase (otherwise they go there when it's configured)
//   bun run hazel --lead L0101,L0102   the operator picks the first leads (recorded as the operator's choice)
//   bun run hazel                      questions and rulings are kept in runs/rules.json across runs and the CRO
//                                      screen (ticket 11); --rules <file> picks another file
//   bun run hazel --no-rules           start with no rules and keep nothing (a clean run, as the proof runs were)
//
// Any seed other than 13 is held out (ticket 12): the run is refused unless detection code matches the
// detector-frozen tag (bun run freeze:check), so nobody tunes on it. --allow-unfrozen overrides, and run.json says so.
//
// Needs ANTHROPIC_API_KEY (Bun loads .env.local). Writes runs/<run_id>/{run.json, events.jsonl, trace.jsonl} (gitignored).
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { FREEZE_TAG, freezeStatus } from "@/data/freeze";
import { generate, type AnswerKey } from "@/data/generate";
import { jsonlSink, modelStubExtractor, runHazel, supabaseSink, type EventSink, type TraceEntry } from "@/lib/agent";
import { serverClient } from "@/lib/db/server";
import { defaultCrsClient } from "@/lib/crs";
import { loadReference } from "@/lib/ingest/reference";
import { currentRules, FileRuleStore, MemoryRuleStore } from "@/lib/rules";

const { values: args } = parseArgs({ options: {
  spec: { type: "string", default: "data/patterns/seed13.json" },
  crs: { type: "string", default: "live" }, // live | recorded
  budget: { type: "string", default: "60" },
  "no-db": { type: "boolean", default: false },
  "allow-unfrozen": { type: "boolean", default: false },
  lead: { type: "string" }, // comma-separated loan ids
  rules: { type: "string", default: process.env.THREADPULL_RULES ?? "runs/rules.json" }, // the rule-store file
  "no-rules": { type: "boolean", default: false },
} });
const leads = args.lead ? args.lead.split(",").map((x) => x.trim()).filter(Boolean) : [];
const rulesFile = args["no-rules"] ? null : args.rules!;
const ruleStore = rulesFile ? new FileRuleStore(rulesFile) : new MemoryRuleStore();
// what the run remembered when it started, so a reader of run.json knows which rulings could apply
const rulesInForce = (await currentRules(ruleStore)).map((r) => `${r.id} v${r.version}`);
console.log(rulesFile ? `Rules: ${rulesInForce.length ? rulesInForce.join(", ") : "none yet"} (${rulesFile})` : "Rules: none (--no-rules)");

const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
const gen = generate(args.spec!, tmp(), tmp());
const freeze = freezeStatus();
const frozen = freeze.frozen && freeze.changed.length === 0;
if (gen.seed !== 13 && !frozen && !args["allow-unfrozen"]) {
  console.error(`Seed ${gen.seed} is held out: run it only on frozen detection code. ${freeze.frozen
    ? `These detection files differ from ${FREEZE_TAG}: ${freeze.changed.join(", ")}` : freeze.reason}.\nSee bun run freeze:check.`);
  process.exit(1);
}
const key: AnswerKey = JSON.parse(readFileSync(join(gen.keyDir, "answer_key.json"), "utf8"));
const runId = `r${gen.seed}-${new Date().toISOString().replace(/[-:]/g, "").slice(0, 15)}`;
const dir = join("runs", runId);
const crs = args.crs === "recorded" ? (await import("@/tests/crs-replay")).client() : defaultCrsClient();

const usage = { input: 0, output: 0, cache_read: 0, cache_write: 0 };
const traceFile = join(dir, "trace.jsonl");
const trace = (t: TraceEntry) => {
  usage.input += t.usage.input_tokens; usage.output += t.usage.output_tokens; usage.cache_read += t.usage.cache_read_input_tokens ?? 0;
  usage.cache_write += t.usage.cache_creation_input_tokens ?? 0;
  appendFileSync(traceFile, JSON.stringify(t) + "\n");
};

const started = Date.now();
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "run.json"), JSON.stringify({ run_id: runId, spec: args.spec, seed: gen.seed, crs: args.crs,
  detector: frozen && freeze.frozen ? `${FREEZE_TAG} ${freeze.commit}` : "not frozen",
  crs_note: args.crs === "recorded" ? "real sandbox responses recorded 2026-10-24, replayed" : "live sandbox",
  ...(leads.length ? { operator_leads: leads } : {}), rules: rulesFile, rules_in_force: rulesInForce, started_at: new Date().toISOString() }, null, 1) + "\n");
const sinks: EventSink[] = [jsonlSink(join(dir, "events.jsonl"))];
const db = args["no-db"] ? null : serverClient();
const dbErrors: string[] = [];
if (db) sinks.push(supabaseSink(db, (e, message) => dbErrors.push(`seq ${e.seq} (${e.type}): ${message}`)));
const anthropic = new Anthropic();
const out = await runHazel({ runId, loans: gen.normalized, seed: gen.seed, reference: loadReference(gen.outDir), anthropic, crs,
  documentReader: modelStubExtractor(anthropic), // only for a stub the parser can't read; every generated stub parses
  rules: ruleStore, leads, budget: Number(args.budget), sinks, trace });

// ---------------------------------------------------------------- measured against the answer key
const ring = key.rings.flatMap((r) => r.loan_ids);
const innocent = key.lookalikes.flatMap((x) => x.loan_ids);
const investigate = (id: string) => out.statuses.get(id) === "Investigate";
const report = {
  run_id: runId, seed: gen.seed, crs: args.crs, iterations: out.iterations, stop_reason: out.stop_reason,
  ring_found: `${ring.filter(investigate).length} of ${ring.length}`,
  innocents_left_flagged: innocent.filter(investigate).length,
  acorns: `${out.spent} of ${out.limit}`,
  questions: out.events.filter((e) => e.type === "question_asked").length,
  threads_taken_down: out.events.filter((e) => e.type === "clue_explained").length,
  events: out.events.length,
  tokens: usage,
  runtime_s: Math.round((Date.now() - started) / 100) / 10,
  target_met: ring.filter(investigate).length >= 4 && out.spent <= 60,
};
console.log(JSON.stringify(report, null, 2));
console.log(`\nHazel's recap: ${out.recap}\n\nEvents: ${join(dir, "events.jsonl")}\nTrace:  ${traceFile}`);
if (db) console.log(dbErrors.length
  ? `Supabase: ${out.events.length - dbErrors.length} of ${out.events.length} rows written; failed:\n  ${dbErrors.join("\n  ")}`
  : `Supabase: all ${out.events.length} rows written. Board: /?run=${runId}`);
else console.log("Supabase: not written (--no-db, or SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set).");
const asked = out.events.filter((e) => e.type === "question_asked");
if (asked.length) console.log(`\n${asked.length === 1 ? "A question waits" : `${asked.length} questions wait`} for an answer: /cro?run=${runId}${rulesFile ? "" : " (not kept: --no-rules; run without it to answer and keep the ruling)"}`);
