// components/board/index-card-node.tsx: what a card face says and how large it renders.
import { describe, expect, test } from "bun:test";
import { cardFinding, essentialPx, FULL_ZOOM, sourcesInWords } from "@/components/board/index-card-node";
import { loanName, loanShortName, reduceEvents, sharedLabel, sharedPhrase, summarizeCase, type BoardThread, type RunEvent } from "@/lib/events";
import { cardSize, LAYOUT } from "@/components/board/layout";

describe("card face text", () => {
  test("sources in plain words, never event or tool names", () => {
    expect(sourcesInWords([{ kind: "row", loan_id: "L1", field: "applicant_info.phone" }])).toBe("1 data-room row");
    expect(sourcesInWords([])).toBe("No sources recorded");
    expect(
      sourcesInWords([
        { kind: "row", loan_id: "L1", field: "x" },
        { kind: "crs", product: "tu_identity_verification", request_id: "r1" },
      ]),
    ).toBe("2 sources: data room, CRS");
  });
});

const ev = (seq: number, type: RunEvent["type"], extra: Partial<RunEvent> = {}): RunEvent => ({
  run_id: "r",
  seq,
  ts: "2026-10-24T00:00:00.000Z",
  type,
  loan_ids: [],
  tool: null,
  result: {},
  sources: [],
  note: "",
  budget: { spent: 0, limit: 60 },
  simulated: true,
  ...extra,
});

const thread = (a: string, b: string, kind: string, weight: number, explained = false): BoardThread => ({
  id: `${kind}-${a}-${b}`, kind, a, b, weight, firstSeq: 1, lastSeq: 1, tool: null, ts: "", note: null, sources: [], simulated: true,
  explained: explained
    ? { seq: 2, ts: "", explainedBy: "check_address", ruleId: null, reason: "apartment building", sources: [], simulated: true }
    : null,
});

describe("why a card is on the board", () => {
  const threads = [thread("L1", "L2", "phone", 0.33), thread("L1", "L3", "doc_fingerprint", 0.9), thread("L3", "L4", "address", 0.2, true)];

  test("a lead says in plain words what it shares and with how many loans", () => {
    expect(cardFinding("L1", true, threads)?.text).toBe("This application shares a pay-stub template and a phone number with 2 other loans.");
    expect(cardFinding("L9", true, threads)?.text).toBe("No connections found yet.");
    expect(cardFinding("L1", true, [thread("L1", "L2", "phone", 0.33)])?.text).toBe(
      "This application shares a phone number with another loan.",
    );
  });

  test("a linked card names what it shares and with which loan", () => {
    expect(cardFinding("L2", false, threads)).toEqual({ text: "Shares a phone number with Loan L1.", explained: false });
    expect(cardFinding("L3", false, threads)?.text).toBe("Shares a pay-stub template with Loan L1 and 1 more loan.");
    expect(cardFinding("L3", true, threads)?.text).toBe(
      "This application shares a pay-stub template and an address with 2 other loans. 1 of 2 matches already explained.",
    );
  });

  test("an explained link keeps its fact and says it has an explanation", () => {
    expect(cardFinding("L4", false, threads)).toEqual({ text: "Shared an address with Loan L3, now explained.", explained: true });
    expect(cardFinding("L4", true, [thread("L4", "L3", "address", 0.2, true)])?.text).toBe(
      "This application shares an address with another loan. It has an innocent explanation.",
    );
  });

  test("a card on no thread says nothing rather than inventing a reason", () => {
    expect(cardFinding("L9", false, threads)).toBeNull();
  });

  test("no card text calls a connection fraud or proof", () => {
    for (const t of [cardFinding("L1", true, threads), cardFinding("L2", false, threads), cardFinding("L4", false, threads)])
      expect(t?.text).not.toMatch(/fraud|proof|guilty|fake/i);
  });
});

describe("plain names and labels", () => {
  test("sample loans are named as samples; other ids keep their own text", () => {
    expect(loanName("PV-01")).toBe("Sample Loan 01");
    expect(loanShortName("PV-01")).toBe("Loan 01");
    expect(loanName("L0037")).toBe("Loan L0037");
    expect(loanShortName("L0037")).toBe("L0037");
  });

  test("a thread is labelled by what it shares, never by its score", () => {
    expect(sharedLabel("phone")).toBe("Shared phone number");
    expect(sharedLabel("doc_fingerprint")).toBe("Same pay-stub template");
    expect(sharedLabel("something_new")).toBe("Shared something new");
    expect(sharedPhrase("something_new")).toBe("a matching something new");
    for (const k of ["phone", "email", "address", "device", "employer", "dealer"]) expect(sharedLabel(k)).not.toMatch(/\d/);
  });
});

