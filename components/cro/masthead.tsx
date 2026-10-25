// The masthead: what this document is, which run it is about, whether anyone has decided, and where to go next. The run
// picker lists each recorded run with how big it is, so a three-loan test run is never mistaken for the full investigation.
// Choosing a run is always the reader's act: the page opens on the run it was asked for (or the newest) and only offers another.
import Link from "next/link";
import type { DealReport } from "@/lib/deal";
import type { RunSummary } from "@/lib/deal/service";
import type { Digest } from "./findings";
import { reviewState, REVIEW_LABEL } from "./figures";
import styles from "./cro.module.css";

const DOT = { none: "bg-cream/50", awaiting: "bg-amber", partial: "bg-amber", confirmed: "bg-sage" } as const;

/** "rt-8be993-20261025T114125 · 1,000 loans · 18 investigated": what an option in the picker says. */
export function runLabel(id: string, d: Digest | undefined): string {
  if (!d) return id;
  return `${id} · ${d.loans.toLocaleString("en-US")} loans · ${d.reviewed} investigated`;
}

export function Masthead({ r, runs, digests, runId, onRun, boardHref }: {
  r: DealReport | null; runs: RunSummary[] | null; digests: Digest[]; runId: string | null; onRun: (id: string) => void; boardHref: string;
}) {
  const s = r ? reviewState(r.loans) : null;
  return (
    <header className={styles.masthead}>
      <div className="mx-auto flex max-w-[1120px] flex-wrap items-end justify-between gap-x-10 gap-y-5 px-[clamp(1.25rem,4vw,3.25rem)] pb-5 pt-5">
        <div className="min-w-0">
          <p className={`${styles.caps} text-amber`}>Threadpull · Acquisition case file</p>
          <h1 className="mt-1 font-display text-[2.25rem] font-semibold leading-none">CRO review</h1>
          {r ? (
            <p className="mt-3 max-w-[40rem] text-[14.5px] leading-snug text-cream/90">
              <span className="tabular-nums">{r.run_id}</span> · {r.totals.loans.toLocaleString("en-US")} loans · {r.run.events.toLocaleString("en-US")} audit-log events{r.run.note ? ` · ${r.run.note.replace(/\.$/, "")}` : ""}
            </p>
          ) : null}
          {s ? (
            <p className="mt-1.5 flex items-center gap-2 text-[14.5px] font-semibold text-cream">
              <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${DOT[s.state]}`} />
              {REVIEW_LABEL[s.state]}
              {s.total ? <span className="font-normal text-cream/85"> · {s.confirmed} of {s.total} proposed actions decided</span> : null}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
          <nav aria-label="Threadpull" className="flex items-center gap-5 pb-2 text-[14.5px] font-semibold">
            <Link href="/" className={styles.mastLink}>Home</Link>
            <Link href={boardHref} className={styles.mastLink}>Board</Link>
            <Link href={runId ? `/dashboard?run=${encodeURIComponent(runId)}` : "/dashboard"} className={styles.mastLink}>Dashboard</Link>
          </nav>
          <label className="text-[13px] font-semibold uppercase tracking-[0.1em] text-cream/85">Recorded run
            <select value={runId ?? ""} onChange={(e) => onRun(e.target.value)} disabled={!runs?.length} className={`${styles.mastSelect} mt-1 block w-full min-w-[17rem] text-[14.5px] font-normal normal-case tracking-normal`}>
              {runs?.map((run) => <option key={run.run_id} value={run.run_id}>{runLabel(run.run_id, digests.find((d) => d.run_id === run.run_id))}</option>)}
            </select>
          </label>
        </div>
      </div>
    </header>
  );
}

/** Shown only when the run on screen is small and a full-portfolio run is recorded. An offer, never a switch. */
export function RunOffer({ offer, current, onSwitch }: { offer: Digest | null; current: Digest | undefined; onSwitch: (id: string) => void }) {
  if (!offer || !current) return null;
  return (
    <div role="note" className="mb-2 mt-6 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-y border-walnut/40 py-3 text-[15px]">
      <p className="max-w-[44rem] leading-snug">
        <b>This run covers only {current.loans.toLocaleString("en-US")} {current.loans === 1 ? "loan" : "loans"}.</b> A {offer.loans.toLocaleString("en-US")}-loan investigation is also recorded: {offer.reviewed} investigated, {offer.excluded} excluded, {offer.held} held, {offer.spent}{offer.limit ? ` of ${offer.limit}` : ""} acorns spent.
      </p>
      <button type="button" onClick={() => onSwitch(offer.run_id)} className={styles.secondary}>Show the {offer.loans.toLocaleString("en-US")}-loan run</button>
    </div>
  );
}
