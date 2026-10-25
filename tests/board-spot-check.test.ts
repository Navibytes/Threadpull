// Loans the verification sweep checked are spot checks, not suspects: the board marks them so (tab, card line, case
// summary, panel), from the lead_opened row's result.sweep flag. A lead Hazel opened reads as before.
import { describe, expect, test } from "bun:test";
import type { Event } from "@/lib/contracts/event";
import { cardFinding, reduceEvents, SPOT_CHECK_FINDING, summarizeCase } from "@/lib/events";

const row = (seq: number, type: Event["type"], extra: Partial<Event> = {}): Event => ({
  run_id: "r", seq, ts: new Date(Date.UTC(2026, 9, 25, 4, 0, seq)).toISOString(), type, loan_ids: [], tool: null, result: {},
  sources: [], note: "", budget: { spent: 0, limit: 60 }, simulated: false, ...extra,
});
const events = [
  row(1, "run_started"),
  row(2, "lead_opened", { loan_ids: ["L0037"], result: { score: 3.4 }, note: "Top lead by rank (score 3.4)." }),
  row(3, "lead_opened", { loan_ids: ["L0194"], result: { score: 0.06, sweep: true }, note: "Verification sweep: no lead left and 26 acorns to spend; the largest unverified balance ($34,183)." }),
  row(4, "check_run", { loan_ids: ["L0194"], tool: "crs_identity_check", result: { ok: true } }),
  row(5, "check_run", { loan_ids: ["L0194"], tool: "crs_credit_report", result: { ok: true } }),
  row(6, "status_changed", { loan_ids: ["L0194"], tool: "close_lead", result: { status: "No material anomaly found", reason: "identity verified; no strong unexplained link" } }),
];

describe("spot-check cards", () => {
  const board = reduceEvents(events as never);
  const card = (id: string) => board.cards.find((c) => c.id === id)!;

  test("a card pinned by the sweep is a spot check; a lead Hazel opened is not", () => {
    expect(card("L0194").spotCheck).toBe(true);
    expect(card("L0037").spotCheck).toBeUndefined();
  });

  test("the card line says spot check, not 'no connections found yet'", () => {
    expect(cardFinding("L0194", true, board.threads, true)).toEqual({ text: SPOT_CHECK_FINDING, explained: false });
    expect(cardFinding("L0037", true, board.threads)?.text).toBe("No connections found yet.");
  });

  test("the case summary calls it a spot check and not a suspicion, with its checks and status", () => {
    const s = summarizeCase(board, "L0194")!;
    expect(s.found).toBe("A spot check of one of the largest unverified balances; no connection to another loan.");
    expect(s.why).toMatch(/^Not a suspicion/);
    expect(s.evidence).toBe("2 checks run on it; status: No material anomaly found.");
  });
});
