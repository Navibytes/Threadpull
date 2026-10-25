"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, type ReactNode } from "react";
import { HazelAvatar } from "@/components/notebook/hazel-avatar";
import type { LoanStatus } from "@/lib/contracts/loan";
import { computeDashboard, OFFICIAL_STATUSES, type RunMetrics, type StatusBreakdown } from "@/lib/dashboard/metrics";
import { describeEvent } from "@/lib/dashboard/describe";
import { caseNotes, type CaseNotes } from "@/lib/dashboard/notes";
import { describeSource, loanName, reduceEvents, summarizeCase, type CaseSummary, type RunEvent } from "@/lib/events";
import { dashboardHref } from "@/lib/dashboard/links";
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

// What kind of step a log entry is, shown as the dot on the timeline. The entry's words say the same thing.
const DOT: Partial<Record<RunEvent["type"], string>> = {
  link_found: "bg-terracotta",
  attack_detected: "bg-terracotta",
  clue_explained: "bg-sage",
  check_run: "bg-honey",
  status_changed: "bg-dusty",
  disposition_recorded: "bg-dusty",
  question_asked: "bg-dusty",
};

export function Dashboard({ run, seed, sample, caseId }: { run?: string; seed: number; sample: boolean; caseId?: string }) {
  const router = useRouter();
  const { loans, events, runs, retry } = useDashboardData({ run, seed, sample });
  const loanRows = loans.state === "ok" && loans.data.length > 0 ? loans.data : null;
  const noLoanFiles = loans.state === "ok" && loans.data.length === 0;
  const eventRows = events.state === "ok" ? events.data.rows : null;
  const m = useMemo(() => computeDashboard(loanRows, eventRows), [loanRows, eventRows]);
  const notes = useMemo(() => caseNotes(m.run, { sample }), [m.run, sample]);
  const runId = runs.selected;
  const boardHref = sample || !runId ? "/" : `/?run=${encodeURIComponent(runId)}`;
  // one case: its summary from the run's rows, and every row that names its loan (newest first)
  const caseSum = useMemo(() => (caseId && eventRows ? summarizeCase(reduceEvents(eventRows), caseId) : null), [caseId, eventRows]);
  const caseRows = useMemo(() => (caseId && eventRows ? eventRows.filter((e) => e.loan_ids.includes(caseId)).reverse() : []), [caseId, eventRows]);

  return (
    <div className="dash-bg min-h-dvh p-3 text-walnut sm:p-5">
      <div className="dash-shell mx-auto grid max-w-[1600px] grid-cols-1 overflow-hidden rounded-[22px] min-[1100px]:h-[calc(100dvh-2.5rem)] min-[1100px]:grid-cols-[13rem_minmax(0,1fr)_21.5rem]">
        <Sidebar boardHref={boardHref} />

        <main className="min-w-0 overflow-y-auto px-4 pb-8 pt-4 sm:px-6" aria-labelledby="dash-title">
          <header>
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-terracotta">Case file · Portfolio report</p>
                <h1 id="dash-title" className="font-display text-[2rem] font-semibold leading-tight">
                  Portfolio intelligence
                </h1>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Link href={boardHref} className="dash-pill dash-pill-dark">
                  &larr; Back to the board
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
            </div>
            <div className="dash-rule mt-2" aria-hidden />
          </header>

          <Notices sample={sample} m={m.run} events={events} loans={loans} retry={retry} />

          {caseId && (
            <CaseDetail
              caseId={caseId}
              sum={caseSum}
              rows={caseRows}
              state={events.state}
              overviewHref={dashboardHref({ run: sample ? null : runId })}
              sample={sample}
            />
          )}

          <CaseNotesSection notes={notes} run={m.run} events={events} boardHref={boardHref} sample={sample} />

          <section aria-label="Key figures" className="mt-8 grid grid-cols-1 gap-x-3 gap-y-6 min-[560px]:grid-cols-2 min-[900px]:grid-cols-3">
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

          <div className="mt-8 grid grid-cols-1 gap-x-3 gap-y-7 min-[900px]:grid-cols-2">
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

// One case, opened from a board card's "Case details" button. The same plain summary the board shows, then the
// recorded rows that name this loan. A case the run doesn't contain says so; nothing is filled in.
function CaseDetail({ caseId, sum, rows, state, overviewHref, sample }: { caseId: string; sum: CaseSummary | null; rows: RunEvent[]; state: Load<unknown>["state"]; overviewHref: string; sample: boolean }) {
  const lines: [string, string][] = sum ? [["Looking at", sum.who], ["Found", sum.found], ["Why it matters", sum.why], ["Evidence", sum.evidence], ["Next", sum.next]] : [];
  return (
    <section aria-labelledby="case-title" className="mt-9">
      <div className="dossier px-4 pb-4 pt-4">
        <span className="dossier-tab">Case</span>
        <div className="dossier-head flex flex-wrap items-baseline justify-between gap-2 pb-1.5">
          <h2 id="case-title" className="font-display text-xl font-semibold">{loanName(caseId)}</h2>
          <Link href={overviewHref} className="dash-pill">&larr; All of this run</Link>
        </div>
        {state === "loading" ? (
          <p className="mt-3 text-sm">Loading this case…</p>
        ) : state !== "ok" ? (
          <p className="mt-3 text-sm">The run&rsquo;s rows aren&rsquo;t available, so this case can&rsquo;t be shown.</p>
        ) : !sum ? (
          <p className="mt-3 text-sm">Loan {caseId} isn&rsquo;t on this run&rsquo;s board, so there is no case to show.</p>
        ) : (
          <>
            <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-2 text-sm min-[640px]:grid-cols-[8rem_minmax(0,1fr)]">
              {lines.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-semibold text-walnut/80">{k}</dt>
                  <dd className="leading-relaxed">{v}</dd>
                </div>
              ))}
            </dl>
            {sum.sample && sample && <p className="mt-3 text-sm font-medium text-terracotta">Sample data: made up for demonstration.</p>}
            <h3 className="mt-5 text-[12px] font-semibold uppercase tracking-[0.14em] text-walnut/80">Recorded rows about this loan</h3>
            {rows.length === 0 ? (
              <p className="mt-2 text-sm">No recorded row names this loan.</p>
            ) : (
              <ol className="mt-2 divide-y divide-walnut/15 text-sm">
                {rows.slice(0, 30).map((e) => {
                  const { title, detail } = describeEvent(e);
                  return (
                    <li key={e.seq} className="grid grid-cols-[4.5rem_minmax(0,1fr)] gap-x-3 py-1.5">
                      <span className="tabular-nums text-walnut/70">{when(e.ts)}</span>
                      <span>
                        {title}
                        {detail && <span className="block text-walnut/75">{detail}</span>}
                      </span>
                    </li>
                  );
                })}
              </ol>
            )}
            {rows.length > 30 && <p className="mt-2 text-xs text-walnut/70">Showing the newest 30 of {nf(rows.length)} rows.</p>}
          </>
        )}
      </div>
    </section>
  );
}

