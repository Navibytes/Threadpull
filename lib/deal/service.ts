// Server side of the CRO screen (ticket 10): find a run's files, load its loans, build the report, record a decision.
// Server-only (reads and appends files under runs/<run_id>/); the route handlers in app/api stay thin and call these.
// A run is what eval/hazel-run.ts writes: runs/<run_id>/run.json and events.jsonl. Supabase `events` replaces the file later.
import { appendFileSync, existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { EventSchema, type Event } from "@/lib/contracts/event";
import { LoanSchema, type Loan } from "@/lib/contracts/loan";
import { buybackDemands, documentRequests, type BuybackDemand, type DocumentRequest } from "./drafts";
import { DispositionInputSchema, dispositionRow } from "./dispositions";
import { defaultDispositionsDb, mirrorDisposition, type DispositionsTable, type Mirror } from "./dispositions-db";
import { type Assumptions, DEFAULT_ASSUMPTIONS, withInputs } from "./pricing";
import { buildReport, type DealReport } from "./report";

export type RunMeta = { run_id: string; spec: string; seed: number; crs?: string; crs_note?: string; model_note?: string; started_at?: string };
export type RunSummary = { run_id: string; started_at: string | null; crs: string | null; note: string | null; events: number };

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}$/; // also keeps a run id from walking out of runs/
const SPEC = /^data\/patterns\/[A-Za-z0-9._-]+\.json$/;
const runsRoot = () => join(process.cwd(), "runs");

export type RunFiles = { meta: RunMeta; events: Event[]; skipped: number };

/** One run's meta and event rows, in order. A malformed row is skipped and counted, never repaired. */
export function readRun(runId: string, root = runsRoot()): RunFiles | null {
  if (!RUN_ID.test(runId)) return null;
  const dir = join(/*turbopackIgnore: true*/ root, runId);
  const file = join(dir, "events.jsonl");
  if (!existsSync(/*turbopackIgnore: true*/ file)) return null;
  let meta: RunMeta = { run_id: runId, spec: "data/patterns/seed13.json", seed: 13 };
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

const loansCache = new Map<string, Promise<Loan[]>>();
/** The run's loans: the generated file when `bun run data` has made it, otherwise the same seeded generator Hazel ran on. */
export function loansFor(meta: RunMeta): Promise<Loan[]> {
  if (!SPEC.test(meta.spec)) return Promise.reject(new Error(`run ${meta.run_id} names a spec outside data/patterns/`));
  const key = `${meta.spec}:${meta.seed}`;
  let loans = loansCache.get(key);
  if (!loans) {
    loans = (async () => {
      const file = join(process.cwd(), "data", "out", `seed${meta.seed}`, "loans.normalized.json");
      if (existsSync(/*turbopackIgnore: true*/ file)) return (JSON.parse(readFileSync(/*turbopackIgnore: true*/ file, "utf8")) as unknown[]).map((l) => LoanSchema.parse(l));
      const [{ mkdtempSync }, { tmpdir }, { generate }] = await Promise.all([import("node:fs"), import("node:os"), import("@/data/generate")]);
      const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
      return generate(join(/*turbopackIgnore: true*/ process.cwd(), meta.spec), tmp(), tmp()).normalized;
    })();
    loansCache.set(key, loans);
    loans.catch(() => loansCache.delete(key));
  }
  return loans;
}

export type ReportBundle = {
  report: DealReport;
  buyback_demands: BuybackDemand[];
  document_requests: DocumentRequest[];
  run: RunMeta;
};

/** `db`: the Supabase copy of decisions. Omit it for the hosted client (never under bun test), pass null to switch the copy off. */
type Deps = { root?: string; loans?: Loan[]; db?: DispositionsTable | null };

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
