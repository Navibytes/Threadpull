"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { LOAN_STATUSES, type LoanStatus } from "@/lib/contracts/loan";
import { computeDashboard, OFFICIAL_STATUSES, type RunMetrics, type StatusBreakdown } from "@/lib/dashboard/metrics";
import { describeEvent } from "@/lib/dashboard/describe";
import { describeSource, type RunEvent } from "@/lib/events";
import { useDashboardData, type Load } from "./use-dashboard-data";

const nf = (n: number) => n.toLocaleString("en-US");
const when = (ts: string) => new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

// The four supported statuses (colours match the status chips on the board); colour only reinforces the word.
const BAR: Record<LoanStatus, string> = {
  Investigate: "bg-terracotta",
  "No material anomaly found": "bg-sage",
  "Insufficient evidence": "bg-honey",
  "Human-confirmed disposition": "bg-dusty",
  "Not reviewed": "bg-milk/40",
};

const SOURCE_NAME: Record<string, string> = {
  row: "data-room rows",
  crs: "CRS lookups",
  document: "documents",
  lookup: "public lookups",
  rule: "saved rules",
  human: "human answers",
  event: "earlier events",
};

export function Dashboard({ run, seed, sample }: { run?: string; seed: number; sample: boolean }) {
  const router = useRouter();
  const { loans, events, runs, retry } = useDashboardData({ run, seed, sample });
  const loanRows = loans.state === "ok" && loans.data.length > 0 ? loans.data : null;
  const noLoanFiles = loans.state === "ok" && loans.data.length === 0;
  const eventRows = events.state === "ok" ? events.data.rows : null;
  const m = useMemo(() => computeDashboard(loanRows, eventRows), [loanRows, eventRows]);
  const runId = runs.selected;
  const boardHref = sample || !runId ? "/" : `/?run=${encodeURIComponent(runId)}`;

  return (
    <div className="dash-bg min-h-dvh p-3 text-walnut sm:p-5">
      <div className="dash-shell mx-auto grid max-w-[1600px] grid-cols-1 overflow-hidden rounded-[26px] min-[1100px]:h-[calc(100dvh-2.5rem)] min-[1100px]:grid-cols-[13rem_minmax(0,1fr)_21.5rem]">
        <Sidebar boardHref={boardHref} />

        <main className="min-w-0 overflow-y-auto px-4 pb-6 pt-4 sm:px-6" aria-labelledby="dash-title">
          <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-walnut/70">Threadpull</p>
              <h1 id="dash-title" className="font-display text-[1.7rem] font-semibold leading-tight">
                Portfolio intelligence
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Link href={boardHref} className="dash-pill dash-pill-dark min-[1100px]:hidden">
                Investigation board
              </Link>
              {!sample && runs.runs.length > 0 && (
                <label className="flex items-center gap-2 text-[13px]">
                  <span className="font-medium">Run</span>
                  <select
                    value={runId ?? ""}
                    onChange={(e) => router.push(`/dashboard?run=${encodeURIComponent(e.target.value)}${seed !== 13 ? `&seed=${seed}` : ""}`)}
                    className="dash-pill max-w-[13rem] truncate bg-paper"
                  >
                    {runs.runs.slice(0, 25).map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {!sample && (
                <Link href={`/dashboard?sample=1${seed !== 13 ? `&seed=${seed}` : ""}`} className="dash-pill">
                  Show sample run
                </Link>
              )}
            </div>
          </header>

          <Notices sample={sample} m={m.run} events={events} loans={loans} retry={retry} />

          <section aria-label="Key figures" className="mt-4 grid grid-cols-1 gap-3 min-[560px]:grid-cols-2 min-[900px]:grid-cols-3">
            <Kpi scope="Portfolio" label="Loans loaded" value={m.loansLoaded === null ? "—" : nf(m.loansLoaded)} note={loans.state === "ok" ? (noLoanFiles ? `No loan files found for seed ${seed}. Load the portfolio (bun run data), then refresh.` : `Loan files for seed ${seed}. Each loan counted once.`) : loans.state === "loading" ? "Loading…" : "The loan files aren't available."} />
            <Kpi scope="This run" label="Cases investigated" value={m.run ? nf(m.run.casesInvestigated) : "—"} note={m.run ? "Distinct loans opened as leads." : noRun(events)} />
            <Kpi
              scope="This run"
              label="Checks completed"
              value={m.run ? nf(m.run.checks) : "—"}
              note={m.run ? `${nf(m.run.crsChecks)} of them used a CRS lookup. Each check counted once.` : noRun(events)}
            />
            <Kpi
              scope="This run"
              label="Suspicious links explained"
              value={m.run ? `${nf(m.run.linksExplained)} of ${nf(m.run.linksFound)}` : "—"}
              note={
                m.run
                  ? `Of the links found, those taken down by a cited check${m.run.explanationsWithoutThread ? `. ${m.run.explanationsWithoutThread} more explained something that isn't a link` : ""}.`
                  : noRun(events)
              }
            />
            <BudgetKpi run={m.run} fallback={noRun(events)} />
            <Kpi
              scope="This run"
              label="Human dispositions"
              value={m.run ? (m.run.dispositions ? nf(m.run.dispositions) : "None yet") : "—"}
              note={m.run ? "Distinct loans with a recorded human decision." : noRun(events)}
            />
          </section>

          <div className="mt-4 grid grid-cols-1 gap-3 min-[900px]:grid-cols-2">
            <Breakdown b={m.statuses} loans={loans} run={m.run} seed={seed} />
            <HowItWorks />
          </div>
        </main>

        <AuditTrail run={m.run} events={events} boardHref={boardHref} sample={sample} />
      </div>
    </div>
  );
}

const noRun = (events: Load<unknown>) =>
  events.state === "loading" ? "Loading…" : events.state === "ok" ? "No run recorded yet." : "The event log isn't available.";

function Sidebar({ boardHref }: { boardHref: string }) {
  const item = "flex items-center gap-2.5 rounded-xl px-3 py-2 text-sm";
  return (
    <aside className="hidden flex-col border-r border-walnut/10 px-3 py-4 min-[1100px]:flex" aria-label="Threadpull sections">
      <Link href="/" aria-label="Threadpull, investigation board">
        <img src="/brand/threadpull-wordmark.png" alt="Threadpull" className="h-14 w-auto" draggable={false} />
      </Link>
      <nav className="mt-5 flex flex-col gap-1">
        <Link href={boardHref} className={`${item} hover:bg-walnut/5`}>
          <Icon d="M4 5h16v11H4zM8 20h8M12 16v4M8 9l3 2 5-3" />
          Investigation board
        </Link>
        <Link href="/dashboard" aria-current="page" className={`${item} bg-paper font-semibold shadow-[0_1px_3px_rgb(0_0_0/0.12)]`}>
          <Icon d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
          Portfolio
        </Link>
        <span className={`${item} cursor-not-allowed text-walnut/60`} title="The CRO brief isn't built yet">
          <Icon d="M7 3.6h7l4 4V19c0 1-.5 1.5-1.5 1.5H7c-1 0-1.5-.5-1.5-1.5V5c0-1 .5-1.5 1.5-1.4zM14 3.6v4h4M9 12h6" />
          <span className="leading-tight">
            CRO brief
            <span className="block text-xs">not built yet</span>
          </span>
        </span>
      </nav>
      <p className="mt-auto rounded-xl bg-walnut/5 p-3 text-[12px] leading-snug text-walnut/80">
        This page only reads recorded data. A connection is a lead to check, not proof, and nothing here acts on a borrower.
      </p>
    </aside>
  );
}

function Icon({ d }: { d: string }) {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d={d} />
    </svg>
  );
}

function Notices({ sample, m, events, loans, retry }: { sample: boolean; m: RunMetrics | null; events: Load<{ invalid: number; truncated: boolean }>; loans: Load<unknown>; retry: () => void }) {
  const items: ReactNode[] = [];
  if (sample)
    items.push(
      <p key="sample" className="rounded-xl border border-honey bg-honey/20 px-3 py-2 text-[13px] font-medium">
        SAMPLE RUN: a hand-written example with made-up loans. It is not an investigation, and none of these figures is a result.
      </p>,
    );
  else if (m && m.simulatedRows > 0)
    items.push(
      <p key="sim" className="rounded-xl border border-terracotta/50 bg-terracotta/10 px-3 py-2 text-[13px] font-medium">
        This run includes simulated rows: {nf(m.simulatedRows)} of {nf(m.rows)} are made-up sample data, not real lookups.
      </p>,
    );
  if (events.state === "error" || events.state === "off" || loans.state === "error")
    items.push(
      <p key="err" role="status" className="rounded-xl border border-walnut/20 bg-paper px-3 py-2 text-[13px]">
        {events.state === "error" || events.state === "off" ? events.message : ""} {loans.state === "error" ? loans.message : ""}{" "}
        {(events.state === "error" || loans.state === "error") && (
          <button type="button" onClick={retry} className="font-semibold underline">
            Try again
          </button>
        )}
      </p>,
    );
  if (events.state === "ok" && (events.data.invalid > 0 || events.data.truncated))
    items.push(
      <p key="rows" className="rounded-xl border border-walnut/20 bg-paper px-3 py-2 text-[13px]">
        {events.data.invalid > 0 && `${events.data.invalid} rows didn't match the event contract and were left out. `}
        {events.data.truncated && "Only the first 2,000 rows of this run are counted."}
      </p>,
    );
  return items.length ? <div className="mt-3 space-y-2">{items}</div> : null;
}

function Kpi({ scope, label, value, note, children }: { scope: "Portfolio" | "This run"; label: string; value: string; note: string; children?: ReactNode }) {
  return (
    <article className="dash-card flex min-h-[7.5rem] flex-col rounded-2xl p-3.5">
      <div className="flex items-start justify-between gap-2">
        <h2 className="text-[13px] font-semibold leading-tight">{label}</h2>
        <span className="shrink-0 rounded-full bg-walnut/8 px-2 py-0.5 text-[11px] font-medium text-walnut/80">{scope}</span>
      </div>
      <p className="mt-1.5 text-[1.9rem] font-semibold leading-none tabular-nums">{value}</p>
      {children}
      <p className="mt-auto pt-2 text-[12px] leading-snug text-walnut/80">{note}</p>
    </article>
  );
}

function BudgetKpi({ run, fallback }: { run: RunMetrics | null; fallback: string }) {
  const b = run?.budget;
  const pct = b && b.limit > 0 ? Math.min(100, (b.spent / b.limit) * 100) : 0;
  return (
    <Kpi
      scope="This run"
      label="Validation budget"
      value={b ? `${nf(b.spent)} of ${nf(b.limit)}` : "—"}
      note={b ? `${nf(Math.max(0, b.limit - b.spent))} acorns remaining, from the run's last row. Acorns are Threadpull's budget unit; tool prices are assumed.` : fallback}
    >
      {b && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-walnut/10" role="img" aria-label={`${nf(b.spent)} of ${nf(b.limit)} acorns spent`}>
          <div className="h-full rounded-full bg-honey" style={{ width: `${pct}%` }} />
        </div>
      )}
    </Kpi>
  );
}

function Breakdown({ b, loans, run, seed }: { b: StatusBreakdown | null; loans: Load<unknown>; run: RunMetrics | null; seed: number }) {
  return (
    <section aria-labelledby="breakdown-title" className="dash-card rounded-2xl p-4">
      <div className="flex items-start justify-between gap-2">
        <h2 id="breakdown-title" className="font-display text-lg font-semibold">
          Investigation breakdown
        </h2>
        <span className="shrink-0 rounded-full bg-walnut/8 px-2 py-0.5 text-[11px] font-medium text-walnut/80">Portfolio</span>
      </div>
      {!b ? (
        <p className="mt-3 text-sm text-walnut/80">{loans.state === "loading" ? "Loading…" : loans.state === "ok" ? `No loan files found for seed ${seed}, so there is nothing to break down yet.` : "The loan files aren't available, so the breakdown can't be shown."}</p>
      ) : (
        <>
          <ul className="mt-3 space-y-2.5">
            {OFFICIAL_STATUSES.map((s) => (
              <li key={s}>
                <div className="flex items-baseline justify-between gap-2 text-[13px]">
                  <span className="font-medium">{s}</span>
                  <span className="tabular-nums">
                    {nf(b.counts[s])} <span className="text-walnut/70">· {b.total ? ((b.counts[s] / b.total) * 100).toFixed(1) : "0.0"}%</span>
                  </span>
                </div>
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-walnut/10" aria-hidden>
                  <div className={`h-full rounded-full ${BAR[s]}`} style={{ width: `${b.total ? (b.counts[s] / b.total) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-dashed border-walnut/25 pt-3">
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="font-medium">Not reviewed</span>
              <span className="tabular-nums">
                {nf(b.counts["Not reviewed"])} <span className="text-walnut/70">· {b.total ? ((b.counts["Not reviewed"] / b.total) * 100).toFixed(1) : "0.0"}%</span>
              </span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-walnut/10" aria-hidden>
              <div className={`h-full rounded-full ${BAR["Not reviewed"]}`} style={{ width: `${b.total ? (b.counts["Not reviewed"] / b.total) * 100 : 0}%` }} />
            </div>
            <p className="mt-1 text-[12px] text-walnut/80">No investigation status recorded. This is the absence of a status, not a finding.</p>
          </div>
          <p className="mt-3 text-[12px] leading-snug text-walnut/80">
            {nf(b.total)} loans, each counted once: the status on its loan file, or the latest status set in this run.
            {run ? ` ${nf(b.fromRun)} took their status from this run.` : ""}
            {b.outsidePortfolio ? ` ${nf(b.outsidePortfolio)} loans this run touched aren't in this portfolio and aren't counted.` : ""}
            {b.ignoredRows ? ` ${nf(b.ignoredRows)} status rows used an unsupported word and were ignored.` : ""}
          </p>
        </>
      )}
    </section>
  );
}

const STEPS: [string, string][] = [
  ["Ingest", "The loan tape is loaded and cleaned into one record per loan."],
  ["Connect", "Loans that share a phone, address, device or employer are linked in a graph. A rarer detail counts for more."],
  ["Prioritize", "Leads are ranked so the strongest connections are looked at first."],
  ["Verify selectively", "Hazel spends a fixed budget on outside checks, such as CRS credit-bureau lookups. The code enforces the budget."],
  ["Explain with evidence", "Every finding cites its sources. Suspicion comes down only when a cited check explains it."],
  ["Human review", "A person approves the money decision. Threadpull recommends; it never acts on a borrower."],
];

function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="dash-card rounded-2xl p-4">
      <h2 id="how-title" className="font-display text-lg font-semibold">
        How Threadpull works
      </h2>
      <ol className="mt-3 space-y-2">
        {STEPS.map(([name, text], i) => (
          <li key={name} className="flex gap-2.5">
            <span aria-hidden className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-walnut text-[12px] font-semibold text-cream">
              {i + 1}
            </span>
            <p className="text-[13px] leading-snug">
              <span className="font-semibold">{name}.</span> {text}
              {name === "Human review" && <span className="text-walnut/70"> The CRO review screen isn&rsquo;t built yet.</span>}
            </p>
          </li>
        ))}
      </ol>
    </section>
  );
}

function AuditTrail({ run, events, boardHref, sample }: { run: RunMetrics | null; events: Load<unknown>; boardHref: string; sample: boolean }) {
  const refs = run ? Object.entries(run.sourceRefs).sort((a, b) => b[1] - a[1]) : [];
  return (
    <aside aria-labelledby="audit-title" className="dash-card m-3 flex min-h-0 min-w-0 flex-col rounded-[20px] p-4 min-[1100px]:my-3 min-[1100px]:ml-0">
      <div className="flex items-start justify-between gap-2">
        <h2 id="audit-title" className="font-display text-xl font-semibold">
          Audit trail
        </h2>
        {sample && <span className="shrink-0 rounded-full bg-honey/30 px-2 py-0.5 text-[11px] font-semibold">Sample</span>}
      </div>
      {!run ? (
        <p className="mt-3 text-sm text-walnut/80">{noRun(events)} Recorded steps, with where each came from, will be listed here.</p>
      ) : (
        <>
          <p className="mt-1 break-all text-[12px] text-walnut/80">
            Run {run.runId} · {nf(run.rows)} rows · {when(run.firstTs)} to {when(run.lastTs)}
          </p>
          <Link href={boardHref} className="dash-pill dash-pill-dark mt-2 w-fit">
            Open this run on the board
          </Link>
          <div className="mt-3 rounded-xl bg-walnut/5 p-2.5 text-[12px] leading-snug">
            <p className="font-semibold">Sources cited in this run</p>
            {refs.length === 0 ? (
              <p className="mt-0.5 text-walnut/80">No source references recorded.</p>
            ) : (
              <p className="mt-0.5">
                {refs.map(([k, n]) => `${nf(n)} ${SOURCE_NAME[k] ?? k}`).join(" · ")}
                {run.crsRequestIds > 0 && ` · ${nf(run.crsRequestIds)} distinct CRS RequestIDs`}
              </p>
            )}
            <p className="mt-0.5 text-walnut/70">References counted per row, so a source used twice counts twice.</p>
          </div>
          <h3 className="mt-3 text-[12px] font-semibold uppercase tracking-[0.12em] text-walnut/70">Latest steps</h3>
          <ul className="mt-1.5 min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-0.5">
            {run.recent.map((e) => (
              <AuditRow key={e.seq} e={e} boardHref={boardHref} />
            ))}
          </ul>
          <p className="mt-2 text-[12px] text-walnut/70">
            Showing the latest {run.recent.length} of {nf(run.rows)} rows.
          </p>
        </>
      )}
    </aside>
  );
}

function AuditRow({ e, boardHref }: { e: RunEvent; boardHref: string }) {
  const d = describeEvent(e);
  return (
    <li className="rounded-xl border border-walnut/10 bg-paper/80">
      <details className="group">
        <summary className="cursor-pointer list-none px-2.5 py-2">
          <p className="text-[13px] font-medium leading-snug">{d.title}</p>
          {d.detail && <p className="mt-0.5 line-clamp-2 text-[12px] text-walnut/80">{d.detail}</p>}
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11.5px] text-walnut/70">
            <span>{when(e.ts)}</span>
            <span>seq {e.seq}</span>
            {e.simulated && <span className="rounded bg-honey/30 px-1 font-semibold text-walnut">simulated</span>}
            <span className="ml-auto group-open:hidden">Sources ▸</span>
            <span className="ml-auto hidden group-open:inline">Sources ▾</span>
          </p>
        </summary>
        <div className="border-t border-walnut/10 px-2.5 py-2 text-[12px]">
          {e.sources.length === 0 ? (
            <p className="text-walnut/80">No sources recorded on this row.</p>
          ) : (
            <ul className="space-y-1">
              {e.sources.map((s, i) => {
                const x = describeSource(s);
                return (
                  <li key={i}>
                    <span className="font-medium">{x.label}</span>
                    <span className="block break-all font-mono text-[11.5px] text-walnut/80">{x.detail}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href={boardHref} className="mt-2 inline-block font-semibold underline">
            Inspect on the board
          </Link>
        </div>
      </details>
    </li>
  );
}
