// Hazel's run (ticket 05): code opens the top lead, Claude picks the next tool, and every tool call goes through
// code that charges the ledger, writes the event rows the board draws, takes strings down and applies saved rules.
// Claude never sets a status, a number or the budget (CLAUDE.md rule 1). Uses the Anthropic SDK tool runner.
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Event } from "@/lib/contracts/event";
import { LOAN_STATUSES, type Loan, type LoanStatus } from "@/lib/contracts/loan";
import { QuestionTopicSchema } from "@/lib/contracts/rule";
import { TOOL_SPECS, type SourceRef, type ToolName, type ToolResult } from "@/lib/contracts/tool-result";
import { crsIdentityCheck, type CrsClient, type IdentityCheck } from "@/lib/crs";
import { budgetSpentRow } from "@/lib/event-rows";
import {
  attackEvent, withdrawAddress, withdrawBursts, withdrawHousehold, type AddressCheck, type ClueExplained,
  type DealerTimeline, type EmployerCheck, type HouseholdCheck,
} from "@/lib/evidence";
import type { LoanConnections } from "@/lib/graph";
import type { Reference } from "@/lib/ingest/reference";
import { Ledger, DEFAULT_BUDGET } from "@/lib/ledger";
import {
  applyRule, askHuman, currentRules, employerLink, matchRule, type RuleStore,
} from "@/lib/rules";
import { EventLog, type EventSink } from "./event-log";
import { FALLBACK_BETA, HAZEL_EFFORT, HAZEL_MAX_ITERATIONS, HAZEL_MAX_TOKENS, HAZEL_MODEL } from "./models";
import { HAZEL_SYSTEM } from "./prompt";
import { decideStatus, type RunEvidence } from "./status";
import { createDataRoom, runTool, TOOLS, type HazelToolName } from "./tools";

/** link_found rows per find_connections call: the board shows 20–30 cards, not every weak thread. */
const MAX_LINKS_PER_QUERY = 8;

export type TraceEntry = {
  iteration: number; stop_reason: string | null; model: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null };
  content: { type: string; name?: string; text?: string }[];
};

export type HazelOptions = {
  runId: string;
  loans: readonly Loan[];
  reference: Reference;
  anthropic: Anthropic;
  crs: CrsClient;
  rules: RuleStore;
  budget?: number;
  maxIterations?: number;
  sinks?: EventSink[];
  trace?: (entry: TraceEntry) => void;
  now?: () => Date;
};

export type HazelRun = {
  events: readonly Event[];
  statuses: ReadonlyMap<string, LoanStatus>;
  spent: number;
  limit: number;
  iterations: number;
  stop_reason: string | null;
  recap: string;
};

const note = z.string().max(600).optional().describe("At most two sentences: what you saw and why it matters.");
const json = (x: unknown) => JSON.stringify(x);

