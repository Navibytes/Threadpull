// Ticket 06: every CRS tool's result validates against the shared tool-result schema (lib/contracts/tool-result.ts), on the
// real recorded responses and on the refusals: a background loan, an exhausted budget, a halted loan. Costs come from TOOL_SPECS.
import { describe, expect, test } from "bun:test";
import { z } from "zod";
import { TOOL_SPECS, ToolResultSchema, toolResultSchema, type ToolName, type ToolResult } from "@/lib/contracts/tool-result";
import { crsCreditReport, crsFraudFinder, crsIdentityCheck, crsReversePhone } from "@/lib/crs";
import { Ledger } from "@/lib/ledger";
import { client, loanOf, persona, rec } from "./crs-replay";

const background = { loan_id: "L0500", applicant_info: { ssn: "123456789", date_of_birth: "1990-01-01" } };

// The payload each tool promises, in Zod: the same fields the TypeScript types name.
const verdictBureau = z.object({ bureau: z.enum(["transunion", "equifax", "experian"]), status: z.enum(["file_returned", "no_file", "frozen", "deceased", "error"]), score: z.number().nullable() });
const payload = {
  crs_identity_check: z.object({ loan_id: z.string(), verified: z.boolean(), messages: z.array(z.object({ code: z.string(), text: z.string().optional() })) }),
  crs_credit_report: z.object({
    loan_id: z.string(), bureaus: z.array(verdictBureau).length(3), partial: z.boolean(), divergent: z.boolean(), no_file_anywhere: z.boolean(), deceased: z.boolean(),
    status_hint: z.literal("Insufficient evidence").nullable(),
    features: z.object({ file_age_months: z.number().nullable(), borrower_age_years: z.number().nullable(), addresses_on_file: z.number().nullable(), tradeline_depth: z.number(), authorized_user_share: z.number().nullable(), inquiries_60d: z.number() }),
  }),
  crs_fraud_finder: z.object({ loan_id: z.string(), risk_score: z.number().nullable(), email_first_seen: z.string().nullable(), email_age_days: z.number().nullable(), phone_owner_name: z.enum(["match", "no_match", "no_data"]).nullable(), address_type: z.string().nullable() }),
  crs_reverse_phone: z.object({ phone: z.string(), records: z.array(z.object({ first_name: z.string().nullable(), last_name: z.string().nullable() })) }),
} as const;

type Case = { tool: keyof typeof payload; who: string; run: (ledger: Ledger) => Promise<ToolResult<unknown>> };
const cases: Case[] = [
  ...Object.keys(rec.identity).map((id): Case => ({ tool: "crs_identity_check", who: id, run: (l) => crsIdentityCheck(loanOf(id), l, client()) })),
  ...Object.keys(rec.credit_tu).map((id): Case => ({ tool: "crs_credit_report", who: id, run: (l) => crsCreditReport(loanOf(id), l, client()) })),
  ...Object.keys(rec.fraud).map((id): Case => ({ tool: "crs_fraud_finder", who: id, run: (l) => crsFraudFinder(loanOf(id), l, client()) })),
  ...Object.keys(rec.reverse).map((id): Case => ({ tool: "crs_reverse_phone", who: id, run: (l) => crsReversePhone(persona(id).phone, l, client()) })),
];

describe("results on the real recorded responses", () => {
  test("there is a case for every recorded persona of every tool", () => {
    expect(cases.filter((c) => c.tool === "crs_identity_check")).toHaveLength(8);
    expect(cases.filter((c) => c.tool === "crs_credit_report")).toHaveLength(7);
    expect(cases.filter((c) => c.tool === "crs_fraud_finder")).toHaveLength(10);
    expect(cases.filter((c) => c.tool === "crs_reverse_phone")).toHaveLength(4);
  });

  test("each validates against the shared envelope and its own payload, costs what TOOL_SPECS says, and cites a source", async () => {
    for (const c of cases) {
      const ledger = new Ledger();
      const r = await c.run(ledger);
      const label = `${c.tool} ${c.who}`;
      expect([label, ToolResultSchema.safeParse(r).success]).toEqual([label, true]);
      expect([label, toolResultSchema(payload[c.tool]).safeParse(r).success]).toEqual([label, true]);
      expect([label, r.ok]).toEqual([label, true]);
      expect([label, r.cost]).toEqual([label, { ...TOOL_SPECS[c.tool as ToolName] }]);
      expect([label, r.sources.length > 0, r.sources.every((s) => s.kind === "crs")]).toEqual([label, true, true]);
      expect([label, r.simulated]).toEqual([label, false]);
      expect([label, ledger.spent]).toEqual([label, TOOL_SPECS[c.tool as ToolName].acorns]);
    }
  });
});

describe("refusals are well formed, free and carry no sources", () => {
  const shape = (r: ToolResult<unknown>, tool: ToolName) => {
    expect(ToolResultSchema.safeParse(r).success).toBe(true);
    expect(r).toMatchObject({ ok: false, result: null, sources: [], simulated: false });
    expect(r.cost.acorns).toBe(0);
    expect(r.cost.unit).toBe(TOOL_SPECS[tool].unit);
    expect(typeof r.error).toBe("string");
    expect(r.error!.length).toBeGreaterThan(0);
  };

  test("a background loan, for each loan-based tool", async () => {
    shape(await crsIdentityCheck(background, new Ledger(), client()), "crs_identity_check");
    shape(await crsCreditReport(background, new Ledger(), client()), "crs_credit_report");
    shape(await crsFraudFinder(background, new Ledger(), client()), "crs_fraud_finder");
  });
  test("a phone no persona owns", async () => {
    shape(await crsReversePhone("2085551234", new Ledger(), client()), "crs_reverse_phone");
  });
  test("an exhausted budget, for each tool", async () => {
    const empty = () => new Ledger(0);
    shape(await crsIdentityCheck(loanOf("P13"), empty(), client()), "crs_identity_check");
    shape(await crsCreditReport(loanOf("P13"), empty(), client()), "crs_credit_report");
    shape(await crsFraudFinder(loanOf("P13"), empty(), client()), "crs_fraud_finder");
    shape(await crsReversePhone(persona("P13").phone, empty(), client()), "crs_reverse_phone");
  });
  test("a halted loan, for each loan-based tool", async () => {
    const ledger = new Ledger();
    ledger.halt("L-P14", "test");
    shape(await crsIdentityCheck(loanOf("P14"), ledger, client()), "crs_identity_check");
    shape(await crsCreditReport(loanOf("P14"), ledger, client()), "crs_credit_report");
    shape(await crsFraudFinder(loanOf("P14"), ledger, client()), "crs_fraud_finder");
  });
  test("a refusal fails the typed schema, so a payload can never be mistaken for a result", async () => {
    const r = await crsIdentityCheck(background, new Ledger(), client());
    expect(toolResultSchema(payload.crs_identity_check).safeParse(r).success).toBe(false);
  });
});