function Sidebar({ boardHref }: { boardHref: string }) {
  const item = "flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm";
  return (
    <aside className="dash-side hidden flex-col px-3 py-4 min-[1100px]:flex" aria-label="Threadpull sections">
      <Link href="/" aria-label="Threadpull, investigation board" className="dash-plaque block px-2 py-1.5">
        <img src="/brand/threadpull-wordmark.png" alt="Threadpull" className="h-11 w-auto" draggable={false} />
      </Link>
      <p className="mt-5 px-3 text-[11px] font-semibold uppercase tracking-[0.16em] text-cream/60">The office</p>
      <nav className="mt-1.5 flex flex-col gap-1">
        <Link href={boardHref} className={`${item} text-cream/90 hover:bg-white/10`}>
          <Icon d="M4 5h16v11H4zM8 20h8M12 16v4M8 9l3 2 5-3" />
          Investigation board
        </Link>
        <Link href="/dashboard" aria-current="page" className={`${item} bg-[#f4ead8] font-semibold text-walnut shadow-[inset_3px_0_0_#b8913f,0_2px_4px_rgb(0_0_0/0.4)]`}>
          <Icon d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
          Portfolio
        </Link>
        <span className={`${item} cursor-not-allowed text-cream/55`} title="The CRO brief isn't built yet">
          <Icon d="M7 3.6h7l4 4V19c0 1-.5 1.5-1.5 1.5H7c-1 0-1.5-.5-1.5-1.5V5c0-1 .5-1.5 1.5-1.4zM14 3.6v4h4M9 12h6" />
          <span className="leading-tight">
            CRO brief
            <span className="block text-xs">not built yet</span>
          </span>
        </span>
      </nav>
      <div className="mt-auto flex gap-2.5 rounded-lg bg-black/25 p-2.5 text-[12px] leading-snug text-cream/90 ring-1 ring-[#b8913f]/40">
        <HazelAvatar pose="idle" size={56} className="h-14 w-14 shrink-0 self-start" />
        <p>
          <span className="font-semibold text-[#f0c27e]">Hazel&rsquo;s note.</span> This page only reads recorded data. A connection is a lead to check, not proof.
        </p>
      </div>
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
  const base = "rounded-md border px-3 py-2 text-[13px]";
  if (sample)
    items.push(
      <p key="sample" className={`${base} border-[#b8913f]/70 bg-honey/20 font-medium`}>
        SAMPLE RUN: a hand-written example with made-up loans. It is not an investigation, and none of these figures is a result.
      </p>,
    );
  else if (m && m.simulatedRows > 0)
    items.push(
      <p key="sim" className={`${base} border-terracotta/50 bg-terracotta/10 font-medium`}>
        This run includes simulated rows: {nf(m.simulatedRows)} of {nf(m.rows)} are made-up sample data, not real lookups.
      </p>,
    );
  if (events.state === "error" || events.state === "off" || loans.state === "error")
    items.push(
      <p key="err" role="status" className={`${base} border-walnut/30 bg-paper`}>
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
      <p key="rows" className={`${base} border-walnut/30 bg-paper`}>
        {events.data.invalid > 0 && `${events.data.invalid} rows didn't match the event contract and were left out. `}
        {events.data.truncated && "Only the first 2,000 rows of this run are counted."}
      </p>,
    );
  return items.length ? <div className="mt-3 space-y-2">{items}</div> : null;
}

function Kpi({ scope, label, value, note, children }: { scope: "Portfolio" | "This run"; label: string; value: string; note: string; children?: ReactNode }) {
  return (
    <article className="dossier flex min-h-[7rem] flex-col p-3.5 pt-4">
      <span className={`dossier-tab ${scope === "Portfolio" ? "dossier-tab-brass" : ""}`}>{scope}</span>
      <h2 className="text-[13px] font-semibold leading-tight">{label}</h2>
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
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-walnut/15 shadow-[inset_0_1px_2px_rgb(0_0_0/0.25)]" role="img" aria-label={`${nf(b.spent)} of ${nf(b.limit)} acorns spent`}>
          <div className="h-full rounded-full bg-gradient-to-b from-[#e7c77e] to-[#b8913f]" style={{ width: `${pct}%` }} />
        </div>
      )}
    </Kpi>
  );
}

