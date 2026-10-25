"use client";
// The CRO memo on the CRO screen (ticket 14). Claude writes it; code keeps only the sentences it can check, so every sentence
// shown here carries the audit-log events behind it, and the ones that were left out are listed with the reason. The memo is a
// recommendation for a person to review, never a decision.
import { useCallback, useEffect, useState } from "react";
import type { Memo } from "@/lib/deal/memo";
import { eventRefs, pct, plural } from "./format";

const TITLES: Record<Memo["sentences"][number]["section"], string> = {
  decision: "Decision", findings: "What the run found", unverified: "What is not verified", money: "Money",
};
const ORDER = Object.keys(TITLES) as (keyof typeof TITLES)[];
type Stored = { memo: Memo; stale: boolean };

const when = (iso: string) => `${iso.slice(0, 10)} ${iso.slice(11, 16)} UTC`;

export function MemoView({ stored }: { stored: Stored }) {
  const { memo, stale } = stored;
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <p className="text-xs text-slate-500">
        Written by {memo.model} on {when(memo.written_at)} from the run's events up to #{memo.based_on_seq}, under assumed loss given default {pct(memo.assumptions.lgd)} and margin {pct(memo.assumptions.margin)}.
      </p>
      {stale ? <p role="status" className="mt-2 inline-block rounded-md bg-amber-50 px-3 py-1.5 text-sm text-amber-900 ring-1 ring-amber-200">The run has new events since this memo was written. Write it again to include them.</p> : null}
      {memo.sentences.length === 0 ? <p className="mt-4 text-sm text-slate-700">No sentence passed the checks, so there is nothing to show. Write the memo again.</p> : null}
      {ORDER.map((section) => {
        const own = memo.sentences.filter((s) => s.section === section);
        return own.length ? (
          <section key={section} className="mt-5">
            <h3 className="text-sm font-semibold text-slate-900">{TITLES[section]}</h3>
            <ul className="mt-1 space-y-2">
              {own.map((s, i) => (
                <li key={i} className="text-sm leading-6 text-slate-800">{s.text} <span className="whitespace-nowrap text-xs text-slate-500">({eventRefs(s.event_seqs)})</span></li>
              ))}
            </ul>
          </section>
        ) : null;
      })}
      {memo.basis ? <p className="mt-5 border-t border-slate-100 pt-3 text-sm text-slate-700"><b>Basis of this run:</b> {memo.basis.text} <span className="whitespace-nowrap text-xs text-slate-500">({eventRefs(memo.basis.event_seqs)})</span></p> : null}
      {memo.dropped.length ? (
        <details className="mt-4 text-sm text-slate-600">
          <summary className="cursor-pointer font-medium">{plural(memo.dropped.length, "sentence")} left out because code could not check {memo.dropped.length === 1 ? "it" : "them"}</summary>
          <ul className="mt-2 space-y-1 text-xs">{memo.dropped.map((d, i) => <li key={i}><b>{d.reason}:</b> {d.text}</li>)}</ul>
        </details>
      ) : null}
      <p className="mt-5 text-xs text-slate-500">A recommendation for a person to review. It is not a decision and not an action against any borrower. Prices are assumptions, not offers.</p>
    </article>
  );
}

/** `lastSeq` changes when the run's log does (a decision was recorded), so the panel asks again whether the saved memo is stale. */
export function MemoPanel({ runId, lastSeq, assumptions }: { runId: string; lastSeq: number; assumptions: { lgd: string; margin: string } }) {
  const [stored, setStored] = useState<Stored | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/runs/${encodeURIComponent(runId)}/memo`)
      .then(async (res) => (res.ok ? { found: true, body: await res.json() } : { found: false, body: null }))
      .then((r) => { if (live) setStored(r.found ? r.body : null); })
      .catch(() => { if (live) setStored(null); });
    return () => { live = false; };
  }, [runId, lastSeq]);

  const write = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/memo?lgd=${assumptions.lgd}&margin=${assumptions.margin}`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error ?? `The server answered HTTP ${res.status}.`);
      setStored(body);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [runId, assumptions.lgd, assumptions.margin]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" onClick={write} disabled={busy}
          className="rounded-md bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-700 disabled:opacity-50">
          {busy ? "Claude is writing the memo…" : stored ? "Write it again" : "Write the memo"}
        </button>
        <span className="text-xs text-slate-500">Uses the loss given default and margin shown under Proposed actions.</span>
      </div>
      <div aria-live="polite" className="mt-2 min-h-5 text-sm">{error ? <span role="alert" className="text-red-700">{error}</span> : null}</div>
      {stored ? <div className="mt-2"><MemoView stored={stored} /></div> : null}
    </div>
  );
}
