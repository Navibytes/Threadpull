"use client";
// "Why this verdict?" under a loan on the CRO screen (ticket 14): the answer GET /api/runs/{id}/why/{loan_id} builds from the run's
// own events, one line per event with its number. No model wrote it. A run with no event for the loan is refused, and the screen says so.
import { useEffect, useState } from "react";
import type { Why } from "@/lib/deal/why";

export function WhyView({ why }: { why: Why }) {
  return (
    <div>
      <p className="text-sm text-walnut">{why.answer}</p>
      <ol className="mt-2 space-y-1 text-xs text-walnut/90">
        {why.steps.map((s) => (
          <li key={s.seq}><span className="tabular-nums text-walnut/80">#{s.seq}</span> <b className="font-semibold">{s.type}</b>{s.tool ? ` · ${s.tool}` : ""}{s.note ? ` — ${s.note}` : ""}</li>
        ))}
      </ol>
    </div>
  );
}

type State = { why: Why } | { error: string } | null;

export function WhyDetail({ runId, loanId }: { runId: string; loanId: string }) {
  const [state, setState] = useState<State>(null);
  useEffect(() => {
    let live = true;
    setState(null);
    fetch(`/api/runs/${encodeURIComponent(runId)}/why/${encodeURIComponent(loanId)}`)
      .then(async (res) => {
        const body = await res.json();
        if (live) setState(res.ok ? { why: body } : { error: body.error ?? res.statusText });
      })
      .catch((e) => { if (live) setState({ error: e instanceof Error ? e.message : String(e) }); });
    return () => { live = false; };
  }, [runId, loanId]);
  if (!state) return <p className="text-sm text-walnut/85">Reading the events…</p>;
  if ("error" in state) return <p role="alert" className="text-sm text-terracotta">{state.error}</p>;
  return <WhyView why={state.why} />;
}
