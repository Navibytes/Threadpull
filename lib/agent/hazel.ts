// Hazel's run (ticket 05): code opens the top lead, Claude picks the next tool, and every tool call goes through
// code that charges the ledger, writes the event rows the board draws, takes strings down and applies saved rules.
// Claude never sets a status, a number or the budget (CLAUDE.md rule 1). Uses the Anthropic SDK tool runner.
import type Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Event } from "@/lib/contracts/event";
import type { GraphEdge } from "@/lib/contracts/graph";
import { LOAN_STATUSES, type Loan, type LoanStatus } from "@/lib/contracts/loan";
import { QuestionTopicSchema } from "@/lib/contracts/rule";
import { toolError, TOOL_SPECS, type SourceRef, type ToolName, type ToolResult } from "@/lib/contracts/tool-result";
import {
  creditEventFacts, crsCreditReport, crsFraudFinder, crsIdentityCheck, crsReversePhone, type CreditReport, type CrsClient, type FraudFinder,
  type IdentityCheck,
} from "@/lib/crs";
import { budgetSpentRow, recoveryRow } from "@/lib/event-rows";
import {
  attackEvent, withdrawAddress, withdrawBursts, withdrawHousehold, type AddressCheck, type ClueExplained,
  type DealerTimeline, type EmployerCheck, type HouseholdCheck, type StubExtractor,
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
import { createDataRoom, prepareTool, runTool, TOOLS, type HazelToolName } from "./tools";

/** link_found rows per find_connections call: the board shows 20–30 cards, not every weak thread. */
const MAX_LINKS_PER_QUERY = 8;

export type TraceEntry = {
  iteration: number; stop_reason: string | null; model: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
  content: { type: string; name?: string; text?: string }[];
};

export type HazelOptions = {
  runId: string;
  loans: readonly Loan[];
  seed?: number; // the generated portfolio's seed, written on run_started so the board loads the same loans
  reference: Reference;
  anthropic: Anthropic;
  documentReader?: StubExtractor;
  // loans a person chose to start from, in order (the operator at a demo, an analyst with a hunch): worked before the
  // ranked leads, recorded on run_started and on each lead_opened row as chosen by the operator, never by detection code
  leads?: string[]; // reads pay stubs the parser can't (modelStubExtractor); without one they stay unreadable
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
  const room = createDataRoom(opts.loans, opts.reference, opts.documentReader);
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
  const credit = new Map<string, { report: CreditReport; sources: SourceRef[] }>();
  const fraud = new Map<string, { found: FraudFinder; sources: SourceRef[] }>();
  const evidence = (): RunEvidence => ({ identity, credit, openQuestions });

  async function openLead(loanId: string, why: string) {
    opened.add(loanId);
    const lead = room.graph.score(loanId);
    await log.append({ type: "lead_opened", loan_ids: [loanId], tool: null, result: { score: lead.score, origins: lead.origins },
      sources: [{ kind: "row", loan_id: loanId, field: "loan_id" }], note: why, simulated: false });
  }
  const operatorLeads = [...new Set(opts.leads ?? [])];
  const unknown = operatorLeads.filter((id) => !room.byId.has(id));
  if (unknown.length) throw new Error(`operator lead${unknown.length > 1 ? "s" : ""} not in the portfolio: ${unknown.join(", ")}`);
  type Lead = { loan_id: string; score: number; chosen: boolean };
  const nextLead = (): Lead | undefined => {
    const open = (id: string) => !opened.has(id) && !statuses.has(id);
    const mine = operatorLeads.find(open);
    if (mine) return { loan_id: mine, score: room.graph.score(mine).score, chosen: true };
    const l = ranked.find((x) => x.score > 0 && open(x.loan_id));
    return l && { loan_id: l.loan_id, score: l.score, chosen: false };
  };
  const leadWhy = (l: Lead, first: boolean) => l.chosen
    ? `${first ? "Lead" : "Next lead"} chosen by the operator (score ${l.score}).`
    : `${first ? "Top lead" : "Next lead"} by rank (score ${l.score}).`;
  // close_lead suggests the next lead; it only counts as opened (and shows on the board) once Hazel works on it
  let suggested: Lead | null = null;
  async function openIfSuggested(loanIds: string[]) {
    if (!suggested || !loanIds.includes(suggested.loan_id) || opened.has(suggested.loan_id)) return;
    const lead = suggested;
    suggested = null;
    await openLead(lead.loan_id, leadWhy(lead, false));
  }

  // A link_found row per link the board hasn't drawn yet (at most a board's worth per call). Also written before a
  // link comes down, so the board always shows a thread before it falls (a check can explain links never shown).
  async function showLinks(edges: readonly GraphEdge[], tool: ToolName) {
    for (const e of edges.filter((e) => !e.explained && !shownEdges.has(e.edge_id)).slice(0, MAX_LINKS_PER_QUERY)) {
      shownEdges.add(e.edge_id);
      await log.append({ type: "link_found", loan_ids: [e.a, e.b], tool,
        result: { edge_id: e.edge_id, kind: e.kind, weight: e.weight }, sources: e.sources,
        note: `Same ${e.kind.replace("_", " ")}; ${e.shared_by} loans in the pool share it.`, simulated: false });
    }
  }

  // Every document of a loan is scanned for injected instructions when Hazel reads the loan, and again before code
  // decides its status, so an attack is always on the record whichever tools she chose. Each document is flagged once.
  async function scanDocuments(loanId: string, tool: ToolName) {
    const loan = room.byId.get(loanId)!;
    for (const doc of loan.documents) {
      const attack = flaggedDocs.has(doc.doc_id) ? null : attackEvent(doc);
      if (!attack) continue;
      flaggedDocs.add(doc.doc_id);
      await log.append({ type: "attack_detected", loan_ids: [loan.loan_id], tool, result: attack.result,
        sources: attack.sources, note: "A document carried instruction-like text; it was withheld and has no effect.", simulated: false });
    }
  }

  // ------------------------------------------------------------ what a tool call writes besides check_run
  async function afterCheck(name: ToolName, input: Record<string, unknown>, result: ToolResult<unknown>, at: { run_id: string; seq: number }) {
    const clue = async (c: ClueExplained | null, by: string) => {
      if (!c) return;
      await showLinks(c.links, name);
      await log.append({ type: "clue_explained", loan_ids: c.loan_ids, tool: name, result: c.result, sources: c.sources,
        note: `${by}: ${c.result.reason}.`, simulated: c.simulated });
    };
    if (name === "inspect_loan") await scanDocuments(input.loan_id as string, "inspect_loan");
    if (name === "find_connections") {
      await showLinks((result.result as Partial<LoanConnections>).edges ?? [], "find_connections");
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
    // the facts must be about this loan's employer: a check of another employer (a 500-staff hospital) never
    // clears this loan's link (a 4-staff shell company), whatever loan_id the model passes with it
    const named = room.loans.find((l) => l.employment_info.employer_name === check.result.employer);
    const checked = named && room.graph.entitiesOf(named.loan_id).find((e) => room.graph.kind(e) === "employer");
    if (checked !== entity) return `no rule applied: ${check.result.employer} is not the employer on ${loanId}; check that loan's own employer`;
    const link = employerLink(room.graph, loanId, check);
    const match = matchRule(await currentRules(opts.rules), link.context);
    if (match.status === "missing") return `${match.rule.id} could cover this once ${match.missing.join(", ")} is checked`;
    if (match.status !== "match") return match.status === "outside_scope" ? "outside every saved rule's scope" : "no saved rule";
    const done = applyRule(room.graph, match.rule, loanId, entity, { at, simulated: link.simulated });
    if (!done) return `${match.rule.id} applies; nothing left to take down`;
    await showLinks(done.clue.links, "check_employer");
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
    if (Array.isArray(input.loan_ids)) ids.push(...input.loan_ids.filter((x): x is string => typeof x === "string" && room.byId.has(x)));
    return [...new Set(ids)];
  };

  /** Write check_run for every call that reached code (refused ones included) and what follows a success; hand Claude a compact reply. */
  async function record(name: ToolName, input: Record<string, unknown>, hazelNote: string | undefined, result: ToolResult<unknown>) {
    await openIfSuggested(loansIn(input));
    if (!result.ok) {
      // refused or failed calls go in the record too (clean audit log); nothing was charged, so the budget is unchanged
      const loanIds = loansIn(input);
      await log.append({ type: "check_run", loan_ids: loanIds, tool: name, result: { input, ok: false, error: result.error ?? "refused" },
        sources: loanIds.map((id): SourceRef => ({ kind: "row", loan_id: id, field: "loan_id" })),
        note: hazelNote ?? `${name} refused: ${result.error ?? "no reason given"}.`, simulated: false });
      return json({ ok: false, error: result.error, budget: budget() });
    }
    const row = await log.append({ type: "check_run", loan_ids: loansIn(input), tool: name, result: { input, ok: true, ...(name === "crs_credit_report" ? creditEventFacts(result.result as CreditReport) : {}) },
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
        const run = async () => { await prepareTool(room, name, input); return runTool(room, name, input); };
        const result = TOOL_SPECS[name].acorns > 0
          ? await onePaidCallAtATime(loansIn(input), () => ledger.run(name, run))
          : await run();
        return record(name, input, hazelNote as string | undefined, result);
      },
    });
  });

  // A CRS call that throws (a sandbox outage, a persona with no recorded answer in replay) becomes an uncharged
  // refusal that is logged like any other, instead of an error the run never records. The ledger refunds a throw.
  const crsCall = async <T,>(name: ToolName, loanIds: string[], call: () => Promise<ToolResult<T | null>>): Promise<ToolResult<T | null>> => {
    try {
      return await onePaidCallAtATime(loanIds, call);
    } catch (e) {
      return toolError(name, `CRS call failed, nothing charged: ${(e as Error).message}`);
    }
  };
  const cost = (name: ToolName) => `${TOOL_SPECS[name].acorns} acorns (${TOOL_SPECS[name].unit})`;
  const loanTool = <T,>(name: ToolName, description: string, call: (loan: Loan) => Promise<ToolResult<T | null>>,
    keep: (loanId: string, result: T, sources: SourceRef[]) => void) => betaZodTool({
    name, description: `${description} ${cost(name)}.`,
    inputSchema: z.object({ loan_id: z.string(), note }),
    run: async ({ loan_id, note: hazelNote }) => {
      const loan = room.byId.get(loan_id);
      if (!loan) return json({ ok: false, error: `unknown loan ${loan_id}` });
      const result = await crsCall(name, [loan_id], () => call(loan));
      if (result.ok && result.result) keep(loan_id, result.result, result.sources);
      return record(name, { loan_id }, hazelNote, result);
    },
  });

  const identityTool = loanTool("crs_identity_check",
    "TransUnion identity verification for one loan: messages 2201 SSN not associated with the name, 2202 date of birth doesn't match, 2301 deceased, 2401 fraud alert, 2101 address mismatch; no messages = verified. Hard signals: 2201, 2202, 2301.",
    (loan) => crsIdentityCheck(loan, ledger, opts.crs), (id, check, sources) => identity.set(id, { check, sources }));

  const creditTool = loanTool("crs_credit_report",
    "The loan's credit report from all three bureaus, merged: file age, addresses on file, tradeline depth, authorized-user share, recent inquiries, and whether a bureau is frozen, the bureaus disagree, or a file is deceased. Good score with little history (thick file, thin life) is a soft signal.",
    (loan) => crsCreditReport(loan, ledger, opts.crs), (id, report, sources) => credit.set(id, { report, sources }));

  const fraudTool = loanTool("crs_fraud_finder",
    "AtData Fraud Finder for one loan: email age and status, phone line type and whether its owner's name matches, address type, IP distance from the address, risk score 0-100. All soft signals: they support a case, they don't make one.",
    (loan) => crsFraudFinder(loan, ledger, opts.crs), (id, found, sources) => fraud.set(id, { found, sources }));

  const phoneTool = betaZodTool({
    name: "crs_reverse_phone",
    description: `Who a phone number is registered to (name and address), from AccurateAppend. ${cost("crs_reverse_phone")}.`,
    inputSchema: z.object({ phone: z.string().min(7), note }),
    run: async ({ phone, note: hazelNote }) => {
      const digits = phone.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
      const loanIds = opts.loans.filter((l) => l.applicant_info.phone === digits).map((l) => l.loan_id);
      const result = await crsCall("crs_reverse_phone", loanIds, () => crsReversePhone(digits, ledger, opts.crs));
      return record("crs_reverse_phone", { phone: digits, loan_ids: loanIds }, hazelNote, result);
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
      await scanDocuments(loan_id, "close_lead"); // no status without its documents checked (CLAUDE.md rule 5)
      const d = decideStatus(room.graph, loan_id, evidence());
      statuses.set(loan_id, d.status);
      await log.append({ type: "status_changed", loan_ids: [loan_id], tool: "close_lead",
        result: { status: d.status, reason: d.reason, ...(proposed_status && proposed_status !== d.status ? { proposed: proposed_status } : {}) },
        sources: d.sources, note: hazelNote ?? `${d.status}: ${d.reason}.`, simulated: false });
      const next = nextLead();
      suggested = next ?? null;
      return json({ ok: true, status: d.status, reason: d.reason, next_lead: next?.loan_id ?? null, budget: budget() });
    },
  });

  // ------------------------------------------------------------ the run
  const first = nextLead() ?? { loan_id: ranked[0].loan_id, score: ranked[0].score, chosen: false };
  await log.append({ type: "run_started", loan_ids: [], tool: null, result: { model: HAZEL_MODEL, loans: opts.loans.length, budget: ledger.limit,
    ...(opts.seed !== undefined ? { seed: opts.seed } : {}), ...(operatorLeads.length ? { operator_leads: operatorLeads } : {}) },
    sources: [], note: operatorLeads.length ? `Run started. The operator chose ${operatorLeads.join(", ")} as the first lead${operatorLeads.length > 1 ? "s" : ""}.` : "Run started.", simulated: false });
  await openLead(first.loan_id, leadWhy(first, true));

  const runner = opts.anthropic.beta.messages.toolRunner({
    model: HAZEL_MODEL,
    max_tokens: HAZEL_MAX_TOKENS,
    max_iterations: opts.maxIterations ?? HAZEL_MAX_ITERATIONS,
    output_config: { effort: HAZEL_EFFORT },
    betas: [FALLBACK_BETA],
    fallbacks: "default",
    cache_control: { type: "ephemeral" }, // system prompt and tools never change within a run, so each request reuses the cached prefix
    system: HAZEL_SYSTEM,
    tools: [...dataRoomTools, identityTool, creditTool, fraudTool, phoneTool, askTool, closeTool],
    messages: [{ role: "user", content: `Portfolio: ${opts.loans.length} loans. Budget: ${ledger.limit} acorns. Your lead: ${first.loan_id} (${first.chosen ? "chosen by the operator" : "rank 1"}, score ${first.score}). Begin.` }],
  });

  let iterations = 0, stop_reason: string | null = null, recap = "";
  // A failed model request (overloaded, network) still ends the log with run_finished, so the board and the run's
  // files show where it stopped instead of a run that never ends; the error is then passed on to the caller.
  let failure: unknown = null;
  // a 429 from CRS: the client waits out Retry-After and tries again; the board shows it as a recovery row for the
  // paid call in progress (paid calls run one at a time, so callLoans is that call's loan). Its budget is the last row's:
  // the ledger has reserved the call's cost, but nothing is charged until the call succeeds.
  const stopWatching = opts.crs.watchRecovery(async (info) => {
    await log.append(recoveryRow(info, log.last?.budget ?? budget(), { loan_ids: callLoans }));
  });
  try {
    for await (const message of runner) {
      iterations++;
      stop_reason = message.stop_reason;
      const text = message.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("\n").trim();
      if (text) recap = text;
      opts.trace?.({
        iteration: iterations, stop_reason: message.stop_reason, model: message.model,
        usage: { input_tokens: message.usage.input_tokens, output_tokens: message.usage.output_tokens,
          cache_read_input_tokens: message.usage.cache_read_input_tokens, cache_creation_input_tokens: message.usage.cache_creation_input_tokens },
        content: message.content.map((b) => b.type === "tool_use" ? { type: b.type, name: b.name } : b.type === "text" ? { type: b.type, text: b.text } : { type: b.type }),
      });
    }
  } catch (e) {
    failure = e;
    stop_reason = "error";
  } finally {
    stopWatching();
  }

  await log.append({ type: "run_finished", loan_ids: [...statuses.keys()].sort(), tool: null,
    result: { iterations, stop_reason, statuses: Object.fromEntries([...statuses].sort()) },
    sources: [], note: failure ? `Run stopped on an error: ${failure instanceof Error ? failure.message : String(failure)}.`
      : stop_reason === "refusal" ? "The model declined to continue; run stopped." : "Run finished.", simulated: false });
  if (failure) throw failure;

  return { events: log.rows, statuses, spent: ledger.spent, limit: ledger.limit, iterations, stop_reason, recap };
}
