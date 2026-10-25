"use client";

import { summarizeCase, type BoardState } from "@/lib/events";

// The active case in five short lines, so a first-time visitor can tell who is being looked at, what was found,
// why it matters, what the evidence said and what comes next. Read from the board's rows; the original ids and
// weights are in the "Technical details" pop-over.
export function CaseSummary({ board, leadId, showSample }: { board: BoardState; leadId: string | null; showSample: boolean }) {
  const sum = summarizeCase(board, leadId);
  if (!sum) return null;
  const rows: [string, string][] = [
    ["Looking at", sum.who],
    ["Found", sum.found],
    ["Why it matters", sum.why],
    ["Evidence", sum.evidence],
    ["Next", sum.next],
  ];
  return (
    <section
      aria-label="Active case summary"
      className="absolute left-[var(--wall)] top-1 z-30 hidden w-[min(24rem,calc(50vw-var(--wall)-clamp(100px,18vh,190px)*1.27-8px))] rounded-sm border border-walnut/20 bg-paper/90 px-2.5 py-1.5 text-[12px] leading-[16px] text-walnut shadow-[0_3px_8px_rgb(0_0_0/0.25)] min-[1200px]:block"
    >
      <dl className="grid grid-cols-[5.6rem_1fr] gap-x-2">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="font-semibold text-walnut/80">{k}</dt>
            <dd className="line-clamp-2" title={v}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
      {sum.sample && showSample && <p className="mt-0.5 font-medium text-terracotta">Sample data: made up for demonstration.</p>}
      <details className="absolute right-1.5 top-1">
        <summary className="cursor-pointer list-none rounded-sm bg-walnut/5 px-1.5 text-[11px] leading-4 text-walnut/80 hover:bg-walnut/10">
          Details
        </summary>
        <div className="absolute right-0 top-5 z-10 w-[20rem] rounded-sm border border-walnut/20 bg-paper px-3 py-2 shadow-[0_8px_18px_rgb(0_0_0/0.35)]">
          <p className="mb-1 font-semibold">Technical details</p>
          <dl className="grid grid-cols-[6rem_1fr] gap-x-2 gap-y-0.5">
            {sum.details.map(([k, v], i) => (
              <div key={`${k}-${i}`} className="contents">
                <dt className="text-walnut/80">{k}</dt>
                <dd className="break-words">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      </details>
    </section>
  );
}