export async function runHazel(opts: HazelOptions): Promise<HazelRun> {
  const room = createDataRoom(opts.loans, opts.reference);
  let callLoans: string[] = []; // loans of the paid call in progress, for its budget_spent row
  // Paid calls run one at a time even when Claude asks for several at once, so each budget_spent row carries its own
  // loan and the running total the board shows goes 3, 6, 9 instead of jumping. Free tools still run in parallel.
  let paidQueue: Promise<unknown> = Promise.resolve();
  const onePaidCallAtATime = <T>(loanIds: string[], call: () => Promise<T>): Promise<T> => {
    const next = paidQueue.then(() => { callLoans = loanIds; return call(); });
    paidQueue = next.catch(() => {});
    return next;
  };
  // the log is created right after; the ledger only calls back during a tool call, by which time it exists
  let log!: EventLog;
  const ledger = new Ledger(opts.budget ?? DEFAULT_BUDGET, async (spend) => { await log.append(budgetSpentRow(spend, { loan_ids: callLoans })); });
  log = new EventLog(opts.runId, () => ({ spent: ledger.spent, limit: ledger.limit }), opts.sinks, opts.now);

  const identity = new Map<string, { check: IdentityCheck; sources: SourceRef[] }>();
  const openQuestions = new Set<string>();
  const statuses = new Map<string, LoanStatus>();
  const shownEdges = new Set<string>();
  const flaggedDocs = new Set<string>();
  const ranked = room.graph.rankLeads();
  const opened = new Set<string>();
  const budget = () => ({ spent: ledger.spent, limit: ledger.limit });
  const evidence = (): RunEvidence => ({ identity, openQuestions });

  async function openLead(loanId: string, why: string) {
    opened.add(loanId);
    const lead = room.graph.score(loanId);
    await log.append({ type: "lead_opened", loan_ids: [loanId], tool: null, result: { score: lead.score, origins: lead.origins },
      sources: [{ kind: "row", loan_id: loanId, field: "loan_id" }], note: why, simulated: false });
  }
  const nextLead = () => ranked.find((l) => l.score > 0 && !opened.has(l.loan_id) && !statuses.has(l.loan_id));

  // ------------------------------------------------------------ what a tool call writes besides check_run
  async function afterCheck(name: ToolName, input: Record<string, unknown>, result: ToolResult<unknown>, at: { run_id: string; seq: number }) {
    const clue = async (c: ClueExplained | null, by: string) => {
      if (!c) return;
      await log.append({ type: "clue_explained", loan_ids: c.loan_ids, tool: name, result: c.result, sources: c.sources,
        note: `${by}: ${c.result.reason}.`, simulated: c.simulated });
    };
    if (name === "inspect_loan") {
      const loan = room.byId.get(input.loan_id as string)!;
      for (const doc of loan.documents) {
        const attack = flaggedDocs.has(doc.doc_id) ? null : attackEvent(doc);
        if (!attack) continue;
        flaggedDocs.add(doc.doc_id);
        await log.append({ type: "attack_detected", loan_ids: [loan.loan_id], tool: "inspect_loan", result: attack.result,
          sources: attack.sources, note: "A document carried instruction-like text; it was withheld and has no effect.", simulated: false });
      }
    }
    if (name === "find_connections") {
      const r = result.result as Partial<LoanConnections>;
      for (const e of (r.edges ?? []).filter((e) => !e.explained && !shownEdges.has(e.edge_id)).slice(0, MAX_LINKS_PER_QUERY)) {
        shownEdges.add(e.edge_id);
        await log.append({ type: "link_found", loan_ids: [e.a, e.b], tool: "find_connections",
          result: { edge_id: e.edge_id, kind: e.kind, weight: e.weight }, sources: e.sources,
          note: `Same ${e.kind.replace("_", " ")}; ${e.shared_by} loans in the pool share it.`, simulated: false });
      }
    }
    if (name === "check_address") await clue(withdrawAddress(room.graph, result as ToolResult<AddressCheck>, at), "check_address");
    if (name === "check_household") await clue(withdrawHousehold(room.graph, result as ToolResult<HouseholdCheck>, at), "check_household");
    if (name === "dealer_timeline") for (const c of withdrawBursts(result as ToolResult<DealerTimeline>, at)) await clue(c, "dealer_timeline");
    if (name === "check_employer") return applySavedRule(input, result as ToolResult<EmployerCheck>, at);
    return undefined;
  }

  // ask once, remember forever: a saved rule that covers this employer link takes it down, citing the rule
  async function applySavedRule(input: Record<string, unknown>, check: ToolResult<EmployerCheck>, at: { run_id: string; seq: number }) {
    const loanId = input.loan_id as string | undefined;
    if (!loanId || !room.byId.has(loanId)) return undefined;
    const entity = room.graph.entitiesOf(loanId).find((e) => room.graph.kind(e) === "employer");
    if (!entity) return undefined;
    const link = employerLink(room.graph, loanId, check);
    const match = matchRule(await currentRules(opts.rules), link.context);
    if (match.status === "missing") return `${match.rule.id} could cover this once ${match.missing.join(", ")} is checked`;
    if (match.status !== "match") return match.status === "outside_scope" ? "outside every saved rule's scope" : "no saved rule";
    const done = applyRule(room.graph, match.rule, loanId, entity, { at, simulated: link.simulated });
    if (!done) return `${match.rule.id} applies; nothing left to take down`;
    await log.append({ type: "rule_applied", loan_ids: done.clue.loan_ids.slice(0, 50), tool: "check_employer", result: done.applied,
      sources: done.clue.sources, note: `${match.rule.id} covers this link: ${match.rule.reason_text}`, simulated: link.simulated });
    await log.append({ type: "clue_explained", loan_ids: done.clue.loan_ids.slice(0, 50), tool: "check_employer", result: done.clue.result,
      sources: done.clue.sources, note: `Taken down by ${match.rule.id}.`, simulated: done.clue.simulated });
    return `${match.rule.id} applied: ${done.edges.length} links taken down`;
  }

  const loansIn = (input: Record<string, unknown>): string[] => {
    const ids = [input.loan_id, input.loan_a, input.loan_b].filter((x): x is string => typeof x === "string" && room.byId.has(x));
    for (const d of [input.doc_a, input.doc_b]) if (typeof d === "string" && room.byDoc.has(d)) ids.push(room.byDoc.get(d)!.loan_id);
    if (typeof input.entity_id === "string" && room.byId.has(input.entity_id)) ids.push(input.entity_id);
    return [...new Set(ids)];
  };

  /** Write check_run (and what follows from it) for a successful call; hand Claude a compact reply. */
  async function record(name: ToolName, input: Record<string, unknown>, hazelNote: string | undefined, result: ToolResult<unknown>) {
    if (!result.ok) return json({ ok: false, error: result.error, budget: budget() });
    const row = await log.append({ type: "check_run", loan_ids: loansIn(input), tool: name, result: { input, ok: true },
      sources: result.sources, note: hazelNote ?? `${name} ran.`, simulated: result.simulated });
    const hint = await afterCheck(name, input, result, { run_id: row.run_id, seq: row.seq });
    return json({ ok: true, result: result.result, ...(hint ? { rule: hint } : {}), budget: budget(), simulated: result.simulated });
  }

  // ------------------------------------------------------------ the tools Claude sees
  const dataRoomTools = (Object.keys(TOOLS) as HazelToolName[]).map((name) => {
    const t = TOOLS[name] as { description: string; input: z.ZodObject<z.ZodRawShape> };
    const extra = name === "check_employer"
      ? { loan_id: z.string().optional().describe("the loan whose employer link you are checking, so saved rules can apply"), note }
      : { note };
    return betaZodTool({
      name, description: `${t.description} (${TOOL_SPECS[name].unit})`, inputSchema: t.input.extend(extra),
      run: async ({ note: hazelNote, ...input }) => {
        const result = TOOL_SPECS[name].acorns > 0
          ? await onePaidCallAtATime(loansIn(input), () => ledger.run(name, () => runTool(room, name, input)))
          : runTool(room, name, input);
        return record(name, input, hazelNote as string | undefined, result);
      },
    });
  });

  const identityTool = betaZodTool({
    name: "crs_identity_check",
    description: `TransUnion identity verification for one loan: messages 2201 SSN not associated with the name, 2202 date of birth doesn't match, 2301 deceased, 2401 fraud alert, 2101 address mismatch; no messages = verified. ${TOOL_SPECS.crs_identity_check.acorns} acorns (${TOOL_SPECS.crs_identity_check.unit}).`,
    inputSchema: z.object({ loan_id: z.string(), note }),
    run: async ({ loan_id, note: hazelNote }) => {
      const loan = room.byId.get(loan_id);
      if (!loan) return json({ ok: false, error: `unknown loan ${loan_id}` });
      const result = await onePaidCallAtATime([loan_id], () => crsIdentityCheck(loan, ledger, opts.crs));
      if (result.ok && result.result) identity.set(loan_id, { check: result.result, sources: result.sources });
      return record("crs_identity_check", { loan_id }, hazelNote, result);
    },
  });

  const askTool = betaZodTool({
    name: "ask_human",
    description: "Ask one precise question when you can't decide and there is no precedent. Code routes it (CRO, credit analyst, legal, compliance), scores confidence and gives the reason. Pass employer_loan_id when the question is whether a shared employer explains a link. Free.",
    inputSchema: z.object({
      question: z.string().min(10), topic: QuestionTopicSchema, loan_ids: z.array(z.string()).min(1),
      employer_loan_id: z.string().optional(), note,
    }),
    run: async ({ question, topic, loan_ids, employer_loan_id, note: hazelNote }) => {
      const loans = loan_ids.filter((id) => room.byId.has(id));
      if (!loans.length) return json({ ok: false, error: "no known loan in loan_ids" });
      let link = null;
      if (employer_loan_id && room.byId.has(employer_loan_id)) {
        const entity = room.graph.entitiesOf(employer_loan_id).find((e) => room.graph.kind(e) === "employer")!;
        link = employerLink(room.graph, employer_loan_id, runTool(room, "check_employer", { employer: entity }) as ToolResult<EmployerCheck>);
      }
      const out = await askHuman(opts.rules, { run_id: opts.runId, loan_ids: loans, question, topic,
        context: link?.context ?? null, evidence: link?.evidence ?? { for: [], against: [] }, proposed_rule: link?.proposed_rule ?? null,
        sources: link?.sources ?? loans.map((id): SourceRef => ({ kind: "row", loan_id: id, field: "loan_id" })) }, opts.now?.());
      if (out.status === "asked") {
        for (const id of out.question.loan_ids) openQuestions.add(id);
        await log.append({ type: "question_asked", loan_ids: out.event.loan_ids, tool: "ask_human", result: out.event.result,
          sources: out.event.sources.length ? out.event.sources : [{ kind: "row", loan_id: loans[0], field: "loan_id" }],
          note: hazelNote ?? question, simulated: link?.simulated ?? false });
        const { id, to, confidence, reason } = out.question;
        return json({ ok: true, asked: { id, to, confidence, reason }, note: "Pending: nobody answers during this run." });
      }
      if (out.status === "already_asked") return json({ ok: true, already_asked: out.question.id });
      if (out.status === "check_first") return json({ ok: true, check_first: out.match.missing, rule: out.match.rule.id });
      return json({ ok: true, rule_applies: out.match.rule.id, hint: "call check_employer with loan_id to apply it" });
    },
  });

  const closeTool = betaZodTool({
    name: "close_lead",
    description: "Finish with one loan. Propose a status; code decides the final one from the evidence and tells you the next lead. Free.",
    inputSchema: z.object({ loan_id: z.string(), proposed_status: z.enum(LOAN_STATUSES).optional(), note }),
    run: async ({ loan_id, proposed_status, note: hazelNote }) => {
      if (!room.byId.has(loan_id)) return json({ ok: false, error: `unknown loan ${loan_id}` });
      const d = decideStatus(room.graph, loan_id, evidence());
      statuses.set(loan_id, d.status);
      await log.append({ type: "status_changed", loan_ids: [loan_id], tool: "close_lead",
        result: { status: d.status, reason: d.reason, ...(proposed_status && proposed_status !== d.status ? { proposed: proposed_status } : {}) },
        sources: d.sources, note: hazelNote ?? `${d.status}: ${d.reason}.`, simulated: false });
      const next = nextLead();
      if (next) await openLead(next.loan_id, `Next lead by rank (score ${next.score}).`);
      return json({ ok: true, status: d.status, reason: d.reason, next_lead: next?.loan_id ?? null, budget: budget() });
    },
  });

  // ------------------------------------------------------------ the run
  const first = ranked[0];
  await log.append({ type: "run_started", loan_ids: [], tool: null, result: { model: HAZEL_MODEL, loans: opts.loans.length, budget: ledger.limit },
    sources: [], note: "Run started.", simulated: false });
  await openLead(first.loan_id, `Top lead by rank (score ${first.score}).`);

  const runner = opts.anthropic.beta.messages.toolRunner({
    model: HAZEL_MODEL,
    max_tokens: HAZEL_MAX_TOKENS,
    max_iterations: opts.maxIterations ?? HAZEL_MAX_ITERATIONS,
    output_config: { effort: HAZEL_EFFORT },
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    system: HAZEL_SYSTEM,
    tools: [...dataRoomTools, identityTool, askTool, closeTool],
    messages: [{ role: "user", content: `Portfolio: ${opts.loans.length} loans. Budget: ${ledger.limit} acorns. Your lead: ${first.loan_id} (rank 1, score ${first.score}). Begin.` }],
  });

  let iterations = 0, stop_reason: string | null = null, recap = "";
  for await (const message of runner) {
    iterations++;
    stop_reason = message.stop_reason;
    const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
    if (text) recap = text;
    opts.trace?.({
      iteration: iterations, stop_reason: message.stop_reason, model: message.model,
      usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens, cache_read_input_tokens: message.usage.cache_read_input_tokens },
      content: message.content.map((b) => b.type === "tool_use" ? { type: b.type, name: b.name } : b.type === "text" ? { type: b.type, text: b.text } : { type: b.type }),
    });
  }

  await log.append({ type: "run_finished", loan_ids: [...statuses.keys()].sort(), tool: null,
    result: { iterations, stop_reason, statuses: Object.fromEntries([...statuses].sort()) },
    sources: [], note: stop_reason === "refusal" ? "The model declined to continue; run stopped." : "Run finished.", simulated: false });

  return { events: log.rows, statuses, spent: ledger.spent, limit: ledger.limit, iterations, stop_reason, recap };
}
