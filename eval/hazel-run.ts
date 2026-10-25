// Run Hazel once on a seed and measure it against the answer key (ticket 05: 4 of 6 ring loans within 60 acorns).
// eval/ is the only code that reads answer keys; Hazel herself never sees them.
//
//   bun run hazel                      seed 13, live CRS sandbox (CRS_USERNAME / CRS_PASSWORD)
//   bun run hazel --crs recorded       CRS answers replayed from data/crs-recordings (real responses, 2026-10-24)
//   bun run hazel --spec data/patterns/seed99.json --budget 60
//
// Needs ANTHROPIC_API_KEY (Bun loads .env.local). Writes runs/<run_id>/{run.json, events.jsonl, trace.jsonl} (gitignored).
import { appendFileSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import Anthropic from "@anthropic-ai/sdk";
import { generate, type AnswerKey } from "@/data/generate";
import { jsonlSink, runHazel, type TraceEntry } from "@/lib/agent";
import { defaultCrsClient } from "@/lib/crs";
import { loadReference } from "@/lib/ingest/reference";
import { MemoryRuleStore } from "@/lib/rules";

const { values: args } = parseArgs({ options: {
  spec: { type: "string", default: "data/patterns/seed13.json" },
  crs: { type: "string", default: "live" }, // live | recorded
  budget: { type: "string", default: "60" },
} });

const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
const gen = generate(args.spec!, tmp(), tmp());
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
  crs_note: args.crs === "recorded" ? "real sandbox responses recorded 2026-10-24, replayed" : "live sandbox", started_at: new Date().toISOString() }, null, 1) + "\n");
const sink = jsonlSink(join(dir, "events.jsonl"));
const out = await runHazel({ runId, loans: gen.normalized, seed: gen.seed, reference: loadReference(gen.outDir), anthropic: new Anthropic(), crs,
  rules: new MemoryRuleStore(), budget: Number(args.budget), sinks: [sink], trace });

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
