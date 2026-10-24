import type { SourceRef } from "@/lib/events";

function describe(s: SourceRef): { label: string; detail: string } {
  switch (s.kind) {
    case "crs":
      return { label: `CRS${s.product ? ` · ${s.product}` : ""}`, detail: `RequestID ${s.request_id}` };
    case "row":
      return { label: "Data room row", detail: `${s.loan_id} · ${s.field}` };
    case "tool":
      return { label: "Tool result", detail: `event seq ${s.seq}` };
    case "rule":
      return { label: "Saved rule", detail: s.rule_id };
    case "doc":
      return { label: "Document", detail: s.doc_id };
  }
}

export function SourceList({ sources }: { sources: SourceRef[] }) {
  if (sources.length === 0) return <p className="text-sm text-walnut/80">No sources recorded on this row.</p>;
  return (
    <ul className="space-y-1.5">
      {sources.map((s, i) => {
        const d = describe(s);
        return (
          <li key={i} className="rounded border border-walnut/10 bg-cream/60 px-2.5 py-1.5 text-sm">
            <span className="block text-xs font-medium uppercase tracking-[0.08em] text-walnut/80">{d.label}</span>
            <span className="font-mono text-[13px]">{d.detail}</span>
          </li>
        );
      })}
    </ul>
  );
}

// CRS RequestIDs are listed only when a crs source exists; the board never fills one in.
export function crsRequestIds(sources: SourceRef[]) {
  return sources.flatMap((s) => (s.kind === "crs" ? [s.request_id] : []));
}
