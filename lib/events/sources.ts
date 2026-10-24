// How a source reference reads on screen. Only `crs` refs carry a RequestID; nothing here invents one.
import type { SourceRef } from "./types";

export function describeSource(s: SourceRef): { label: string; detail: string } {
  switch (s.kind) {
    case "crs":
      return { label: `CRS · ${s.product}`, detail: `RequestID ${s.request_id}` };
    case "row":
      return { label: "Data room row", detail: `${s.loan_id} · ${s.field}` };
    case "document":
      return { label: "Document", detail: s.detail ? `${s.doc_id} · ${s.detail}` : s.doc_id };
    case "lookup":
      return { label: `Lookup · ${s.name}${s.simulated ? " (simulated)" : ""}`, detail: s.key };
    case "rule":
      return { label: "Saved rule", detail: `${s.rule_id} v${s.version}` };
    case "human":
      return { label: "Human answer", detail: `${s.question_id} · ${s.answered_by}` };
    case "event":
      return { label: "Earlier event", detail: `seq ${s.seq} (${s.run_id})` };
  }
}

export const crsRequestIds = (sources: SourceRef[]) =>
  sources.flatMap((s) => (s.kind === "crs" ? [s.request_id] : []));
