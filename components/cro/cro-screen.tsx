"use client";
// The CRO screen (ticket 10): the acquisition case file Hazel's run produced, set as a memorandum. 01 the recommendation (the
// proposed bid, what stays out, and the one action), 02 why, 03 how the price is built, 04 where the risk sits, 05 the open
// questions, 06 what the investigation cost, 07 the memo, 08 every investigated loan, 09 the sources and assumptions behind
// every number. All figures come from GET /api/runs/{id}/report; a decision is POSTed to /api/dispositions and lands in the
// run's event log. Loading, the assumptions form and the decision call are unchanged by the redesign.
import { useCallback, useEffect, useState } from "react";
import type { Mirror } from "@/lib/deal/dispositions-db";
import type { ReportBundle, RunSummary } from "@/lib/deal/service";
import { AdaptPanel } from "./adapt";
import { DecisionDrawer, type Decide, type Scope } from "./decision-drawer";
import { Efficiency } from "./efficiency";
import { suggestRun } from "./findings";
import { plural } from "./format";
import { Masthead, RunOffer } from "./masthead";
import { MemoPanel } from "./memo";
import { Part } from "./part";
import { PriceLedger } from "./price-ledger";
import { QuestionsPanel } from "./questions";
import { Recommendation } from "./recommendation";
import { RiskTable } from "./risk-table";
import { LoansTable, Section } from "./sections";
import { SourceLedger } from "./source-ledger";
import { useRunDigests } from "./use-run-digests";
import { WhyRecommended } from "./why-recommended";
import styles from "./cro.module.css";

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
  const [drawer, setDrawer] = useState(false);
  const [scope, setScope] = useState<Scope>(null);
  const digests = useRunDigests(runs);

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

  const closeDrawer = useCallback(() => setDrawer(false), []);
  const openDrawer = (s: Scope = null) => { setScope(s); setDrawer(true); };
  const choose = (id: string) => { setNotice(null); setRunId(id); };
  const boardHref = runId ? `/board?run=${encodeURIComponent(runId)}` : "/board";
  const r = bundle?.report ?? null;
  return (
    <div className={styles.ground}>
      {/* the page behind the decision panel is inert while the panel is open */}
      <div inert={drawer}>
        <Masthead r={r} runs={runs} digests={digests} runId={runId} onRun={choose} boardHref={boardHref} />

        <main className={styles.sheet}>
          <RunOffer offer={suggestRun(digests, runId)} current={digests.find((d) => d.run_id === runId)} onSwitch={choose} />
          <div aria-live="polite" className="min-h-5 pt-4 text-[14.5px]">
            {notice ? <span className="font-semibold text-[#3f5233]">{notice}</span> : null}
            {error ? <span role="alert" className="font-semibold text-terracotta">{error}</span> : null}
          </div>

          {runs === null && !error ? <p className="py-10 text-[16px]">Loading runs…</p> : null}
          {runs && runs.length === 0 ? (
            <Part n="01" id="none-title" title="No run to review yet" first>
              <p className="max-w-2xl text-[16px]">A run is what Hazel writes to <code>runs/&lt;run_id&gt;/events.jsonl</code>. Make one with <code>bun run hazel --crs recorded</code> (needs an Anthropic key), or load a sample with <code>bun run eval/sample-run.ts</code> (no key needed; it says so on this screen).</p>
            </Part>
          ) : null}

          {r && bundle ? (
            <>
              <Recommendation r={r} onReview={() => openDrawer()} boardHref={boardHref} />
              <WhyRecommended r={r} />
              <PriceLedger r={r} busy={busy} inputs={inputs} setInputs={setInputs} onApply={apply} />
              <RiskTable r={r} onDecide={openDrawer} />
              <Section n="05" id="q-title" title="Questions for you" hint="Where the run could not decide and nobody had ruled on a case like it, it asked one person once. A yes becomes a rule that later runs apply on their own, citing it.">
                <QuestionsPanel runId={r.run_id} who={who} onAnswered={() => { if (runId) void load(runId, applied); }} />
              </Section>
              <Efficiency r={r} />
              <Section n="07" id="memo-title" title="Memo for the CRO" hint="Claude writes it from the report. Code keeps only the sentences it can check against the run's events, and shows the events behind each one.">
                <MemoPanel runId={r.run_id} lastSeq={r.run.last_seq} assumptions={applied} />
              </Section>
              <Section n="08" id="loans-title" title="Every investigated loan" hint={`${plural(r.totals.reviewed, "loan")} closed by the run. The other ${r.totals.not_reviewed.toLocaleString("en-US")} were not investigated and are counted at base price.`}>
                <LoansTable loans={r.loans} runId={r.run_id} />
              </Section>
              <SourceLedger r={r} />
              <details className="border-t border-walnut/30 py-6">
                <summary className={`${styles.note} inline-block text-[15.5px]`}>Adapting to a client: what a bank changes to fit this to its own policies and tapes</summary>
                <div className="mt-4"><AdaptPanel bundle={bundle} /></div>
              </details>
            </>
          ) : null}
        </main>
      </div>

      {bundle ? (
        <DecisionDrawer bundle={bundle} open={drawer} onClose={closeDrawer} onDecide={decide} busy={busy} who={who} setWho={setWho}
          scope={scope} clearScope={() => setScope(null)} />
      ) : null}
    </div>
  );
}