// Hazel's desk: her illustration stands on the walnut edge at the bottom of her notes, so the notes read as hers.
function CaseNotesSection({ notes, run, events, boardHref, sample }: { notes: CaseNotes | null; run: RunMetrics | null; events: Load<unknown>; boardHref: string; sample: boolean }) {
  return (
    <section aria-labelledby="notes-title" className="mt-9 mb-1">
      <div className="dossier overflow-visible rounded-b-none pb-0">
        <span className="dossier-tab dossier-tab-brass">Case notes</span>
        <div className="grid grid-cols-1 items-end gap-x-4 min-[640px]:grid-cols-[13.5rem_minmax(0,1fr)]">
          <div className="relative order-2 -mt-2 flex flex-col min-[640px]:order-1 min-[640px]:-mt-9 min-[640px]:h-full min-[640px]:justify-between">
            <p className="brass-plate mx-auto mt-12 hidden w-fit rounded-[3px] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] min-[640px]:block">Hazel · Investigator</p>
            <Image
              src="/hazel/hazel-icon-logo.png"
              alt="Hazel, the squirrel investigator, holding a magnifying glass"
              width={1254}
              height={1254}
              sizes="216px"
              className="mx-auto block h-auto w-[13.5rem] max-w-full select-none drop-shadow-[0_6px_8px_rgb(0_0_0/0.28)] min-[640px]:-mb-px"
              draggable={false}
            />
          </div>
          <div className="order-1 px-4 pb-4 pt-4 min-[640px]:order-2 min-[640px]:pl-0">
            <div className="dossier-head flex flex-wrap items-baseline justify-between gap-2 pb-1.5">
              <h2 id="notes-title" className="font-display text-xl font-semibold">
                Hazel&rsquo;s Case Notes
              </h2>
              {run && <p className="text-[12px] text-walnut/70">{sample ? "Sample run" : `Run ${run.runId}`}</p>}
            </div>
            {!notes ? (
              <p className="mt-3 text-sm leading-relaxed">
                {noRun(events)} Hazel has nothing to report. Once a run is recorded, her notes on what she found, what it means and what&rsquo;s next will appear here.
              </p>
            ) : (
              <>
                <dl className="mt-2.5 grid grid-cols-1 gap-x-5 gap-y-2.5 min-[1500px]:grid-cols-3">
                  <Notebook label="What we found" lines={notes.found} />
                  <Notebook label="What it means" lines={notes.means} />
                  <Notebook label="What's next" lines={notes.next} />
                </dl>
                <Link href={boardHref} className="dash-pill dash-pill-dark mt-3 w-fit">
                  Open this run on the board
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
      <div className="desk-edge" aria-hidden />
    </section>
  );
}

function Notebook({ label, lines }: { label: string; lines: string[] }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.14em] text-terracotta">{label}</dt>
      <dd className="mt-0.5 space-y-1 text-[13px] leading-snug">
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </dd>
    </div>
  );
}

