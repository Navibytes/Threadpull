// Server side of the CRO screen (ticket 10): find a run's files, load its loans, build the report, record a decision.
// Server-only (reads and appends files under runs/<run_id>/); the route handlers in app/api stay thin and call these.
// A run is what eval/hazel-run.ts writes: runs/<run_id>/run.json and events.jsonl. Supabase `events` replaces the file later.
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { EventSchema, type Event } from "@/lib/contracts/event";
import { LoanSchema, type Loan } from "@/lib/contracts/loan";
import { TAPE_ID } from "@/lib/ingest/intake";
import { loadTape } from "@/lib/ingest/tapes";
import { buybackDemands, documentRequests, type BuybackDemand, type DocumentRequest } from "./drafts";
import { DispositionInputSchema, dispositionRow } from "./dispositions";
import { defaultDispositionsDb, mirrorDisposition, type DispositionsTable, type Mirror } from "./dispositions-db";
import { writeMemo, type Memo } from "./memo";
import { type Assumptions, DEFAULT_ASSUMPTIONS, withInputs } from "./pricing";
import { buildReport, type DealReport } from "./report";
import { whyLoan, type Why } from "./why";

/** `spec` is whatever the run's writer recorded; this module never opens it (only data/ and eval/ read pattern specs). */
export type RunMeta = { run_id: string; spec?: string; seed: number; tape_id?: string; crs?: string; crs_note?: string; model_note?: string; started_at?: string };
export type RunSummary = { run_id: string; started_at: string | null; crs: string | null; note: string | null; events: number };

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/; // also keeps a run id from walking out of runs/
const runsRoot = () => join(process.cwd(), "runs");

export type RunFiles = { meta: RunMeta; events: Event[]; skipped: number };

/** One run's meta and event rows, in order. A malformed row is skipped and counted, never repaired. */
export function readRun(runId: string, root = runsRoot()): RunFiles | null {
  if (!RUN_ID.test(runId)) return null;
  const dir = join(/*turbopackIgnore: true*/ root, runId);
  const file = join(dir, "events.jsonl");
  if (!existsSync(/*turbopackIgnore: true*/ file)) return null;
  let meta: RunMeta = { run_id: runId, seed: 13 };
  try { meta = { ...meta, ...JSON.parse(readFileSync(/*turbopackIgnore: true*/ join(dir, "run.json"), "utf8")) }; } catch { /* a run without run.json is read as seed 13 */ }
  const events: Event[] = [];
  let skipped = 0;
  for (const line of readFileSync(/*turbopackIgnore: true*/ file, "utf8").split("\n").filter((l) => l.trim())) {
    try {
      const parsed = EventSchema.safeParse(JSON.parse(line));
      if (parsed.success) events.push(parsed.data); else skipped++;
    } catch { skipped++; }
  }
  return { meta, events: events.sort((a, b) => a.seq - b.seq), skipped };
}

export function listRuns(root = runsRoot()): RunSummary[] {
  if (!existsSync(/*turbopackIgnore: true*/ root)) return [];
  return readdirSync(/*turbopackIgnore: true*/ root)
    .filter((id) => RUN_ID.test(id) && existsSync(/*turbopackIgnore: true*/ join(root, id, "events.jsonl")))
    .map((id) => ({ id, at: statSync(/*turbopackIgnore: true*/ join(root, id, "events.jsonl")).mtimeMs }))
    .sort((a, b) => b.at - a.at)
    .flatMap(({ id }) => {
      const run = readRun(id, root);
      return run ? [{ run_id: id, started_at: run.meta.started_at ?? null, crs: run.meta.crs ?? null, note: run.meta.model_note ?? null, events: run.events.length }] : [];
    });
}

