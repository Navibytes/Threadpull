// How a source reference reads on screen. Only `crs` refs carry a RequestID; nothing here invents one.
import { CrsSourceSchema, RowSourceSchema } from "@/lib/contracts/event";
import type { SourceRef } from "./types";

export function describeSource(s: SourceRef): { label: string; detail: string } {
  const crs = CrsSourceSchema.safeParse(s);
  if (crs.success) return { label: "CRS", detail: `RequestID ${crs.data.request_id}` };
  const row = RowSourceSchema.safeParse(s);
  if (row.success) return { label: "Data room row", detail: `${row.data.loan_id} · ${row.data.field}` };
  // A kind the contract doesn't name yet: show it as recorded.
  const { kind, ...rest } = s;
  return { label: kind, detail: JSON.stringify(rest) };
}

export const crsRequestIds = (sources: SourceRef[]) =>
  sources.flatMap((s) => {
    const crs = CrsSourceSchema.safeParse(s);
    return crs.success ? [crs.data.request_id] : [];
  });
