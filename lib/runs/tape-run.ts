// Investigate an uploaded tape from the app (the bank's path: upload → investigation → CRO decision). Server-only.
// Starts Hazel on the tape's accepted loans exactly as `bun run hazel` does (live CRS, the Haiku stub reader, the shared
// rule store), writes runs/<run_id>/{run.json, events.jsonl} for the CRO screen and the Supabase events table for the
// live board, and returns as soon as the run has started. One run at a time per server: each one spends model tokens.
// Detection code is untouched: the run's first row also names the tape it read (run_started.result.tape_id), the way a
// generated portfolio's run names its seed, so the board can pull the loan files.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import type { SupabaseClient } from "@supabase/supabase-js";
import { jsonlSink, modelStubExtractor, runHazel, supabaseSink, type EventSink, type HazelOptions, type HazelRun } from "@/lib/agent";
import { defaultCrsClient } from "@/lib/crs";
import { serverClient } from "@/lib/db/server";
import { TAPE_ID } from "@/lib/ingest/intake";
import type { Loan } from "@/lib/contracts/loan";
import { uploadRoots, writableRules, writableRuns } from "@/lib/demo";
import type { Reference } from "@/lib/ingest/reference";
import { loadTape } from "@/lib/ingest/tapes";
import { FileRuleStore } from "@/lib/rules";

/** Longest wait for one model request before it is dropped and retried (the SDK's own default is 10 minutes). */
export const MODEL_TIMEOUT_MS = 120_000;

// locally the repo's folders; on a serverless host its /tmp (lib/demo.ts)
const runsRoot = writableRuns;
const rulesFile = writableRules;

export type TapeRunState = { run_id: string; tape_id: string; state: "running" | "finished" | "failed"; error?: string; started_at: string };
// Kept on globalThis: Next.js can load this module more than once in one server (one copy per route bundle, again after
// a reload), and a module variable per copy let the status route miss a run and a second run start beside the first.
type Registry = { runs: Map<string, TapeRunState>; current: Promise<unknown> | null };
const registry: Registry = ((globalThis as { __threadpullTapeRuns?: Registry }).__threadpullTapeRuns ??= { runs: new Map(), current: null });
const runs = registry.runs;

/** What a run needs that isn't in the repo; names only, never values. */
export function missingConfig(env: Record<string, string | undefined> = process.env): string[] {
  return ["ANTHROPIC_API_KEY", "CRS_USERNAME", "CRS_PASSWORD"].filter((k) => !env[k]);
}

/** Tags the run's run_started row with the tape it read, on its way to every sink. */
export function tapeTagged(sink: EventSink, tapeId: string): EventSink {
  return (e) => sink(e.type === "run_started" ? { ...e, result: { ...e.result, tape_id: tapeId } } : e);
}

// `done` settles when the run ends, so a serverless route can keep its function alive until then (next/server after()).
export type StartResult = { ok: true; run: TapeRunState; done: Promise<unknown> } | { ok: false; status: number; error: string };
type Deps = {
  run?: (opts: HazelOptions) => Promise<HazelRun>; env?: Record<string, string | undefined>; now?: () => Date;
  uploads?: string; runsDir?: string; anthropic?: Anthropic; db?: SupabaseClient | null; rules?: string;
  tape?: { loans: Loan[]; reference: Reference }; // the tape itself, when the request carried it (no shared disk)
};

/** The saved tape, from the first upload folder that has it, or null. */
function findTape(tapeId: string, roots: string[]) {
  for (const root of roots) { try { return loadTape(root, tapeId); } catch { /* not in this folder */ } }
  return null;
}

export function startTapeRun(tapeId: string, deps: Deps = {}): StartResult {
  if (!TAPE_ID.test(tapeId)) return { ok: false, status: 400, error: "not a tape id" };
  const missing = missingConfig(deps.env);
  if (missing.length) return { ok: false, status: 503, error: `a live run needs ${missing.join(", ")} in .env.local` };
  if (registry.current) return { ok: false, status: 409, error: "a run is already in progress; wait for it to finish" };
  const tape = deps.tape ?? findTape(tapeId, deps.uploads ? [deps.uploads] : uploadRoots());
  if (!tape) return { ok: false, status: 404, error: `no uploaded tape ${tapeId}; upload it again` };

  const now = deps.now?.() ?? new Date();
  const run_id = `rt-${tapeId.slice(2, 8)}-${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}`;
  const dir = join(deps.runsDir ?? runsRoot(), run_id);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "run.json"), JSON.stringify({ run_id, tape_id: tapeId, loans: tape.loans.length, crs: "live", crs_note: "live sandbox",
    rules: deps.rules ?? rulesFile(), started_at: now.toISOString() }, null, 1) + "\n");

  const sinks: EventSink[] = [jsonlSink(join(dir, "events.jsonl"))];
  // never the hosted project under bun test: tests load real keys, so they pass a fake or nothing
  const db = deps.db !== undefined ? deps.db : process.env.NODE_ENV === "test" ? null : serverClient();
  if (db) sinks.push(supabaseSink(db, (e, message) => console.error(`run ${run_id}: Supabase row ${e.seq} (${e.type}) failed: ${message}`)));
  // a request that hangs (the venue Wi-Fi switching mid-call) is dropped after 2 min and retried, not waited on for 10
  const anthropic = deps.anthropic ?? new Anthropic({ timeout: MODEL_TIMEOUT_MS, maxRetries: 2 });
  const state: TapeRunState = { run_id, tape_id: tapeId, state: "running", started_at: now.toISOString() };
  runs.set(run_id, state);
  registry.current = (deps.run ?? runHazel)({ runId: run_id, loans: tape.loans, reference: tape.reference, anthropic, crs: defaultCrsClient(),
    rules: new FileRuleStore(deps.rules ?? rulesFile()), documentReader: modelStubExtractor(anthropic), sinks: sinks.map((s) => tapeTagged(s, tapeId)) })
    .then(() => { state.state = "finished"; })
    .catch((e: unknown) => { state.state = "failed"; state.error = e instanceof Error ? e.message : String(e); })
    .finally(() => { registry.current = null; });
  return { ok: true, run: state, done: registry.current };
}

export const tapeRun = (runId: string): TapeRunState | null => runs.get(runId) ?? null;
