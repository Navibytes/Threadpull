// Tool contract (SKELETON §7): Hazel's tool names, their acorn costs, and the shape every tool returns.
// Every check in lib/ returns a ToolResult so the agent, the ledger, the event log and the board share one shape.
import { z } from "zod";

// Acorn costs are design choices; `unit` is the real-world unit shown beside them (SKELETON §7).
export const TOOL_SPECS = {
  inspect_loan: { acorns: 0, unit: "1 loan record" },
  find_connections: { acorns: 0, unit: "1 graph query" },
  compare_documents: { acorns: 1, unit: "1 document pair" },
  dealer_timeline: { acorns: 1, unit: "1 dealer query" },
  inspect_dealer_loans: { acorns: 5, unit: "every loan from 1 dealer" },
  crs_identity_check: { acorns: 3, unit: "1 CRS call" },
  crs_credit_report: { acorns: 6, unit: "3 CRS calls" },
  crs_fraud_finder: { acorns: 2, unit: "1 CRS call" },
  crs_reverse_phone: { acorns: 1, unit: "1 CRS call" },
  check_address: { acorns: 0, unit: "1 free lookup" },
  check_household: { acorns: 0, unit: "1 loan-pair comparison" },
  check_employer: { acorns: 0, unit: "1 employer lookup" },
  check_vin: { acorns: 0, unit: "1 free lookup" },
  ask_human: { acorns: 0, unit: "1 question" },
  close_lead: { acorns: 0, unit: "1 note" },
} as const satisfies Record<string, { acorns: number; unit: string }>;

export type ToolName = keyof typeof TOOL_SPECS;
export const TOOL_NAMES = Object.keys(TOOL_SPECS) as [ToolName, ...ToolName[]];
export const ToolNameSchema = z.enum(TOOL_NAMES);

// Where a claim comes from. "No source, no sentence" (SKELETON §4 rule 5): every result cites at least one.
export const SourceRefSchema = z.discriminatedUnion("kind", [
  // a field of a loan record, e.g. { loan_id: "L0412", field: "applicant_info.phone" }
  z.object({ kind: z.literal("row"), loan_id: z.string(), field: z.string() }),
  // a document, optionally pointing at one detail (template, a number, a line)
  z.object({ kind: z.literal("document"), doc_id: z.string(), detail: z.string().optional() }),
  // a CRS call; request_id is the RequestID response header
  z.object({ kind: z.literal("crs"), product: z.string(), request_id: z.string() }),
  // a public or reference lookup (Census, NHTSA, address type, employer size); simulated stand-ins say so
  z.object({ kind: z.literal("lookup"), name: z.string(), key: z.string(), simulated: z.boolean() }),
  // a saved ask-once rule
  z.object({ kind: z.literal("rule"), rule_id: z.string(), version: z.number().int() }),
  // a human answer to a question
  z.object({ kind: z.literal("human"), question_id: z.string(), answered_by: z.string() }),
  // an earlier event in the same run
  z.object({ kind: z.literal("event"), run_id: z.string(), seq: z.number().int() }),
]);

export const CostSchema = z.object({
  acorns: z.number().int().nonnegative(),
  unit: z.string(),
});

/** Schema for a tool result whose `result` payload has the given shape. */
export function toolResultSchema<T extends z.ZodType>(result: T) {
  return z.object({
    ok: z.boolean(),
    result,
    sources: z.array(SourceRefSchema),
    cost: CostSchema,
    simulated: z.boolean(), // true if any part came from a simulated stand-in, never a live call
    error: z.string().optional(), // set when ok is false (refused, over budget, CRS failure)
  });
}

export const ToolResultSchema = toolResultSchema(z.unknown());

export type SourceRef = z.infer<typeof SourceRefSchema>;
export type Cost = z.infer<typeof CostSchema>;
export type ToolResult<T = unknown> = Omit<z.infer<typeof ToolResultSchema>, "result"> & { result: T };

/** A successful result. The cost always comes from TOOL_SPECS, never from the caller. */
export function toolOk<T>(tool: ToolName, result: T, sources: SourceRef[], simulated = false): ToolResult<T> {
  if (sources.length === 0) throw new Error(`${tool}: a result needs at least one source`);
  return { ok: true, result, sources, cost: { ...TOOL_SPECS[tool] }, simulated };
}

/** A refused or failed call. Charges nothing: the ledger only charges successful calls. */
export function toolError(tool: ToolName, error: string): ToolResult<null> {
  return { ok: false, result: null, sources: [], cost: { acorns: 0, unit: TOOL_SPECS[tool].unit }, simulated: false, error };
}
