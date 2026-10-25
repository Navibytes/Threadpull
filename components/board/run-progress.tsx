"use client";
// The run's progress, pinned to the top of the cork while a recorded or live run is on the board. Read only from the
// run's rows (lib/events runProgress): the phase, the budget (the one real cap), the counts, and the time. No estimate is
// promised: Hazel picks her own path, so the strip says what ends the run instead of a countdown.
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { clock, PHASES, runProgress, type RunEvent } from "@/lib/events";

const nf = (n: number) => n.toLocaleString("en-US");
const plural = (n: number, one: string, many = `${one}s`) => `${nf(n)} ${n === 1 ? one : many}`;

export function RunProgressStrip({ events, runId }: { events: readonly RunEvent[]; runId: string }) {
  const p = useMemo(() => runProgress(events), [events]);
  const lastTs = events.length ? Date.parse(events[events.length - 1].ts) : null;
  const [now, setNow] = useState(() => Date.now());
  // open while the run is going, folded to one line once it is done (so it covers no cards); the viewer can flip it
  const [open, setOpen] = useState<boolean | null>(null);
  useEffect(() => {
    if (p.phase === "done" || p.startedAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [p.phase, p.startedAt]);
  if (p.startedAt === null) return null;

  const done = p.phase === "done";
  const elapsed = (done ? p.finishedAt! : now) - p.startedAt;
  const quiet = !done && lastTs !== null ? now - lastTs : 0; // time since the last row arrived
  const share = p.limit ? Math.min(1, p.spent / p.limit) : 0;
  const current = PHASES.findIndex((x) => x.id === p.phase);
  const expanded = open ?? !done;
  const toggle = (
    <button type="button" onClick={() => setOpen(!expanded)} aria-expanded={expanded}
      className="rounded-sm border border-walnut/25 px-1.5 py-0.5 text-[11px] font-semibold text-walnut/80 hover:bg-walnut/5 focus-visible:outline-2 focus-visible:outline-terracotta">
      {expanded ? "Hide" : "Details"}
    </button>
  );

  if (!expanded) return (
    <div role="status" aria-live="polite" aria-label="Run progress"
      className="pointer-events-auto absolute left-3 top-3 z-20 flex max-w-[calc(100%-1.5rem)] items-center gap-2 rounded-[3px] border border-walnut/20 bg-paper/95 px-3 py-1.5 text-[12px] text-walnut shadow-[0_4px_10px_rgb(0_0_0/0.3)]">
      <span aria-hidden className={`inline-block h-2 w-2 shrink-0 rounded-full bg-terracotta ${done ? "" : "animate-pulse"}`} />
      <span className="whitespace-nowrap font-semibold">{done ? "Done" : PHASES[Math.max(0, current)].label}</span>
      <span aria-hidden className="text-walnut/40">·</span>
      <span className="whitespace-nowrap tabular-nums">{p.spent} of {p.limit ?? "?"} acorns</span>
      <span aria-hidden className="text-walnut/40">·</span>
      <span className="whitespace-nowrap tabular-nums">{clock(elapsed)}</span>
      {done && <><span aria-hidden className="text-walnut/40">·</span>
        <Link href={`/cro?run=${encodeURIComponent(runId)}`} className="whitespace-nowrap font-semibold text-terracotta underline underline-offset-2">CRO screen →</Link></>}
      {toggle}
    </div>
  );

  return (
    <div role="status" aria-live="polite" aria-label="Run progress"
      className="pointer-events-auto absolute left-3 top-3 z-20 w-[min(44rem,calc(100%-1.5rem))] rounded-[3px] border border-walnut/20 bg-paper/95 px-4 py-2.5 text-[12.5px] text-walnut shadow-[0_6px_14px_rgb(0_0_0/0.35)]">
      <div className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1.5">
        <ol className="flex items-center gap-1.5" aria-label="Phase">
          {PHASES.map((x, i) => {
            const reached = current >= i, here = current === i;
            return (
              <li key={x.id} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden className={`h-px w-4 ${reached ? "bg-terracotta" : "bg-walnut/25"}`} />}
                <span className={`flex items-center gap-1 whitespace-nowrap ${here ? "font-semibold" : reached ? "" : "text-walnut/50"}`}
                  aria-current={here ? "step" : undefined}>
                  <span aria-hidden className={`inline-block h-2 w-2 rounded-full ${reached ? "bg-terracotta" : "border border-walnut/35"} ${here && !done ? "animate-pulse" : ""}`} />
                  {x.label}
                </span>
              </li>
            );
          })}
        </ol>
        <div className="flex min-w-[13rem] flex-1 items-center gap-2" title="The budget is the run's cap: it ends when the acorns are spent or no lead is left">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-walnut/15" role="img" aria-label={`${p.spent} of ${p.limit ?? "?"} acorns spent`}>
            <div className="h-full rounded-full bg-terracotta transition-[width] duration-500" style={{ width: `${Math.max(share * 100, p.spent ? 2 : 0)}%` }} />
          </div>
          <span className="whitespace-nowrap tabular-nums"><b>{p.spent}</b> of {p.limit ?? "?"} acorns</span>
          {toggle}
        </div>
      </div>
      <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 text-walnut/80">
        {p.loans !== null && <span>{nf(p.loans)} loans scanned</span>}
        <span aria-hidden>·</span><span>{plural(p.cases, "case")} opened</span>
        {p.spotChecks > 0 && <><span aria-hidden>·</span><span>{plural(p.spotChecks, "spot check")}</span></>}
        <span aria-hidden>·</span><span>{nf(p.decided)} decided ({nf(p.flagged)} Investigate)</span>
        {p.questionsWaiting > 0 && <><span aria-hidden>·</span><span className="font-semibold text-terracotta">{plural(p.questionsWaiting, "question")} waiting</span></>}
        <span aria-hidden>·</span><span className="tabular-nums">{clock(elapsed)} {done ? "in all" : "elapsed"}</span>
      </p>
      <p className="mt-1 text-[11.5px] text-walnut/70">
        {done
          ? <>Finished{p.stopReason === "error" ? " on an error" : ""}. <Link href={`/cro?run=${encodeURIComponent(runId)}`} className="font-semibold text-terracotta underline underline-offset-2">Open the CRO screen →</Link></>
          : quiet > 20_000
            ? `Waiting for the next step (${clock(quiet)} since the last one; the model or CRS may be slow).`
            : "Usually a minute or two. The run ends when the budget is spent or no lead is left."}
      </p>
    </div>
  );
}
