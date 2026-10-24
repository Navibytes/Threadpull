// Hazel's tools that need no CRS call (SKELETON §7). Each has a Zod input schema and a description, the shape the
// AI SDK loop wraps; the logic stays in its owning module (lib/graph, lib/evidence). The CRS tools come with
// ticket 03 (lib/crs), and ask_human / close_lead with the loop. Costs always come from TOOL_SPECS via toolOk.
// Taking strings down after a check is lib/evidence (withdrawAddress, withdrawHousehold, withdrawBursts).
import { z } from "zod";
import type { Loan } from "@/lib/contracts/loan";
import { toolError, toolOk, type SourceRef, type ToolName, type ToolResult } from "@/lib/contracts/tool-result";
import { buildGraph, findConnections, type EvidenceGraph } from "@/lib/graph";
import {
  checkAddress, checkEmployer, checkHousehold, compareDocuments, dealerTimeline, safeDocumentView, templateUsage,
} from "@/lib/evidence";
import type { Reference } from "@/lib/ingest/reference";

/** Everything Hazel may look at: the data room, its graph and the reference lookups. Nothing outside it. */
export type DataRoom = {
  loans: readonly Loan[];
  byId: ReadonlyMap<string, Loan>;
  byDoc: ReadonlyMap<string, Loan>;
  graph: EvidenceGraph;
  reference: Reference;
  usage: Map<string, number>; // document fingerprint → uses, for compare_documents
};

export function createDataRoom(loans: readonly Loan[], reference: Reference): DataRoom {
  return {
    loans, reference, graph: buildGraph(loans), usage: templateUsage(loans),
    byId: new Map(loans.map((l) => [l.loan_id, l])),
    byDoc: new Map(loans.flatMap((l) => l.documents.map((d) => [d.doc_id, l] as const))),
  };
}

type HazelTool<S extends z.ZodType> = {
  description: string;
  input: S;
  run: (room: DataRoom, input: z.infer<S>) => ToolResult<unknown>;
};
const tool = <S extends z.ZodType>(t: HazelTool<S>) => t;

const loanId = z.string().regex(/^L\d{4}$/).describe("a loan id, e.g. from find_connections");
const lastFour = (ssn: string) => `***-**-${ssn.slice(-4)}`;

// The loan record a model may read: an allowlist of blocks (no ground-truth or test-fixture fields), the SSN
// masked, and documents only as their form fields (lib/evidence safeDocumentView), never the raw text.
function loanView(l: Loan) {
  return {
    loan_id: l.loan_id, status: l.status, submission: l.submission,
    applicant_info: { ...l.applicant_info, ssn: lastFour(l.applicant_info.ssn) },
    co_applicant_info: l.co_applicant_info, residential_info: l.residential_info, employment_info: l.employment_info,
    vehicle_and_loan_details: l.vehicle_and_loan_details, funding_info: l.funding_info, derived: l.derived,
    documents: l.documents.map(safeDocumentView),
  };
}

/** A graph entity id (address:…, employer:…) or a plain value → the value the evidence checks expect. */
function resolve(room: DataRoom, kind: "address" | "employer", arg: string): string {
  if (!arg.startsWith(`${kind}:`) || !room.graph.hasEntity(arg)) return arg;
  const values = room.graph.loansOf(arg).map((id) => {
    const l = room.byId.get(id)!;
    return kind === "address" ? l.derived.address_key : l.employment_info.employer_name;
  });
  const counts = new Map<string, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0]; // most common spelling
}