function Breakdown({ b, loans, run, seed }: { b: StatusBreakdown | null; loans: Load<unknown>; run: RunMetrics | null; seed: number }) {
  return (
    <section aria-labelledby="breakdown-title" className="dossier p-4 pt-4">
      <span className="dossier-tab dossier-tab-brass">Portfolio</span>
      <h2 id="breakdown-title" className="dossier-head pb-1.5 font-display text-lg font-semibold">
        Investigation breakdown
      </h2>
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
                <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-walnut/12 shadow-[inset_0_1px_2px_rgb(0_0_0/0.2)]" aria-hidden>
                  <div className={`h-full rounded-full ${BAR[s]}`} style={{ width: `${b.total ? (b.counts[s] / b.total) * 100 : 0}%` }} />
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-3 border-t border-dashed border-walnut/30 pt-3">
            <div className="flex items-baseline justify-between gap-2 text-[13px]">
              <span className="font-medium">Not reviewed</span>
              <span className="tabular-nums">
                {nf(b.counts["Not reviewed"])} <span className="text-walnut/70">· {b.total ? ((b.counts["Not reviewed"] / b.total) * 100).toFixed(1) : "0.0"}%</span>
              </span>
            </div>
            <div className="mt-1 h-2.5 overflow-hidden rounded-full bg-walnut/12 shadow-[inset_0_1px_2px_rgb(0_0_0/0.2)]" aria-hidden>
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

// The investigation method, as a numbered procedure.
function HowItWorks() {
  return (
    <section aria-labelledby="how-title" className="dossier p-4 pt-4">
      <span className="dossier-tab">Method</span>
      <h2 id="how-title" className="dossier-head pb-1.5 font-display text-lg font-semibold">
        How Threadpull works
      </h2>
      <ol className="mt-3">
        {STEPS.map(([name, text], i) => (
          <li key={name} className="relative flex gap-3 pb-3 last:pb-0">
            {i < STEPS.length - 1 && <span aria-hidden className="absolute left-[11px] top-6 bottom-0 w-px bg-[#b8913f]/60" />}
            <span aria-hidden className="z-10 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-gradient-to-b from-[#e7c77e] to-[#b8913f] text-[12px] font-bold text-[#2b1d0e] shadow-[0_1px_2px_rgb(0_0_0/0.35)]">
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
    <aside aria-labelledby="audit-title" className="dash-ledger m-3 flex min-h-0 min-w-0 flex-col p-4 pl-6 min-[1100px]:my-3 min-[1100px]:ml-0">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-terracotta">Activity log</p>
          <h2 id="audit-title" className="font-display text-xl font-semibold leading-tight">
            Audit trail
          </h2>
        </div>
        {sample && <span className="shrink-0 rounded-sm bg-honey/35 px-2 py-0.5 text-[11px] font-semibold">Sample</span>}
      </div>
      {!run ? (
        <p className="mt-3 text-sm text-walnut/80">{noRun(events)} Recorded steps, with where each came from, will be listed here.</p>
      ) : (
        <>
          <p className="mt-1.5 break-all text-[12px] text-walnut/80">
            Run {run.runId} · {nf(run.rows)} rows · {when(run.firstTs)} to {when(run.lastTs)}
          </p>
          <Link href={boardHref} className="dash-pill dash-pill-dark mt-2 w-fit">
            Open this run on the board
          </Link>
          <div className="mt-3 border-y border-dashed border-walnut/30 py-2 text-[12px] leading-snug">
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
          <h3 className="mt-3 text-[11px] font-semibold uppercase tracking-[0.14em] text-walnut/70">Latest steps, newest first</h3>
          <ol className="mt-2 min-h-0 flex-1 overflow-y-auto pr-1">
            {run.recent.map((e) => (
              <AuditRow key={e.seq} e={e} boardHref={boardHref} />
            ))}
          </ol>
          <p className="mt-2 border-t border-dashed border-walnut/30 pt-2 text-[12px] text-walnut/70">
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
    <li className="relative ml-1.5 border-l border-[#b8913f]/70 pb-3 pl-4 last:border-transparent last:pb-1">
      <span aria-hidden className={`absolute -left-[5px] top-1 h-[9px] w-[9px] rounded-full ring-2 ring-[#fffaf0] ${DOT[e.type] ?? "bg-walnut/50"}`} />
      <details className="group">
        <summary className="cursor-pointer list-none">
          <p className="flex flex-wrap items-center gap-x-2 text-[11.5px] tabular-nums text-walnut/70">
            <span>{when(e.ts)}</span>
            <span>seq {e.seq}</span>
            {e.simulated && <span className="rounded-sm bg-honey/35 px-1 font-semibold text-walnut">simulated</span>}
          </p>
          <p className="text-[13px] font-medium leading-snug">{d.title}</p>
          {d.detail && <p className="mt-0.5 line-clamp-2 text-[12px] text-walnut/80">{d.detail}</p>}
          <p className="mt-0.5 text-[11.5px] font-medium text-terracotta">
            <span className="group-open:hidden">Sources ▸</span>
            <span className="hidden group-open:inline">Sources ▾</span>
          </p>
        </summary>
        <div className="mt-1 rounded-sm bg-walnut/5 px-2.5 py-2 text-[12px]">
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