const loansCache = new Map<number, Loan[]>();
/** The run's loans, from the tape `bun run data --no-db` writes (eval/sample-run.ts writes it when it is missing). */
export async function loansFor(meta: RunMeta): Promise<Loan[]> {
  if (meta.tape_id !== undefined) { // a run of an uploaded tape (lib/runs/tape-run.ts) reads that tape's accepted loans
    if (!TAPE_ID.test(meta.tape_id)) throw new Error(`run ${meta.run_id} names no valid tape`);
    return loadTape(join(process.cwd(), "data", "out", "uploads"), meta.tape_id).loans;
  }
  if (!Number.isInteger(meta.seed)) throw new Error(`run ${meta.run_id} has no whole-number seed`); // the seed becomes part of a path
  const cached = loansCache.get(meta.seed);
  if (cached) return cached;
  const file = join(process.cwd(), "data", "out", `seed${meta.seed}`, "loans.normalized.json");
  if (!existsSync(/*turbopackIgnore: true*/ file)) throw new Error(`the loans for seed ${meta.seed} are not generated yet: run bun run data --no-db`);
  const loans = (JSON.parse(readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as unknown[]).map((l) => LoanSchema.parse(l));
  loansCache.set(meta.seed, loans);
  return loans;
}

export type ReportBundle = {
  report: DealReport;
  buyback_demands: BuybackDemand[];
  document_requests: DocumentRequest[];
  run: RunMeta;
};

/**
 * `db`: the Supabase copy of decisions. Omit it for the hosted client (never under bun test), pass null to switch the copy off.
 * `anthropic`: the memo writer's client. Omit it for the real one (needs ANTHROPIC_API_KEY, never under bun test), null for none.
 */
type Deps = { root?: string; loans?: Loan[]; db?: DispositionsTable | null; anthropic?: Anthropic | null };

/** The report for a run, with the drafts, under the analyst's assumptions (defaults are the brief's). Null when there is no such run. */
export async function loadReport(
  runId: string,
  input: { lgd?: number; margin?: number; scores?: ReadonlyMap<string, number> } = {},
  deps: Deps = {},
): Promise<ReportBundle | null> {
  const run = readRun(runId, deps.root);
  if (!run) return null;
  const assumptions: Assumptions = withInputs(DEFAULT_ASSUMPTIONS, input);
  const notes = [run.meta.model_note, run.meta.crs ? `CRS answers: ${run.meta.crs}${run.meta.crs_note ? ` (${run.meta.crs_note})` : ""}` : null,
    run.skipped ? `${run.skipped} malformed event row${run.skipped === 1 ? "" : "s"} skipped` : null].filter(Boolean);
  const sentence = (n: unknown) => String(n).replace(/\s+$/, "").replace(/(?<![.!?])$/, ".");
  const report = buildReport({ run_id: runId, loans: deps.loans ?? (await loansFor(run.meta)), events: run.events, scores: input.scores,
    assumptions, note: notes.map(sentence).join(" ") || null });
  return { report, buyback_demands: buybackDemands(report), document_requests: documentRequests(report), run: run.meta };
}

/**
 * Rows a person adds (a decision, an answer) are appended after the run's last row. While the run is still writing,
 * its next row would take the same seq (the Supabase key is run_id + seq), so they wait for run_finished.
 */
export const stillRunning = (events: readonly Event[]) => !events.some((e) => e.type === "run_finished");
export const STILL_RUNNING = "the run is still going; record this once it has finished (its last row is run_finished)";

export type RecordResult = { ok: true; event: Event; mirror: Mirror } | { ok: false; status: number; error: string };

/**
 * Validate a decision, turn it into a disposition_recorded row, stamp it and append it to the run's event log (the record
 * of truth). The row is then copied to the Supabase `dispositions` table; `mirror` says whether that worked, and a failed
 * copy never undoes the decision.
 */
export async function recordDisposition(raw: unknown, deps: Deps = {}): Promise<RecordResult> {
  const parsed = DispositionInputSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, status: 400, error: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") };
  const input = parsed.data;
  const run = readRun(input.run_id, deps.root);
  if (!run) return { ok: false, status: 404, error: `no run ${input.run_id}` };
  if (stillRunning(run.events)) return { ok: false, status: 409, error: STILL_RUNNING };
  const report = buildReport({ run_id: input.run_id, loans: deps.loans ?? (await loansFor(run.meta)), events: run.events });
  const last = run.events.at(-1);
  const built = dispositionRow(input, (id) => {
    const l = report.loans.find((x) => x.loan_id === id);
    return l && { proposed: l.proposed_verdict, status_seq: l.event_seqs[0] };
  }, last?.budget ?? { spent: 0, limit: 0 });
  if (!built.ok) return { ok: false, status: 422, error: built.error };
  const event = EventSchema.parse({ run_id: input.run_id, seq: (last?.seq ?? 0) + 1, ts: new Date().toISOString(), ...built.row });
  appendFileSync(/*turbopackIgnore: true*/ join(deps.root ?? runsRoot(), input.run_id, "events.jsonl"), `${JSON.stringify(event)}\n`);
  return { ok: true, event, mirror: await mirrorDisposition(event, deps.db === undefined ? defaultDispositionsDb() : deps.db) };
}

// ---- ticket 14: the CRO memo and the "why" answer
export type StoredMemo = { memo: Memo; stale: boolean };
export type MemoResult = ({ ok: true } & StoredMemo) | { ok: false; status: number; error: string };
const memoFile = (runId: string, root: string) => join(/*turbopackIgnore: true*/ root, runId, "memo.json");

/** The memo last written for a run; `stale` once the run's log has rows the memo was not written from (a decision, say). */
export function readMemo(runId: string, root = runsRoot()): StoredMemo | null {
  const run = readRun(runId, root);
  if (!run) return null;
  try {
    const memo = JSON.parse(readFileSync(/*turbopackIgnore: true*/ memoFile(runId, root), "utf8")) as Memo;
    return { memo, stale: memo.based_on_seq !== (run.events.at(-1)?.seq ?? 0) };
  } catch { return null; } // no memo yet
}

const defaultAnthropic = () => (process.env.NODE_ENV === "test" || !process.env.ANTHROPIC_API_KEY ? null : new Anthropic());

/** Have Claude write the memo for a run, under the analyst's assumptions, and save it beside the run's events. */
export async function makeMemo(runId: string, input: { lgd?: number; margin?: number } = {}, deps: Deps = {}): Promise<MemoResult> {
  const run = readRun(runId, deps.root);
  if (!run) return { ok: false, status: 404, error: `no run ${runId}` };
  if (!run.events.length) return { ok: false, status: 422, error: `run ${runId} has no events to write about` };
  const anthropic = deps.anthropic === undefined ? defaultAnthropic() : deps.anthropic;
  if (!anthropic) return { ok: false, status: 503, error: "the memo needs ANTHROPIC_API_KEY in .env.local, and none is set" };
  try {
    const bundle = await loadReport(runId, input, deps);
    if (!bundle) return { ok: false, status: 404, error: `no run ${runId}` };
    const memo = await writeMemo(anthropic, bundle.report, run.events);
    writeFileSync(/*turbopackIgnore: true*/ memoFile(runId, deps.root ?? runsRoot()), `${JSON.stringify(memo, null, 2)}\n`);
    return { ok: true, memo, stale: false };
  } catch (e) {
    return { ok: false, status: 502, error: e instanceof Error ? e.message : "the memo could not be written" };
  }
}

/** Why a loan has the verdict it has, from the run's own events; refuses when the run has none for it. */
export async function whyFor(runId: string, loanId: string, deps: Deps = {}): Promise<{ ok: true; why: Why } | { ok: false; status: number; error: string }> {
  if (!/^L\d{4}$/.test(loanId)) return { ok: false, status: 400, error: "a loan id looks like L0037" };
  const run = readRun(runId, deps.root);
  if (!run) return { ok: false, status: 404, error: `no run ${runId}` };
  const report = buildReport({ run_id: runId, loans: deps.loans ?? (await loansFor(run.meta)), events: run.events });
  return whyLoan(report, run.events, loanId);
}
