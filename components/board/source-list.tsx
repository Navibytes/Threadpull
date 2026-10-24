import { describeSource, type SourceRef } from "@/lib/events";

export function SourceList({ sources }: { sources: SourceRef[] }) {
  if (sources.length === 0) return <p className="text-sm text-walnut/80">No sources recorded on this row.</p>;
  return (
    <ul className="space-y-1.5">
      {sources.map((s, i) => {
        const d = describeSource(s);
        return (
          <li key={i} className="rounded border border-walnut/10 bg-cream/60 px-2.5 py-1.5 text-sm">
            <span className="block text-xs font-medium uppercase tracking-[0.08em] text-walnut/80">{d.label}</span>
            <span className="break-all font-mono text-[13px]">{d.detail}</span>
          </li>
        );
      })}
    </ul>
  );
}
