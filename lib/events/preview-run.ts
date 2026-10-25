// PREVIEW fixture: hand-written, synthetic, never produced by Hazel or CRS. It exists so the board can be
// built before the events table is live. Every row is `simulated`, ids are outside the portfolio range
// (L0001…L1000), the phone is in the fictional 555-01xx block, and there are no CRS sources.
import type { RunEvent } from "./types";

export const PREVIEW_RUN_ID = "preview-000";

// §8 requires a budget on every row; nothing is spent in a preview. Limit = SKELETON §7 default (60 acorns).
const budget = { spent: 0, limit: 60 };

export const PREVIEW_EVENTS: RunEvent[] = [
  {
    run_id: PREVIEW_RUN_ID,
    seq: 1,
    ts: "2026-10-24T12:00:00Z",
    type: "run_started",
    loan_ids: [],
    tool: null,
    result: { mode: "preview" },
    sources: [],
    note: "Preview run: two synthetic applications, no investigation.",
    budget,
    simulated: true,
  },
  {
    run_id: PREVIEW_RUN_ID,
    seq: 2,
    ts: "2026-10-24T12:00:01Z",
    type: "lead_opened",
    loan_ids: ["PV-01"],
    tool: "inspect_loan",
    result: { loan_id: "PV-01" },
    sources: [{ kind: "row", loan_id: "PV-01", field: "applicant_info" }],
    note: "Application pinned to show an index card.",
    budget,
    simulated: true,
  },
  {
    run_id: PREVIEW_RUN_ID,
    seq: 3,
    ts: "2026-10-24T12:00:02Z",
    type: "link_found",
    loan_ids: ["PV-01", "PV-02"],
    tool: "find_connections",
    result: { edge_id: "e-phone-preview", kind: "phone", weight: 0.33 },
    sources: [
      { kind: "row", loan_id: "PV-01", field: "applicant_info.phone" },
      { kind: "row", loan_id: "PV-02", field: "applicant_info.phone" },
    ],
    note: "Both synthetic applications list the same phone number (555-0142).",
    budget,
    simulated: true,
  },
];
