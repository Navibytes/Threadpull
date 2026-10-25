// Board state is a pure function of the run's event rows (CLAUDE.md hard rule 2).
import { describe, expect, test } from "bun:test";
import {
  applyEvent,
  crsRequestIds,
  describeSource,
  emptyBoard,
  EventSchema,
  PREVIEW_EVENTS,
  previewFeed,
  reduceEvents,
  threadWidth,
  type RunEvent,
} from "@/lib/events";

describe("preview fixture", () => {
  test("every row validates against the event contract", () => {
    for (const e of PREVIEW_EVENTS) expect(EventSchema.safeParse(e).success).toBe(true);
  });

  test("is labeled simulated and never cites CRS", () => {
    for (const e of PREVIEW_EVENTS) {
      expect(e.simulated).toBe(true);
      expect(crsRequestIds(e.sources)).toEqual([]);
    }
  });

  test("uses ids outside the portfolio range", () => {
    for (const e of PREVIEW_EVENTS) for (const id of e.loan_ids) expect(id).not.toMatch(/^L\d{4}$/);
  });

  test("feed delivers every row in seq order", () => {
    let got: RunEvent[] = [];
    previewFeed([...PREVIEW_EVENTS].reverse()).subscribe((rows) => (got = rows));
    expect(got.map((e) => e.seq)).toEqual([1, 2, 3]);
  });
});

describe("board state", () => {
  const board = reduceEvents(PREVIEW_EVENTS);

  test("pins one card per loan and one thread per link_found", () => {
    expect(board.cards.map((c) => c.id)).toEqual(["PV-01", "PV-02"]);
    expect(board.threads).toHaveLength(1);
    expect(board.threads[0]).toMatchObject({ id: "e-phone-preview", kind: "phone", a: "PV-01", b: "PV-02", weight: 0.33 });
    expect(board.cards.every((c) => c.status === "Not reviewed")).toBe(true);
  });

  test("records the seq behind every card and thread", () => {
    expect(board.cards.map((c) => c.firstSeq)).toEqual([2, 3]);
    expect(board.threads[0].firstSeq).toBe(3);
    expect(board.lastSeq).toBe(3);
  });

  test("ignores rows already applied and is order-independent", () => {
    expect(PREVIEW_EVENTS.reduce(applyEvent, board)).toBe(board);
    expect(reduceEvents([...PREVIEW_EVENTS].reverse())).toEqual(board);
  });

  test("ignores rows from another run", () => {
    const other = { ...PREVIEW_EVENTS[2], run_id: "other", seq: 9 };
    expect(applyEvent(board, other)).toBe(board);
  });

  test("carries simulated vs live from each row", () => {
    const live = reduceEvents(PREVIEW_EVENTS.map((e) => ({ ...e, simulated: false })));
    expect(live.cards.every((c) => !c.simulated) && live.threads.every((t) => !t.simulated)).toBe(true);
    expect(board.cards.every((c) => c.simulated) && board.threads.every((t) => t.simulated)).toBe(true);
  });

  test("starts empty", () => {
    expect(reduceEvents([])).toEqual(emptyBoard);
  });

  test("yarn thickness is 1 + 8 × weight, clamped", () => {
    expect(threadWidth(0)).toBe(1);
    expect(threadWidth(0.5)).toBe(5);
    expect(threadWidth(2)).toBe(9);
  });
});

describe("event contract", () => {
  const row = PREVIEW_EVENTS[2];

  test("rejects an unknown type, a missing budget and a non-positive seq", () => {
    expect(EventSchema.safeParse({ ...row, type: "string_cut" }).success).toBe(false);
    expect(EventSchema.safeParse({ ...row, budget: undefined }).success).toBe(false);
    expect(EventSchema.safeParse({ ...row, seq: 0 }).success).toBe(false);
  });

  test("accepts a Postgres timestamptz and a null tool", () => {
    expect(EventSchema.safeParse({ ...row, ts: "2026-10-24T12:00:02+00:00", tool: null }).success).toBe(true);
  });
});

