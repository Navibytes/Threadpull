"use client";
// The CRO screen (ticket 10): what the run found, what it cost, what code proposes to do about it, and Approve / Override.
// Neutral on purpose: this is the page a risk officer signs from, separate from the cork board. All figures come from
// GET /api/runs/{id}/report; a decision is POSTed to /api/dispositions and lands in the run's event log.
import { useCallback, useEffect, useState } from "react";
import type { Mirror } from "@/lib/deal/dispositions-db";
import type { ReportBundle, RunSummary } from "@/lib/deal/service";
import { Actions, type Decide } from "./actions";
import { plural } from "./format";
import { MemoPanel } from "./memo";
import { AdaptPanel } from "./adapt";
import { QuestionsPanel } from "./questions";
import { Concentration, LoansTable, Section, Spend, Totals } from "./sections";

const DEFAULTS = { lgd: "0.55", margin: "0.04" };
/** The decision is always in the run's event log; say plainly what happened to the Supabase copy. */
const copyNote = (m?: Mirror) =>
  m?.status === "saved" ? " Also saved to Supabase." : m?.status === "failed" ? ` It is saved in the run's event log, but the Supabase copy failed: ${m.error}.` : "";

const isFraction = (s: string) => s.trim() !== "" && Number.isFinite(Number(s)) && Number(s) >= 0 && Number(s) <= 1;

export function CroScreen() {
  const [runs, setRuns] = useState<RunSummary[] | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [bundle, setBundle] = useState<ReportBundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [who, setWho] = useState("CRO");
  const [inputs, setInputs] = useState(DEFAULTS);
  const [applied, setApplied] = useState(DEFAULTS); // the assumptions the report on screen was built with

  useEffect(() => {
    fetch("/api/runs").then((r) => r.json()).then((list: RunSummary[]) => {
      setRuns(list);
      const wanted = new URLSearchParams(window.location.search).get("run");
      // a run named in the link is shown even when this server has no files for it (a fresh run on a deployment is read
      // from Supabase); it is added to the picker
      if (wanted && !list.some((r) => r.run_id === wanted)) setRuns([{ run_id: wanted, started_at: null, crs: null, note: null, events: 0 }, ...list]);
      setRunId(wanted ?? list[0]?.run_id ?? null);
    }).catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  const load = useCallback(async (id: string, a: typeof DEFAULTS) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(id)}/report?lgd=${a.lgd}&margin=${a.margin}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      setBundle(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, []);
  useEffect(() => { if (runId) void load(runId, applied); }, [runId, applied, load]);

  const apply = () => {
    if (!isFraction(inputs.lgd) || !isFraction(inputs.margin)) return setError("Loss given default and margin must be numbers between 0 and 1.");
    setApplied({ lgd: inputs.lgd.trim(), margin: inputs.margin.trim() });
  };

  const decide: Decide = async (d) => {
    if (!runId) return "No run is selected.";
    setBusy(true);
    try {
      const res = await fetch("/api/dispositions", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: runId, decided_by: who.trim() || "CRO", ...d }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return (body as { error?: string }).error ?? `The server answered HTTP ${res.status}.`;
      setNotice(`Recorded: ${d.decision === "approve" ? "approved" : "overrode"} ${plural(d.loan_ids.length, "loan")} as ${who.trim() || "CRO"}.${copyNote((body as { mirror?: Mirror }).mirror)}`);
      await load(runId, applied);
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    } finally {
      setBusy(false);
    }
  };

  const note = bundle?.report.run.note ?? "";
  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-wrap items-end justify-between gap-4 px-6 py-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Threadpull · portfolio acquisition review</p>
            <h1 className="mt-1 text-2xl font-semibold">CRO review</h1>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <label className="text-sm font-medium text-slate-700">Run
              <select value={runId ?? ""} onChange={(e) => { setNotice(null); setRunId(e.target.value); }} disabled={!runs?.length}
                className="mt-1 block min-w-56 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
                {runs?.map((r) => <option key={r.run_id} value={r.run_id}>{r.run_id}</option>)}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">Deciding as
              <input value={who} onChange={(e) => setWho(e.target.value)} maxLength={80} className="mt-1 block w-40 rounded-md border border-slate-300 px-2 py-1.5 text-sm" />
            </label>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 pb-20 pt-6">
        <p className="max-w-4xl text-sm text-slate-600">
          A recommendation for a person to check, never an automatic purchase decision. Prices marked <b>assumed</b> come from
          the brief's tier table and your inputs. Each figure shows the audit-log events it comes from.
        </p>
        {note ? <p className="mt-3 inline-block rounded-md bg-amber-50 px-3 py-1.5 text-sm text-amber-900 ring-1 ring-amber-200">{note}</p> : null}
        <div aria-live="polite" className="mt-3 min-h-5 text-sm">
          {notice ? <span className="text-emerald-800">{notice}</span> : null}
          {error ? <span role="alert" className="text-red-700">{error}</span> : null}
        </div>

        {runs === null && !error ? <p className="mt-8 text-slate-600">Loading runs…</p> : null}
        {runs && runs.length === 0 ? (
          <div className="mt-8 max-w-2xl rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">No run to review yet</h2>
            <p className="mt-2 text-sm text-slate-600">A run is what Hazel writes to <code>runs/&lt;run_id&gt;/events.jsonl</code>. Make one with <code>bun run hazel --crs recorded</code> (needs an Anthropic key), or load a sample with <code>bun run eval/sample-run.ts</code> (no key needed; it says so on this screen).</p>
          </div>
        ) : null}

        {bundle ? (
          <>
            <Section title="The deal" hint="What the bank is buying, what code proposes to pay, and how much of it is flagged.">
              <Totals r={bundle.report} />
            </Section>
            <Section title="What the investigation cost" hint="Acorns are the run's budget. The comparison is arithmetic over the tool price list, not a second run.">
              <Spend r={bundle.report} />
            </Section>
            <Section title="Where the risk sits" hint="Loans the run flagged, grouped by dealer and by the links that still join them.">
              <Concentration r={bundle.report} />
            </Section>
            <Section title="Memo for the CRO" hint="Claude writes it from the report. Code keeps only the sentences it can check against the run's events, and shows the events behind each one.">
              <MemoPanel runId={bundle.report.run_id} lastSeq={bundle.report.run.last_seq} assumptions={applied} />
            </Section>
            <Section title="Questions for you" hint="Where the run could not decide and nobody had ruled on a case like it, it asked one person once. A yes becomes a rule that later runs apply on their own, citing it.">
              <QuestionsPanel runId={bundle.report.run_id} who={who} onAnswered={() => { if (runId) void load(runId, applied); }} />
            </Section>
            <Section title="Proposed actions" hint="Code proposes; you decide. Approve keeps the proposal, Override replaces it and needs a reason. Every decision is recorded in the run's event log.">
              <Actions bundle={bundle} busy={busy} onDecide={decide} inputs={inputs} setInputs={setInputs} onApply={apply} />
            </Section>
            <Section title="Every investigated loan" hint={`${plural(bundle.report.totals.reviewed, "loan")} closed by the run. The other ${bundle.report.totals.not_reviewed.toLocaleString("en-US")} were not investigated and are counted at base price.`}>
              <LoansTable loans={bundle.report.loans} runId={bundle.report.run_id} />
            </Section>
            <Section title="Adapting to a client" hint="Configured, not retrained: what a bank changes to fit this to its own policies, tapes and documents, and what this run used.">
              <AdaptPanel bundle={bundle} />
            </Section>
          </>
        ) : null}
      </main>
    </div>
  );
}
