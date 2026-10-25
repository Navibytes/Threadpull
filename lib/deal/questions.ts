// Ask once, remember forever, on the CRO screen (ticket 11): the questions a run asked, and a person's answer. Server-only.
// Questions and rules live in one rule store shared by every run on this machine (runs/rules.json; THREADPULL_RULES to
// move it), so a ruling made after one run is applied by the next (eval/hazel-run.ts --rules). An answer is recorded
// like a decision: lib/rules answerQuestion saves it (a "yes" becomes a rule version), then a question_answered row is
// appended to the run's event log (the record of truth) and copied to the Supabase events table for the board.
import { appendFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";
import { EventSchema, type Event } from "@/lib/contracts/event";
import type { Question, Rule } from "@/lib/contracts/rule";
import { serverClient } from "@/lib/db/server";
import { answerQuestion, currentRules, FileRuleStore, type RuleStore } from "@/lib/rules";
import type { Mirror } from "./dispositions-db";
import { readRun } from "./service";

export const rulesPath = () => process.env.THREADPULL_RULES ?? join(process.cwd(), "runs", "rules.json");

/** The slice of a Supabase client the event copy needs, so tests can pass a fake. */
export type EventsInsert = { from(table: "events"): { insert(row: Event): PromiseLike<{ error: { message: string } | null }> } };
const defaultEventsDb = (): EventsInsert | null => (process.env.NODE_ENV === "test" ? null : (serverClient() as unknown as EventsInsert | null));

type Deps = { root?: string; store?: RuleStore; db?: EventsInsert | null; now?: () => Date };
const storeOf = (deps: Deps) => deps.store ?? new FileRuleStore(rulesPath());

export type RunQuestions = { questions: Question[]; rules: Rule[] };

/** The questions this run asked (open and answered) and the rules in force now. Null when there is no such run. */
export async function questionsFor(runId: string, deps: Deps = {}): Promise<RunQuestions | null> {
  if (!readRun(runId, deps.root)) return null;
  const store = storeOf(deps);
  const questions = (await store.questions()).filter((q) => q.run_id === runId).sort((a, b) => a.id.localeCompare(b.id));
  return { questions, rules: await currentRules(store) };
}

export const AnswerRequestSchema = z.strictObject({
  run_id: z.string().min(1),
  question_id: z.string().regex(/^q-\d{3,}$/),
  decision: z.enum(["yes", "no"]),
  text: z.string().trim().min(10, "say why in at least 10 characters"),
  answered_by: z.string().trim().min(1).max(80),
  // the one scope edit a person can make here: the staff count the rule starts at (yes only)
  min_group_size: z.number().int().positive().optional(),
});

export type AnswerResult =
  | { ok: true; event: Event; rule: Rule | null; mirror: Mirror }
  | { ok: false; status: number; error: string };

export async function recordAnswer(raw: unknown, deps: Deps = {}): Promise<AnswerResult> {
  const parsed = AnswerRequestSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, status: 400, error: parsed.error.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ") };
  const input = parsed.data;
  const run = readRun(input.run_id, deps.root);
  if (!run) return { ok: false, status: 404, error: `no run ${input.run_id}` };
  const store = storeOf(deps);
  const q = (await store.questions()).find((x) => x.id === input.question_id);
  if (!q || q.run_id !== input.run_id) return { ok: false, status: 404, error: `run ${input.run_id} asked no question ${input.question_id}` };
  if (q.status !== "pending") return { ok: false, status: 409, error: `${q.id} is already answered` };
  if (input.decision === "no" && input.min_group_size !== undefined) return { ok: false, status: 400, error: "a scope only goes with a yes" };
  const when = input.decision === "yes" && input.min_group_size !== undefined && q.proposed_rule
    ? { ...q.proposed_rule, min_group_size: input.min_group_size } : undefined;

  let out;
  try {
    out = await answerQuestion(store, { question_id: q.id, decision: input.decision, text: input.text, answered_by: input.answered_by, when },
      deps.now?.() ?? new Date());
  } catch (e) {
    return { ok: false, status: 422, error: e instanceof Error ? e.message : String(e) };
  }

  const last = run.events.at(-1);
  const note = out.rule
    ? `${input.answered_by} answered yes; saved as ${out.rule.id} v${out.rule.version}: ${out.rule.reason_text}`
    : `${input.answered_by} answered no; no rule saved: ${input.text}`;
  const event = EventSchema.parse({ run_id: input.run_id, seq: (last?.seq ?? 0) + 1, ts: (deps.now?.() ?? new Date()).toISOString(),
    type: "question_answered", loan_ids: out.event.loan_ids, tool: "ask_human", result: out.event.result, sources: out.event.sources,
    note, budget: last?.budget ?? { spent: 0, limit: 0 }, simulated: false });
  appendFileSync(/*turbopackIgnore: true*/ join(deps.root ?? join(process.cwd(), "runs"), input.run_id, "events.jsonl"), `${JSON.stringify(event)}\n`);
  return { ok: true, event, rule: out.rule, mirror: await mirror(event, deps.db === undefined ? defaultEventsDb() : deps.db) };
}

async function mirror(event: Event, db: EventsInsert | null): Promise<Mirror> {
  if (!db) return { status: "skipped", why: "Supabase is not configured here" };
  try {
    const { error } = await db.from("events").insert(event);
    return error ? { status: "failed", error: error.message } : { status: "saved" };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}