describe("sources", () => {
  test("label every SourceRef kind and only CRS refs carry a RequestID", () => {
    expect(describeSource({ kind: "crs", product: "tu_identity_verification", request_id: "abc-123" })).toEqual({
      label: "CRS · tu_identity_verification",
      detail: "RequestID abc-123",
    });
    expect(describeSource({ kind: "row", loan_id: "L0412", field: "applicant_info.phone" }).detail).toBe(
      "L0412 · applicant_info.phone",
    );
    expect(describeSource({ kind: "lookup", name: "address_type", key: "12 Elm St", simulated: true }).label).toBe(
      "Lookup · address_type (simulated)",
    );
    expect(describeSource({ kind: "rule", rule_id: "R-001", version: 1 }).detail).toBe("R-001 v1");
    expect(describeSource({ kind: "event", run_id: "r1", seq: 7 }).detail).toBe("seq 7 (r1)");
    expect(
      crsRequestIds([
        { kind: "row", loan_id: "L1", field: "x" },
        { kind: "crs", product: "fraud_finder", request_id: "r1" },
      ]),
    ).toEqual(["r1"]);
  });

  test("an event row accepts tool-result sources and rejects unknown kinds", () => {
    const base = PREVIEW_EVENTS[2];
    const doc = { kind: "document", doc_id: "D-1", detail: "template" };
    expect(EventSchema.safeParse({ ...base, sources: [doc] }).success).toBe(true);
    expect(EventSchema.safeParse({ ...base, sources: [{ kind: "vibes" }] }).success).toBe(false);
  });
});

describe("clue_explained", () => {
  const link = { ...PREVIEW_EVENTS[2], run_id: "r-x" };
  const checkRow = { kind: "event" as const, run_id: "r-x", seq: 4 };
  const explain = (result: Record<string, unknown>, sources: RunEvent["sources"] = [checkRow]): RunEvent => ({
    ...link,
    seq: 5,
    type: "clue_explained",
    tool: null,
    result,
    sources,
  });
  const base = [{ ...PREVIEW_EVENTS[1], run_id: "r-x" }, link];

  test("the agreed payload marks the thread explained and keeps it, with its reason and sources", () => {
    const b = reduceEvents([
      ...base,
      explain({ edge_ids: ["e-phone-preview"], explained_by: "check_household", reason: "same phone and home; same last name" }),
    ]);
    expect(b.threads).toHaveLength(1);
    expect(b.threads[0].explained).toMatchObject({ seq: 5, explainedBy: "check_household", ruleId: null, sources: [checkRow] });
    expect(b.cards).toHaveLength(2);
  });

  test("changes nothing without the agreed payload or without a cited check or rule", () => {
    const noPayload = reduceEvents([...base, explain({ edge_id: "e-phone-preview" })]);
    expect(noPayload.threads[0].explained).toBeNull();
    const noCite = reduceEvents([
      ...base,
      explain({ edge_ids: ["e-phone-preview"], explained_by: "check_address", reason: "x" }, [
        { kind: "row", loan_id: "PV-01", field: "residential_info.street_address" },
      ]),
    ]);
    expect(noCite.threads[0].explained).toBeNull();
  });

  test("a rule explanation keeps the rule id; an unknown edge id changes nothing", () => {
    const rule = { kind: "rule" as const, rule_id: "R-001", version: 1 };
    const b = reduceEvents([
      ...base,
      explain({ edge_ids: ["e-phone-preview", "e-missing"], explained_by: "rule", rule_id: "R-001", reason: "Large employer" }, [rule]),
    ]);
    expect(b.threads[0].explained?.ruleId).toBe("R-001");
    expect(b.threads.map((t) => t.id)).toEqual(["e-phone-preview"]);
  });
});
