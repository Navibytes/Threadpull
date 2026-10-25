// Sample situations for the board and the dashboard: hand-written, synthetic, every row `simulated`, loan ids
// PV-xx (outside the portfolio). They show how a connection looks before and after a cited check explains it.
// Nothing here came from Hazel or CRS; each note says it is a sample.
import type { RunEvent } from "./types";
import { PREVIEW_EVENTS, PREVIEW_RUN_ID } from "./preview-run";

export type Scenario = { id: string; label: string; summary: string; events: RunEvent[] };

const budget = { spent: 0, limit: 60 }; // nothing is spent in a sample; the limit is the SKELETON §7 default

function rows(run: string, list: Omit<RunEvent, "run_id" | "budget" | "simulated" | "ts">[]): RunEvent[] {
  return list.map((e, i) => ({
    ...e,
    run_id: run,
    ts: `2026-10-24T12:00:${String(i).padStart(2, "0")}Z`,
    budget,
    simulated: true,
  }));
}

const explainedRun = "preview-explained";
const ringRun = "preview-ring";

const EXPLAINED = rows(explainedRun, [
  { seq: 1, type: "run_started", loan_ids: [], tool: null, result: { mode: "sample" }, sources: [], note: "Sample situation: a shared address that a cited check explains." },
  { seq: 2, type: "lead_opened", loan_ids: ["PV-03"], tool: "inspect_loan", result: { loan_id: "PV-03" }, sources: [{ kind: "row", loan_id: "PV-03", field: "applicant_info" }], note: "Application pinned to show an index card." },
  {
    seq: 3,
    type: "link_found",
    loan_ids: ["PV-03", "PV-04"],
    tool: "find_connections",
    result: { edge_id: "e-addr-sample", kind: "address", weight: 0.2 },
    sources: [
      { kind: "row", loan_id: "PV-03", field: "residence.address" },
      { kind: "row", loan_id: "PV-04", field: "residence.address" },
    ],
    note: "Both sample applications list the same street address.",
  },
  {
    seq: 4,
    type: "check_run",
    loan_ids: ["PV-03", "PV-04"],
    tool: "check_address",
    result: { address_type: "multi-unit residential building (sample)" },
    sources: [{ kind: "lookup", name: "address type", key: "sample-address", simulated: true }],
    note: "Sample check: the address is a multi-unit apartment building.",
  },
  {
    seq: 5,
    type: "clue_explained",
    loan_ids: ["PV-03", "PV-04"],
    tool: "check_address",
    result: { edge_ids: ["e-addr-sample"], explained_by: "check_address", reason: "a multi-unit apartment building, so many unrelated applications share the address" },
    sources: [{ kind: "event", run_id: explainedRun, seq: 4 }],
    note: "Sample: the shared address is explained by the cited check.",
  },
  { seq: 6, type: "status_changed", loan_ids: ["PV-03"], tool: null, result: { status: "No material anomaly found", reason: "the shared address is explained" }, sources: [{ kind: "event", run_id: explainedRun, seq: 5 }], note: "Sample status." },
  { seq: 7, type: "run_finished", loan_ids: [], tool: null, result: {}, sources: [], note: "Sample run finished." },
]);

const RING = rows(ringRun, [
  { seq: 1, type: "run_started", loan_ids: [], tool: null, result: { mode: "sample" }, sources: [], note: "Sample situation: three applications that share one phone number." },
  { seq: 2, type: "lead_opened", loan_ids: ["PV-06"], tool: "inspect_loan", result: { loan_id: "PV-06" }, sources: [{ kind: "row", loan_id: "PV-06", field: "applicant_info" }], note: "Application pinned to show an index card." },
  {
    seq: 3,
    type: "link_found",
    loan_ids: ["PV-06", "PV-07"],
    tool: "find_connections",
    result: { edge_id: "e-ring-a", kind: "phone", weight: 0.4 },
    sources: [
      { kind: "row", loan_id: "PV-06", field: "applicant_info.phone" },
      { kind: "row", loan_id: "PV-07", field: "applicant_info.phone" },
    ],
    note: "Both sample applications list the same phone number.",
  },
  {
    seq: 4,
    type: "link_found",
    loan_ids: ["PV-06", "PV-08"],
    tool: "find_connections",
    result: { edge_id: "e-ring-b", kind: "phone", weight: 0.4 },
    sources: [
      { kind: "row", loan_id: "PV-06", field: "applicant_info.phone" },
      { kind: "row", loan_id: "PV-08", field: "applicant_info.phone" },
    ],
    note: "The same phone number appears on a third sample application.",
  },
  { seq: 5, type: "status_changed", loan_ids: ["PV-06"], tool: null, result: { status: "Investigate", reason: "two connections on one phone number, none explained yet" }, sources: [{ kind: "event", run_id: ringRun, seq: 4 }], note: "Sample status." },
  { seq: 6, type: "run_finished", loan_ids: [], tool: null, result: {}, sources: [], note: "Sample run finished." },
]);

export const SCENARIOS: Scenario[] = [
  { id: "phone", label: "Shared phone", summary: "Two applications share a phone number. Nothing has checked it yet.", events: PREVIEW_EVENTS },
  { id: "explained", label: "Explained address", summary: "A shared address, explained by a cited check of the building type.", events: EXPLAINED },
  { id: "ring", label: "Three on one phone", summary: "Three applications share a phone number. Nothing is explained yet.", events: RING },
];

export const DEFAULT_SCENARIO = "phone";

export function scenarioById(id: string | undefined): Scenario {
  return SCENARIOS.find((s) => s.id === id) ?? SCENARIOS[0];
}

export function scenarioRunId(s: Scenario): string {
  return s.events[0]?.run_id ?? PREVIEW_RUN_ID;
}