describe("the active case summary", () => {
  const rows = [
    ev(1, "lead_opened", { loan_ids: ["PV-01"], note: "open" }),
    ev(2, "link_found", { loan_ids: ["PV-01", "PV-02"], result: { edge_id: "e1", kind: "phone", weight: 0.33 } }),
  ];
  const board = reduceEvents(rows);

  test("answers who, what, why, evidence and next from the recorded rows", () => {
    const sum = summarizeCase(board, "PV-01")!;
    expect(sum.who).toBe("Sample Loan 01");
    expect(sum.found).toBe("Shares a phone number with Sample Loan 02.");
    expect(sum.why).toBe("A shared detail is a lead, not proof.");
    expect(sum.evidence).toBe("No check has been run on this match yet.");
    expect(sum.next).toBe("Click the red thread to see its records.");
    expect(sum.details).toContainEqual(["Original ID", "PV-01"]);
    expect(sum.details).toContainEqual(["Shared phone number", "PV-01 and PV-02, weight 0.33"]);
  });

  test("says nothing it doesn't know, and nothing without an active case", () => {
    expect(summarizeCase(board, null)).toBeNull();
    expect(summarizeCase(board, "PV-99")).toBeNull();
    expect(summarizeCase(reduceEvents([rows[0]]), "PV-01")!.found).toBe("No connections found yet.");
    expect(summarizeCase(reduceEvents([rows[0]]), "PV-01")!.evidence).toBe("Nothing to check yet.");
  });

  test("reports an explanation with its own reason, and counts checks that ran", () => {
    const withCheck = reduceEvents([...rows, ev(3, "check_run", { loan_ids: ["PV-01"], tool: "check_address" })]);
    expect(summarizeCase(withCheck, "PV-01")!.evidence).toBe("1 check run so far; none has explained the match yet.");
    const explained = reduceEvents([
      ...rows,
      ev(3, "clue_explained", {
        loan_ids: ["PV-01", "PV-02"],
        result: { edge_ids: ["e1"], explained_by: "check_address", reason: "a 212-unit apartment building" },
        sources: [{ kind: "event", run_id: "r", seq: 3 }],
      }),
    ]);
    expect(summarizeCase(explained, "PV-01")!.evidence).toBe("Checked: a 212-unit apartment building. An innocent explanation.");
  });

  test("flags sample data so it is never shown as a real result", () => {
    expect(summarizeCase(board, "PV-01")!.sample).toBe(true);
    const real = reduceEvents(rows.map((r) => ({ ...r, simulated: false })));
    expect(summarizeCase(real, "PV-01")!.sample).toBe(false);
  });
});

describe("rendered size", () => {
  test("at or above FULL_ZOOM the full face's 13px labels render at 12px or more", () => {
    expect(13 * FULL_ZOOM).toBeGreaterThanOrEqual(12);
  });

  test("below it, essential labels are sized from the zoom to render at about 12px, down to 0.45", () => {
    for (let z = 0.45; z < FULL_ZOOM; z += 0.01) expect(essentialPx(z) * z).toBeGreaterThanOrEqual(12);
  });

  test("the focused face (ID plus a row of stamps) still fits inside each card at the smallest zoom", () => {
    const z = 0.45;
    const stampRow = essentialPx(z) * 1.6;
    expect(16 + 52 + 12 + stampRow + 16).toBeLessThanOrEqual(LAYOUT.lead.h); // folder: padding, ID, gap, stamps, padding
    expect(20 + 40 + 12 + stampRow + 12).toBeLessThanOrEqual(LAYOUT.linked.h); // index card
  });

  test("a lead folder is clearly larger than a linked index card", () => {
    const lead = cardSize("PROOF-01", true), linked = cardSize("PROOF-02", false);
    expect(lead.w - linked.w).toBeGreaterThanOrEqual(50);
    expect(lead.h).toBeGreaterThan(linked.h);
  });
});
