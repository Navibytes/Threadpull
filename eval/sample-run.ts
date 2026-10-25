// Write a sample run to runs/r13-sample/ so the CRO screen (/cro) works without an Anthropic key.
//   bun run eval/sample-run.ts
// It is the real Hazel loop on seed 13 with the real CRS answers recorded on 2026-10-24, but Claude is a scripted stand-in.
// run.json says so, and the CRO screen shows that note. Use `bun run hazel` for a run with the real model.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dealRun } from "@/tests/deal-run";

const run = await dealRun();
const dir = join("runs", run.run_id);
mkdirSync(dir, { recursive: true });
writeFileSync(join(dir, "run.json"), JSON.stringify({
  run_id: run.run_id, spec: "data/patterns/seed13.json", seed: 13, crs: "recorded",
  crs_note: "real sandbox responses recorded 2026-10-24, replayed",
  model_note: "Scripted sample run: Claude is a scripted stand-in, so what Hazel chose to check is not a model's judgement.",
  started_at: run.events[0].ts,
}, null, 1) + "\n");
writeFileSync(join(dir, "events.jsonl"), run.events.map((e) => JSON.stringify(e)).join("\n") + "\n");
console.log(`wrote ${run.events.length} events to ${dir}. Open /cro?run=${run.run_id}`);
