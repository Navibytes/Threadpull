// Ticket 03: the ledger's spends and the client's 429 waits become valid SKELETON §8 event rows.
import { describe, expect, test } from "bun:test";
import { EventSchema } from "@/lib/contracts/event";
import { toolError, toolOk } from "@/lib/contracts/tool-result";
import { budgetSpentRow, recoveryRow } from "@/lib/event-rows";
import { Ledger, type Spend } from "@/lib/ledger";

// What the appender adds to a row.
const stamp = (row: object, seq = 1) => ({ run_id: "r13-001", seq, ts: "2026-10-24T15:04:05Z", ...row });

describe("budget_spent", () => {
  test("a ledger spend becomes a valid event row", async () => {
    const spends: Spend[] = [];
    const ledger = new Ledger(60, (s) => void spends.push(s));
    const src = [{ kind: "crs" as const, product: "tu_identity", request_id: "req-1" }];
    await ledger.run("crs_identity_check", () => toolOk("crs_identity_check", { ok: true }, src));
    const row = budgetSpentRow(spends[0], { loan_ids: ["L0037"] });
    expect(EventSchema.parse(stamp(row))).toMatchObject({
      type: "budget_spent", tool: "crs_identity_check", loan_ids: ["L0037"], sources: src, budget: { spent: 3, limit: 60 }, simulated: false,
      result: { acorns: 3, unit: "1 CRS call" },
    });
  });
  test("a simulated spend stays flagged, and one acorn reads as singular", async () => {
    const spends: Spend[] = [];
    const ledger = new Ledger(60, (s) => void spends.push(s));
    const src = [{ kind: "lookup" as const, name: "crs_identity_recorded", key: "L0037", simulated: true }];
    await ledger.run("crs_reverse_phone", () => toolOk("crs_reverse_phone", {}, src, true));
    const row = budgetSpentRow(spends[0]);
    expect(row.simulated).toBe(true);
    expect(row.note).toBe("crs_reverse_phone cost 1 acorn (1 CRS call).");
    expect(EventSchema.safeParse(stamp(row)).success).toBe(true);
  });
  test("a refused or failed call never reaches onSpend, so it gets no row", async () => {
    const spends: Spend[] = [];
    const ledger = new Ledger(2, (s) => void spends.push(s));
    await ledger.run("crs_identity_check", () => toolError("crs_identity_check", "never runs: over budget"));
    expect(spends).toHaveLength(0);
  });
});

describe("recovery", () => {
  test("a 429 wait becomes a valid event row naming the tool", () => {
    const row = recoveryRow({ endpoint: "credit_efx", status: 429, wait_ms: 7000, attempt: 1 }, { spent: 12, limit: 60 }, { loan_ids: ["L0037"] });
    expect(EventSchema.parse(stamp(row))).toMatchObject({
      type: "recovery", tool: "crs_credit_report", loan_ids: ["L0037"], budget: { spent: 12, limit: 60 }, simulated: false, sources: [],
      result: { endpoint: "credit_efx", status: 429, wait_ms: 7000, attempt: 1 },
      note: "CRS rate-limited credit_efx; waiting 7s before retry 1.",
    });
  });
  test("every CRS endpoint maps to its tool", () => {
    const tools = (["tu_identity", "credit_tu", "credit_efx", "credit_exp", "fraud_finder", "reverse_phone"] as const).map(
      (endpoint) => recoveryRow({ endpoint, status: 429, wait_ms: 5000, attempt: 1 }, { spent: 0, limit: 60 }).tool,
    );
    expect(tools).toEqual(["crs_identity_check", "crs_credit_report", "crs_credit_report", "crs_credit_report", "crs_fraud_finder", "crs_reverse_phone"]);
  });
});
