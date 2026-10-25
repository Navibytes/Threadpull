"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import type { LoanStatus } from "@/lib/contracts/loan";
import { computeDashboard, OFFICIAL_STATUSES, type RunMetrics, type StatusBreakdown } from "@/lib/dashboard/metrics";
import { describeEvent } from "@/lib/dashboard/describe";
import { briefing, caseNotes, type Briefing, type CaseNotes } from "@/lib/dashboard/notes";
import { describeSource, loanName, reduceEvents, SCENARIOS, scenarioById, summarizeCase, type CaseSummary, type RunEvent } from "@/lib/events";
import { portfolioLabel, type Portfolio } from "@/components/drawer/loan-source";
import { dashboardHref, portfolioQuery } from "@/lib/dashboard/links";
import { useDashboardData, type Load } from "./use-dashboard-data";

const nf = (n: number) => n.toLocaleString("en-US");
const when = (ts: string) => new Date(ts).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });

// The review statuses (colours match the status chips on the board); colour only reinforces the word.
const DOT: Record<LoanStatus, string> = {
  Investigate: "bg-terracotta",
  "No material anomaly found": "bg-sage",
  "Insufficient evidence": "bg-honey",
  "Human-confirmed disposition": "bg-dusty",
  "Not reviewed": "bg-walnut/25",
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

const noRun = (events: Load<unknown>) =>
  events.state === "loading" ? "Loading…" : events.state === "ok" ? "No run recorded yet." : "The event log isn't available.";

// Reading order: the title and what is being shown, Hazel's finding, four figures, how much of the portfolio has been
// reviewed, then everything else folded away (the activity log, the method).
export function Dashboard({ run, seed, sample, caseId, scenario }: { run?: string; seed: Portfolio; sample: boolean; caseId?: string; scenario?: string }) {
  const router = useRouter();
  const scenId = sample ? scenarioById(scenario).id : undefined; // which sample situation the page is showing
  const { loans, events, runs, retry } = useDashboardData({ run, seed, sample, scenario: scenId });
  const loanRows = loans.state === "ok" && loans.data.length > 0 ? loans.data : null;
  const noLoanFiles = loans.state === "ok" && loans.data.length === 0;
  const eventRows = events.state === "ok" ? events.data.rows : null;
  const m = useMemo(() => computeDashboard(loanRows, eventRows), [loanRows, eventRows]);
  const notes = useMemo(() => caseNotes(m.run, { sample }), [m.run, sample]);
  const brief = useMemo(() => briefing(m.run), [m.run]);
  const runId = runs.selected;
  // the cases on this run's board, so the viewer can switch between them without going back to the board
  const leads = useMemo(() => (eventRows ? reduceEvents(eventRows).cards.filter((c) => c.pinnedBy === "lead_opened").map((c) => c.id) : []), [eventRows]);
  const boardHref = sample ? `/board?scenario=${scenId}` : !runId ? "/board" : `/board?run=${encodeURIComponent(runId)}`;
  // one case: its summary from the run's rows, and every row that names its loan (newest first)
  const caseSum = useMemo(() => (caseId && eventRows ? summarizeCase(reduceEvents(eventRows), caseId) : null), [caseId, eventRows]);
  const caseRows = useMemo(() => (caseId && eventRows ? eventRows.filter((e) => e.loan_ids.includes(caseId)).reverse() : []), [caseId, eventRows]);

  const portfolio = loans.state === "ok" ? (noLoanFiles ? `no loan files found for ${portfolioLabel(seed)}` : `${nf(loans.data.length)} loans, ${portfolioLabel(seed)}`) : loans.state === "loading" ? "loading…" : "loan files unavailable";
  const investigation = sample ? "the built-in sample run" : m.run ? `run ${m.run.runId}` : noRun(events).replace(/\.$/, "").toLowerCase();

  return (
    <div className="dash-bg min-h-dvh px-3 py-4 text-[16px] leading-[1.65] sm:px-6 sm:py-8">
      <div className="dash-sheet mx-auto max-w-[1040px] min-[1700px]:max-w-[1200px]">
        <header className="dash-rule flex items-center justify-between gap-3 border-b px-5 py-3.5 sm:px-10">
          <Link href="/" aria-label="Threadpull, home" className="rounded-md">
            <img src="/brand/threadpull-wordmark.png" alt="Threadpull" className="h-9 w-auto" draggable={false} />
          </Link>
          <Link href={boardHref} className="dash-btn dash-btn-dark">
            &larr; Back to the board
          </Link>
        </header>

        <main className="px-5 pb-10 pt-6 sm:px-10" aria-labelledby="dash-title">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
          <div>
          <p className="dash-eyebrow">Portfolio report</p>
          <h1 id="dash-title" className="font-display mt-0.5 text-[2.1rem] font-semibold leading-tight">
            Portfolio intelligence
          </h1>
          <p className="dash-muted mt-1">
            Portfolio: {portfolio}. Investigation shown: {investigation}.
          </p>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {!sample && runs.runs.length > 0 && (
              <Pick label="Run">
                <select
                  value={runId ?? ""}
                  onChange={(e) => router.push(`/dashboard?run=${encodeURIComponent(e.target.value)}${portfolioQuery(seed)}`)}
                  className="dash-btn dash-select"
                >
                  {runs.runs.slice(0, 25).map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </Pick>
            )}
            {leads.length > 0 && (
              <Pick label="Case">
                <select
                  value={caseId ?? ""}
                  onChange={(e) => router.push(dashboardHref({ run: sample ? null : runId, scenario: scenId, portfolio: seed }, e.target.value || undefined))}
                  className="dash-btn dash-select"
                >
                  <option value="">Whole run</option>
                  {leads.map((l) => (
                    <option key={l} value={l}>
                      {loanName(l)}
                    </option>
                  ))}
                </select>
              </Pick>
            )}
            {sample && (
              <Pick label="Sample situation">
                <select value={scenId} onChange={(e) => router.push(`/dashboard?sample=1&scenario=${e.target.value}`)} className="dash-btn dash-select">
                  {SCENARIOS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </Pick>
            )}
            {!sample && (
              <Link href={`/dashboard?sample=1${typeof seed === "number" ? portfolioQuery(seed) : ""}`} className="dash-btn">
                Show sample run
              </Link>
            )}
          </div>
          </div>

          <Notices sample={sample} m={m.run} events={events} loans={loans} retry={retry} />

          {caseId && (
            <CaseDetail caseId={caseId} sum={caseSum} rows={caseRows} state={events.state} overviewHref={dashboardHref({ run: sample ? null : runId, scenario: scenId, portfolio: seed })} sample={sample} />
          )}

          <Finding brief={brief} notes={notes} events={events} boardHref={boardHref} sample={sample} />

          <section aria-label="Key figures" className="mt-10">
            <div className="dash-muted hidden grid-cols-4 text-[13.5px] font-semibold uppercase tracking-[0.1em] min-[760px]:grid">
              <p>Portfolio</p>
              <p className="dash-rule col-span-3 border-l pl-6">This investigation</p>
            </div>
            <div className="dash-rule mt-2 grid grid-cols-2 gap-y-7 min-[760px]:grid-cols-4 min-[760px]:gap-y-0 min-[760px]:divide-x min-[760px]:divide-[rgb(74_55_40/0.16)]">
              <Metric
                caption="Portfolio"
                label="Loans loaded"
                value={m.loansLoaded === null ? "—" : nf(m.loansLoaded)}
                note={loans.state === "ok" ? (noLoanFiles ? `No loan files found for ${portfolioLabel(seed)}.${typeof seed === "number" ? " Load the portfolio (bun run data), then refresh." : ""}` : portfolioLabel(seed).replace(/^./, (c) => c.toUpperCase())) : loans.state === "loading" ? "Loading…" : "The loan files aren't available."}
              />
              <Metric caption="This run" label="Cases investigated" value={m.run ? nf(m.run.casesInvestigated) : "—"} note={m.run ? "Opened as leads" : noRun(events)} />
              <Metric caption="This run" label="Checks completed" value={m.run ? nf(m.run.checks) : "—"} note={m.run ? `${nf(m.run.crsChecks)} CRS lookups · ${nf(m.run.simulatedChecks)} simulated` : noRun(events)} />
              <Metric
                caption="This run"
                label="Connections explained"
                value={m.run ? `${nf(m.run.linksExplained)} of ${nf(m.run.linksFound)}` : "—"}
                note={m.run ? `By a cited check${m.run.explanationsWithoutThread ? ` · ${nf(m.run.explanationsWithoutThread)} more explained something else` : ""}` : noRun(events)}
              />
            </div>
            <Support run={m.run} />
          </section>

          <Coverage b={m.statuses} loans={loans} run={m.run} seed={seed} />

          <div className="mt-10">
            <ActivityLog run={m.run} events={events} boardHref={boardHref} sample={sample} />
            <Method />
          </div>

          <p className="dash-muted dash-rule mt-8 border-t pt-4 text-[14px]">This page only reads recorded data. A connection is a lead to check, not proof.</p>
        </main>
      </div>
    </div>
  );
}

function Pick({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-[14px]">
      <span className="dash-muted font-medium">{label}</span>
      {children}
    </label>
  );
}

// A note that matters, set as a plain line with a rule at its edge, not a bordered box.
function Notices({ sample, m, events, loans, retry }: { sample: boolean; m: RunMetrics | null; events: Load<{ invalid: number; truncated: boolean }>; loans: Load<unknown>; retry: () => void }) {
  const items: ReactNode[] = [];
  const base = "border-l-[3px] py-0.5 pl-3 text-[15px]";
  if (sample)
    items.push(
      <p key="sample" className={`${base} border-[#b8913f] font-medium`}>
        Sample run, illustrative only: made-up loans and hand-written results. Nothing here is a real fraud finding, and none of these figures is a result.
      </p>,
    );
  else if (m && m.simulatedRows > 0)
    items.push(
      <p key="sim" className={`${base} border-terracotta font-medium`}>
        This run includes simulated rows: {nf(m.simulatedRows)} of {nf(m.rows)} are made-up sample data, not real lookups.
      </p>,
    );
  if (events.state === "error" || events.state === "off" || loans.state === "error")
    items.push(
      <p key="err" role="status" className={`${base} border-walnut/40`}>
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
      <p key="rows" className={`${base} border-walnut/40`}>
        {events.data.invalid > 0 && `${events.data.invalid} rows didn't match the event contract and were left out. `}
        {events.data.truncated && "Only the first 2,000 rows of this run are counted."}
      </p>,
    );
  return items.length ? <div className="mt-5 space-y-2.5">{items}</div> : null;
}

// Hazel's finding: what the run found, in one headline and two plain sentences, with her desk beside it. The longer
// notes open underneath; nothing here is anything the run's own figures don't say.
function Finding({ brief, notes, events, boardHref, sample }: { brief: Briefing | null; notes: CaseNotes | null; events: Load<unknown>; boardHref: string; sample: boolean }) {
  return (
    <section aria-labelledby="finding-title" className="dash-finding relative mt-16 px-6 pb-5 pt-5 min-[760px]:min-h-[22rem] min-[760px]:pr-[26rem]">
      <p className="dash-eyebrow">Hazel&rsquo;s finding{sample ? " · illustrative sample" : ""}</p>
      {!brief ? (
        <>
          <h2 id="finding-title" className="font-display mt-1 text-[1.5rem] font-semibold leading-snug">
            Nothing to report yet
          </h2>
          <p className="mt-2 max-w-[38rem] text-pretty">{noRun(events)} Once a run is recorded, what Hazel found and what is still unknown will appear here.</p>
        </>
      ) : (
        <>
          <h2 id="finding-title" className="font-display mt-1 max-w-[36rem] text-balance text-[1.6rem] font-semibold leading-snug min-[760px]:text-[1.75rem]">
            {brief.headline}
          </h2>
          <p className="mt-3 max-w-[40rem] text-pretty">{brief.found}</p>
          <p className="mt-2 max-w-[40rem] text-pretty">
            <span className="font-semibold">Still unknown. </span>
            {brief.unknown}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1">
            <Link href={boardHref} className="dash-btn dash-btn-dark">
              Open this run on the board
            </Link>
            {notes && (
              <details className="dash-more open:w-full">
                <summary className="inline-flex min-h-10 items-center gap-1.5 font-semibold underline-offset-4 hover:underline">
                  <Chevron />
                  Hazel&rsquo;s full notes
                </summary>
                <dl className="mt-2 grid max-w-[40rem] grid-cols-1 gap-y-4">
                  <Notebook label="What we found" lines={notes.found} />
                  <Notebook label="What it means" lines={notes.means} />
                  <Notebook label="What's next" lines={notes.next} />
                </dl>
              </details>
            )}
          </div>
        </>
      )}
      <Image
        src="/hazel/hazel-office.png"
        alt="Hazel at her desk, studying a photograph through a magnifying glass, with a lamp, case files and a small evidence board"
        width={1254}
        height={1254}
        sizes="208px"
        className="relative z-10 mx-auto -mt-16 block h-auto w-40 max-w-full select-none min-[760px]:absolute min-[760px]:-top-16 min-[760px]:bottom-auto min-[760px]:right-3 min-[760px]:mx-0 min-[760px]:mt-0 min-[760px]:w-[25rem] drop-shadow-[0_6px_8px_rgb(0_0_0/0.22)]"
        draggable={false}
      />
    </section>
  );
}

function Notebook({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div>
      <dt className="dash-eyebrow">{label}</dt>
      <dd className="mt-1 space-y-1">
        {lines.map((l) => (
          <p key={l} className="text-pretty">
            {l}
          </p>
        ))}
      </dd>
    </div>
  );
}

function Chevron() {
  return (
    <svg aria-hidden width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="dash-chev shrink-0">
      <path d="M6 3.5 10.5 8 6 12.5" />
    </svg>
  );
}

// One figure: a big number, what it counts, one short line. No box around it; hairlines divide the row.
function Metric({ caption, label, value, note }: { caption: string; label: string; value: string; note: string }) {
  return (
    <div className="min-[760px]:px-6 min-[760px]:py-5 min-[760px]:first:pl-0">
      <p className="dash-muted text-[13.5px] font-semibold uppercase tracking-[0.1em] min-[760px]:hidden">{caption}</p>
      <p className="mt-1 font-semibold min-[760px]:mt-0">{label}</p>
      <p className="mt-1 text-[2.5rem] font-semibold leading-none tabular-nums">{value}</p>
      <p className="dash-muted mt-2 text-[15px] leading-snug text-pretty">{note}</p>
    </div>
  );
}

// The two figures that matter but aren't the headline: what the run spent and whether a person has decided anything.
function Support({ run }: { run: RunMetrics | null }) {
  const b = run?.budget;
  const pct = b && b.limit > 0 ? Math.min(100, (b.spent / b.limit) * 100) : 0;
  return (
    <dl className="dash-rule mt-1 grid grid-cols-1 gap-x-10 gap-y-3 border-t pt-4 min-[760px]:grid-cols-2">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="font-semibold">Budget charged</dt>
          <dd className="tabular-nums">{b ? `${nf(b.spent)} of ${nf(b.limit)} acorns` : "—"}</dd>
        </div>
        {b && (
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-walnut/15" role="img" aria-label={`${nf(b.spent)} of ${nf(b.limit)} acorns spent`}>
            <div className="h-full rounded-full bg-[#b8913f]" style={{ width: `${pct}%` }} />
          </div>
        )}
        <p className="dash-muted mt-1 text-[15px]">
          {!run || !b
            ? "No run recorded yet."
            : `${run.simulatedRows === run.rows ? "Simulated run: acorns are bookkeeping, not a real charge." : run.simulatedRows > 0 ? `${nf(run.simulatedRows)} of ${nf(run.rows)} rows are simulated, so part of this is bookkeeping.` : "Recorded on the run's last row."} Acorns are Threadpull's own unit; no dollar cost is shown.`}
        </p>
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="font-semibold">Human decisions</dt>
          <dd className="tabular-nums">{run ? (run.dispositions ? nf(run.dispositions) : "None yet") : "—"}</dd>
        </div>
      </div>
    </dl>
  );
}

// How much of the portfolio has a status: one bar, then the five counts.
function Coverage({ b, loans, run, seed }: { b: StatusBreakdown | null; loans: Load<unknown>; run: RunMetrics | null; seed: Portfolio }) {
  const rows: LoanStatus[] = [...OFFICIAL_STATUSES, "Not reviewed"];
  const pct = (n: number) => (b && b.total ? (n / b.total) * 100 : 0);
  return (
    <section aria-labelledby="coverage-title" className="mt-10">
      <h2 id="coverage-title" className="font-display text-[1.4rem] font-semibold leading-snug">
        Review status of the portfolio
      </h2>
      {!b ? (
        <p className="dash-muted mt-2">{loans.state === "loading" ? "Loading…" : loans.state === "ok" ? `No loan files found for ${portfolioLabel(seed)}, so there is nothing to break down yet.` : "The loan files aren't available, so the breakdown can't be shown."}</p>
      ) : (
        <>
          <p className="dash-muted mt-1">
            {nf(b.total - b.counts["Not reviewed"])} of {nf(b.total)} loans have a recorded review status.
          </p>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-walnut/12" role="img" aria-label={rows.map((s) => `${s}: ${nf(b.counts[s])}`).join(", ")}>
            {rows.map((s) => (
              <div key={s} className={DOT[s]} style={{ width: `${pct(b.counts[s])}%` }} />
            ))}
          </div>
          <ul className="mt-4 grid grid-cols-1 gap-x-10 gap-y-1.5 min-[760px]:grid-cols-2">
            {rows.map((s) => (
              <li key={s} className="flex items-baseline gap-2.5">
                <span aria-hidden className={`mt-[0.35rem] h-2.5 w-2.5 shrink-0 self-start rounded-full ${DOT[s]}`} />
                <span className="flex-1">{s === "Not reviewed" ? "Not reviewed (no status yet)" : s}</span>
                <span className="tabular-nums">
                  {nf(b.counts[s])} <span className="dash-muted">· {pct(b.counts[s]).toFixed(1)}%</span>
                </span>
              </li>
            ))}
          </ul>
          <details className="dash-more mt-3">
            <summary className="inline-flex min-h-10 items-center gap-1.5 font-semibold underline-offset-4 hover:underline">
              <Chevron />
              How these are counted
            </summary>
            <p className="dash-muted mt-1 max-w-[40rem] text-pretty">
              {nf(b.total)} loans, each counted once: the status on its loan file, or the latest status set in this run.
              {run ? ` ${nf(b.fromRun)} took their status from this run.` : ""}
              {b.outsidePortfolio ? ` ${nf(b.outsidePortfolio)} loans this run touched aren't in this portfolio and aren't counted.` : ""}
              {b.ignoredRows ? ` ${nf(b.ignoredRows)} status rows used an unsupported word and were ignored.` : ""} &ldquo;Not reviewed&rdquo; is the absence of a status, not a finding.
            </p>
          </details>
        </>
      )}
    </section>
  );
}

// One case, opened from a board card's "Case details" button. The same plain summary the board shows, then the
// recorded rows that name this loan. A case the run doesn't contain says so; nothing is filled in.
function CaseDetail({ caseId, sum, rows, state, overviewHref, sample }: { caseId: string; sum: CaseSummary | null; rows: RunEvent[]; state: Load<unknown>["state"]; overviewHref: string; sample: boolean }) {
  const lines: [string, string][] = sum ? [["Looking at", sum.who], ["Found", sum.found], ["Why it matters", sum.why], ["Evidence", sum.evidence], ["Next", sum.next]] : [];
  return (
    <section aria-labelledby="case-title" className="dash-rule mt-8 border-t pt-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <p className="dash-eyebrow">Selected case</p>
          <h2 id="case-title" className="font-display text-[1.65rem] font-semibold leading-snug">
            {loanName(caseId)}
          </h2>
        </div>
        <Link href={overviewHref} className="dash-btn">
          &larr; All of this run
        </Link>
      </div>
      {state === "loading" ? (
        <p className="mt-3">Loading this case…</p>
      ) : state !== "ok" ? (
        <p className="mt-3">The run&rsquo;s rows aren&rsquo;t available, so this case can&rsquo;t be shown.</p>
      ) : !sum ? (
        <p className="mt-3">Loan {caseId} isn&rsquo;t on this run&rsquo;s board, so there is no case to show.</p>
      ) : (
        <>
          <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 min-[640px]:grid-cols-[9rem_minmax(0,1fr)]">
            {lines.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="font-semibold">{k}</dt>
                <dd className="text-pretty">{v}</dd>
              </div>
            ))}
          </dl>
          {sum.sample && sample && <p className="mt-3 font-medium">Sample data: made up for demonstration.</p>}
          <details className="dash-more mt-3">
            <summary className="inline-flex min-h-10 items-center gap-1.5 font-semibold underline-offset-4 hover:underline">
              <Chevron />
              Recorded rows about this loan ({nf(rows.length)})
            </summary>
            {rows.length === 0 ? (
              <p className="mt-1">No recorded row names this loan.</p>
            ) : (
              <ol className="dash-rule mt-1 divide-y divide-[rgb(74_55_40/0.12)]">
                {rows.slice(0, 30).map((e) => {
                  const { title, detail } = describeEvent(e);
                  return (
                    <li key={e.seq} className="grid grid-cols-1 gap-x-4 py-2 min-[640px]:grid-cols-[10.5rem_minmax(0,1fr)]">
                      <span className="dash-muted tabular-nums">{when(e.ts)}</span>
                      <span>
                        {title}
                        {detail && <span className="dash-muted block">{detail}</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            {rows.length > 30 && <p className="dash-muted mt-1 text-[15px]">Showing the newest 30 of {nf(rows.length)} rows.</p>}
          </details>
        </>
      )}
    </section>
  );
}

// The audit trail, folded away until asked for: every recorded step, with where it came from.
function ActivityLog({ run, events, boardHref, sample }: { run: RunMetrics | null; events: Load<unknown>; boardHref: string; sample: boolean }) {
  const refs = run ? Object.entries(run.sourceRefs).sort((a, b) => b[1] - a[1]) : [];
  return (
    <details className="dash-more dash-rule border-t py-1">
      <summary className="flex min-h-12 items-center justify-between gap-3">
        <span className="flex items-center gap-2">
          <Chevron />
          <span className="font-display text-[1.25rem] font-semibold">Activity log</span>
        </span>
        <span className="dash-muted text-[14px]">{run ? `${nf(run.rows)} recorded steps${sample ? " · sample" : ""}` : "No run recorded"}</span>
      </summary>
      <div className="pb-4 pt-1">
        {!run ? (
          <p className="dash-muted">{noRun(events)} Recorded steps, with where each came from, will be listed here.</p>
        ) : (
          <>
            <p className="dash-muted break-all text-[14px]">
              Run {run.runId} · {nf(run.rows)} rows · {when(run.firstTs)} to {when(run.lastTs)}
            </p>
            <p className="mt-2 text-[15px]">
              <span className="font-semibold">Sources cited: </span>
              {refs.length === 0
                ? "none recorded."
                : `${refs.map(([k, n]) => `${nf(n)} ${SOURCE_NAME[k] ?? k}`).join(" · ")}${run.crsRequestIds > 0 ? ` · ${nf(run.crsRequestIds)} distinct CRS RequestIDs` : ""}.`}{" "}
              <span className="dash-muted">References are counted per row, so a source used twice counts twice.</span>
            </p>
            <p className="dash-muted mt-3 text-[15px]">
              Under each step: <span className="font-semibold">simulated</span> means a stand-in, not a live check; <span className="font-semibold">CRS lookup</span> means a call to the credit bureau;{" "}
              <span className="font-semibold">+N acorns</span> is the budget that step used, from the change in the recorded budget.
            </p>
            <ol className="mt-2">
              {run.recent.map((e, i) => (
                <ActivityRow key={e.seq} e={e} boardHref={boardHref} charge={i + 1 < run.recent.length ? (e.budget?.spent ?? 0) - (run.recent[i + 1].budget?.spent ?? 0) : null} />
              ))}
            </ol>
            <p className="dash-muted mt-2 text-[14px]">
              Showing the latest {run.recent.length} of {nf(run.rows)} rows, newest first.{" "}
              <Link href={boardHref} className="font-semibold underline underline-offset-4">
                Open this run on the board
              </Link>
            </p>
          </>
        )}
      </div>
    </details>
  );
}

function ActivityRow({ e, boardHref, charge }: { e: RunEvent; boardHref: string; charge: number | null }) {
  const d = describeEvent(e);
  return (
    <li className="dash-rule border-t first:border-t-0">
      <details className="dash-more">
        <summary className="flex items-start gap-2 py-2.5">
          <span className="mt-1 text-walnut/60">
            <Chevron />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-medium">{d.title}</span>
            {d.detail && <span className="dash-muted block text-[14px] text-pretty">{d.detail}</span>}
            <span className="dash-muted block text-[14px] tabular-nums">
              {when(e.ts)} · seq {e.seq}
              {e.simulated && <span className="font-semibold"> · simulated</span>}
              {e.sources.some((s) => s.kind === "crs") && <span className="font-semibold"> · CRS lookup</span>}
              {charge !== null && charge > 0 && <span className="font-semibold"> · +{nf(charge)} acorns</span>}
            </span>
          </span>
        </summary>
        <div className="pb-3 pl-7 text-[15px]">
          {e.sources.length === 0 ? (
            <p className="dash-muted">No sources recorded on this row.</p>
          ) : (
            <ul className="space-y-1.5">
              {e.sources.map((s, i) => {
                const x = describeSource(s);
                return (
                  <li key={i}>
                    <span className="font-medium">{x.label}</span>
                    <span className="dash-muted block break-all font-mono text-[14px]">{x.detail}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <Link href={boardHref} className="mt-2 inline-block font-semibold underline underline-offset-4">
            Inspect on the board
          </Link>
        </div>
      </details>
    </li>
  );
}

const STEPS: [string, string][] = [
  ["Ingest", "The loan tape is loaded and cleaned into one record per loan."],
  ["Connect", "Loans that share a phone, address, device or employer are linked in a graph. A rarer detail counts for more."],
  ["Prioritize", "Leads are ranked so the strongest connections are looked at first."],
  ["Verify selectively", "Hazel spends a fixed budget on outside checks, such as CRS credit-bureau lookups. The code enforces the budget."],
  ["Explain with evidence", "Every finding cites its sources. Suspicion comes down only when a cited check explains it."],
  ["Human review", "A person approves the money decision. Threadpull recommends; it never acts on a borrower. The CRO review screen (/cro) shows the deal for a recorded run."],
];

// The investigation method, folded away.
function Method() {
  return (
    <details className="dash-more dash-rule border-t py-1">
      <summary className="flex min-h-12 items-center gap-2">
        <Chevron />
        <span className="font-display text-[1.25rem] font-semibold">How Threadpull works</span>
      </summary>
      <ol className="mt-1 max-w-[42rem] list-decimal space-y-2 pb-4 pl-6 marker:font-semibold marker:text-[#9c4630]">
        {STEPS.map(([name, text]) => (
          <li key={name} className="pl-1 text-pretty">
            <span className="font-semibold">{name}.</span> {text}
          </li>
        ))}
      </ol>
    </details>
  );
}