export const TOOLS = {
  inspect_loan: tool({
    description: "Read one loan record and its documents (form fields only). Free.",
    input: z.object({ loan_id: loanId }),
    run: (room, { loan_id }) => {
      const l = room.byId.get(loan_id);
      if (!l) return toolError("inspect_loan", `unknown loan ${loan_id}`);
      return toolOk("inspect_loan", loanView(l), [
        { kind: "row", loan_id, field: "loan_id" },
        ...l.documents.map((d): SourceRef => ({ kind: "document", doc_id: d.doc_id })),
      ]);
    },
  }),

  find_connections: tool({
    description: "Neighbours of a loan or of a shared attribute (entity id like phone:…, employer:…), with rarity weights and sources. Free.",
    input: z.object({ entity_id: z.string().min(1) }),
    run: (room, { entity_id }) => findConnections(room.graph, entity_id),
  }),

  compare_documents: tool({
    description: "Compare two pay stubs (doc ids like L0001-PS): template fingerprint, check number, arithmetic. 1 acorn.",
    input: z.object({ doc_a: z.string().min(1), doc_b: z.string().min(1) }),
    run: (room, { doc_a, doc_b }) => {
      const a = room.byDoc.get(doc_a), b = room.byDoc.get(doc_b);
      if (!a || !b) return toolError("compare_documents", `document not found: ${!a ? doc_a : doc_b}`);
      return compareDocuments({ loan: a, doc_id: doc_a }, { loan: b, doc_id: doc_b }, room.usage);
    },
  }),

  dealer_timeline: tool({
    description: "A dealer's monthly volume and bursts compared with its own history. 1 acorn.",
    input: z.object({ dealer_id: z.string().min(1) }),
    run: (room, { dealer_id }) => dealerTimeline(dealer_id, room.loans),
  }),

  inspect_dealer_loans: tool({
    description: "Every loan from one dealer, strongest graph lead first. 5 acorns.",
    input: z.object({ dealer_id: z.string().min(1) }),
    run: (room, { dealer_id }) => {
      const own = room.loans.filter((l) => l.submission.dealer_id === dealer_id);
      if (!own.length) return toolError("inspect_dealer_loans", `no loans for dealer ${dealer_id}`);
      const loans = own
        .map((l) => ({
          loan_id: l.loan_id, submitted_at: l.submission.submitted_at, broker_id: l.submission.broker_id,
          amount_financed: l.funding_info.amount_financed, lead_score: room.graph.score(l.loan_id).score,
        }))
        .sort((p, q) => q.lead_score - p.lead_score || p.loan_id.localeCompare(q.loan_id));
      const total = Math.round(own.reduce((s, l) => s + l.funding_info.amount_financed, 0) * 100) / 100;
      return toolOk("inspect_dealer_loans", { dealer_id, dealer_name: own[0].submission.dealer_name, count: own.length,
        amount_financed_total: total, loans },
        own.map((l): SourceRef => ({ kind: "row", loan_id: l.loan_id, field: "submission.dealer_id" })));
    },
  }),

  check_address: tool({
    description: "Is a shared address a multi-unit building with room for everyone who names it? Takes an address entity id or address_key. Free.",
    input: z.object({ address: z.string().min(1) }),
    run: (room, { address }) => checkAddress(resolve(room, "address", address), room.loans, room.reference),
  }),

  check_household: tool({
    description: "Do two loans look like one household (same phone and home, same last name or a listed co-applicant)? Free.",
    input: z.object({ loan_a: loanId, loan_b: loanId }),
    run: (room, { loan_a, loan_b }) => {
      const a = room.byId.get(loan_a), b = room.byId.get(loan_b);
      if (!a || !b) return toolError("check_household", `unknown loan ${!a ? loan_a : loan_b}`);
      return checkHousehold(a, b);
    },
  }),

  check_employer: tool({
    description: "Employer headcount and how many loans in the pool name it. Facts only; never clears a link by itself. Takes an employer entity id or name. Free.",
    input: z.object({ employer: z.string().min(1) }),
    run: (room, { employer }) => checkEmployer(resolve(room, "employer", employer), room.loans, room.reference),
  }),
} satisfies Partial<Record<ToolName, HazelTool<z.ZodType>>>;

export type HazelToolName = keyof typeof TOOLS;
export const isHazelTool = (name: string): name is HazelToolName => Object.hasOwn(TOOLS, name);

/** Run one tool. Input is validated first; a refused call costs nothing (toolError). */
export function runTool(room: DataRoom, name: HazelToolName, input: unknown): ToolResult<unknown> {
  const t = TOOLS[name] as HazelTool<z.ZodType>;
  const parsed = t.input.safeParse(input);
  if (!parsed.success) return toolError(name, `invalid input: ${parsed.error.issues.map((i) => `${i.path.join(".") || "input"} ${i.message}`).join("; ")}`);
  return t.run(room, parsed.data);
}
