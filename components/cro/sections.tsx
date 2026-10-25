// The CRO screen's read-only sections (ticket 10): totals, spend against checking everything, where the risk sits, every
// investigated loan. Neutral styling, separate from the cork board. Every figure shows the event rows it comes from.
import { Fragment, useState } from "react";
import type { DealReport, LoanRow, Verdict } from "@/lib/deal";
import { eventRefs, eventRefsShort, pct, plural, usd } from "./format";
import { WhyDetail } from "./why";

export const VERDICT_STYLE: Record<Verdict, string> = {
  Exclude: "bg-red-50 text-red-800 ring-red-200",
  Review: "bg-amber-50 text-amber-900 ring-amber-200",
  Reprice: "bg-sky-50 text-sky-800 ring-sky-200",
  Clear: "bg-emerald-50 text-emerald-800 ring-emerald-200",
};
export const VerdictBadge = ({ verdict }: { verdict: Verdict }) => (
  <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ${VERDICT_STYLE[verdict]}`}>{verdict === "Exclude" ? "Exclude + buyback" : verdict}</span>
);
export const Assumed = () => <span className="ml-1.5 rounded bg-slate-100 px-1.5 py-0.5 align-middle text-[10px] font-semibold uppercase tracking-wide text-slate-600">assumed</span>;

export const Section = ({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) => (
  <section className="mt-10">
    <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
    {hint ? <p className="mt-1 max-w-3xl text-sm text-slate-600">{hint}</p> : null}
    <div className="mt-4">{children}</div>
  </section>
);

function Card({ label, value, note, refs, assumed }: { label: string; value: string; note?: string; refs?: number[]; assumed?: boolean }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}{assumed ? <Assumed /> : null}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{value}</div>
      {note ? <div className="mt-1 text-sm text-slate-600">{note}</div> : null}
      {refs ? <div className="mt-2 text-xs text-slate-500" title={eventRefs(refs)}>{refs.length ? `from ${eventRefsShort(refs)}` : "nothing here, so nothing to cite"}</div> : null}
    </div>
  );
}

export function Totals({ r }: { r: DealReport }) {
  const t = r.totals;
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
      <Card label="Total principal" value={usd(t.total_principal)} note={`${t.loans.toLocaleString("en-US")} loans, ${plural(t.reviewed, "loan")} investigated`} />
      <Card label="Proposed bid" assumed value={usd(t.proposed_price)} note={`${plural(t.bid_loans, "loan")}, ${pct(t.proposed_price / t.total_principal)} of principal`} />
      <Card label="Balance under review" value={usd(t.balance_under_review)} note="loans the run flagged, not yet decided" refs={r.refs.balance_under_review} />
      <Card label="Excluded" value={usd(t.excluded_balance)} note={plural(t.counts.Exclude, "loan")} refs={r.refs.excluded} />
      <Card label="Held out of the bid" value={usd(t.held_out_balance)} note={`${plural(t.counts.Review, "loan")} waiting for a person`} refs={r.refs.held_out} />
    </div>
  );
}

export function Spend({ r }: { r: DealReport }) {
  const s = r.spend;
  const share = s.check_everything ? Math.min(1, s.spent / s.check_everything) : 0;
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div className="text-2xl font-semibold tabular-nums">{s.spent} acorns <span className="text-base font-normal text-slate-600">spent{s.limit ? ` of ${s.limit}` : ""}</span></div>
        <div className="text-sm text-slate-600">checking every case loan with every CRS tool would be <b className="tabular-nums text-slate-900">{s.check_everything}</b> acorns<Assumed /></div>
      </div>
      <div className="mt-3 h-3 overflow-hidden rounded-full bg-slate-100" role="img" aria-label={`${s.spent} of ${s.check_everything} acorns`}>
        <div className="h-full rounded-full bg-slate-800" style={{ width: `${Math.max(share * 100, s.spent ? 2 : 0)}%` }} />
      </div>
      <p className="mt-3 text-sm text-slate-700">Saved <b className="tabular-nums">{s.saved}</b> acorns: {plural(s.case_loans, "case loan")} × {s.per_case_loan} acorns for the four CRS tools, from the tool price list. Real spend comes from the run's budget rows ({eventRefsShort(s.event_seqs, 4)}).</p>
      {s.by_tool.length ? (
        <table className="mt-3 text-sm">
          <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="pr-8 font-medium">Tool</th><th className="pr-8 font-medium">Calls</th><th className="font-medium">Acorns</th></tr></thead>
          <tbody>{s.by_tool.map((t) => <tr key={t.tool}><td className="pr-8">{t.tool}</td><td className="pr-8 tabular-nums">{t.calls}</td><td className="tabular-nums">{t.acorns}</td></tr>)}</tbody>
        </table>
      ) : null}
    </div>
  );
}

export function Concentration({ r }: { r: DealReport }) {
  const { by_dealer, rings } = r.concentration;
  const inRing = new Set(rings.flatMap((g) => g.loan_ids));
  const alone = r.loans.filter((l) => l.hazel_status === "Investigate" && !inRing.has(l.loan_id)).map((l) => l.loan_id);
  if (!by_dealer.length) return <p className="text-sm text-slate-600">The run flagged no loans, so there is nothing to concentrate.</p>;
  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <caption className="px-4 pt-3 text-left text-xs font-medium uppercase tracking-wide text-slate-500">By dealer</caption>
          <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500"><th className="px-4 py-2 font-medium">Dealer</th><th className="px-4 py-2 font-medium">Flagged</th><th className="px-4 py-2 font-medium">Balance</th><th className="px-4 py-2 font-medium">Share of its book</th></tr></thead>
          <tbody>{by_dealer.map((d) => (
            <tr key={d.dealer_id} className="border-t border-slate-100">
              <td className="px-4 py-2"><div className="font-medium">{d.dealer_name}</div><div className="text-xs text-slate-500">{d.dealer_id} · {eventRefsShort(d.event_seqs, 2)}</div></td>
              <td className="px-4 py-2 tabular-nums">{d.flagged_loans}</td>
              <td className="px-4 py-2 tabular-nums">{usd(d.flagged_balance)}</td>
              <td className="px-4 py-2 tabular-nums">{pct(d.share)} <span className="text-xs text-slate-500">of {usd(d.dealer_balance)}</span></td>
            </tr>))}</tbody>
        </table>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">By ring</div>
        {rings.length ? rings.map((g) => (
          <div key={g.ring_id} className="mt-3 border-t border-slate-100 pt-3 first:mt-2 first:border-0 first:pt-0">
            <div className="flex items-baseline justify-between"><b>{g.ring_id}</b><span className="tabular-nums">{usd(g.balance)}</span></div>
            <div className="mt-1 text-sm text-slate-700">{g.loan_ids.join(", ")}</div>
            <div className="mt-1 text-xs text-slate-500">{g.dealers.join(", ")} · joined by {plural(g.edge_ids.length, "link")} nobody has taken down · {eventRefsShort(g.event_seqs, 4)}</div>
          </div>)) : <p className="mt-2 text-sm text-slate-600">No two investigated loans are still joined by an open link.</p>}
        {alone.length ? (
          <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-500">
            {alone.join(", ")} {alone.length === 1 ? "was" : "were"} flagged on {alone.length === 1 ? "its" : "their"} own evidence, not through a recorded link to another flagged loan, so {alone.length === 1 ? "it is" : "they are"} in no ring.
          </p>) : null}
      </div>
    </div>
  );
}

/** `runId` switches on "Why this verdict?" under each loan, answered from the run's events (ticket 14). */
export function LoansTable({ loans, runId }: { loans: LoanRow[]; runId?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!loans.length) return <p className="text-sm text-slate-600">The run has not closed any loan yet.</p>;
  return (
    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead><tr className="text-left text-xs uppercase tracking-wide text-slate-500">
          {["Loan", "Dealer", "Balance", "Status", "Verdict", "Why", "Evidence"].map((h) => <th key={h} className="px-4 py-2 font-medium">{h}</th>)}
        </tr></thead>
        <tbody>{loans.map((l) => (
          <Fragment key={l.loan_id}>
            <tr className="border-t border-slate-100 align-top">
              <td className="px-4 py-2 font-medium">{l.loan_id}</td>
              <td className="px-4 py-2">{l.dealer_name}</td>
              <td className="px-4 py-2 tabular-nums">{usd(l.balance, true)}</td>
              <td className="px-4 py-2">{l.status}{l.confirmed ? <div className="text-xs text-slate-500">{l.confirmed.decision === "approve" ? "approved" : "overridden"} by {l.confirmed.decided_by}</div> : null}</td>
              <td className="px-4 py-2"><VerdictBadge verdict={l.verdict} />{l.confirmed?.reason ? <div className="mt-1 max-w-[16rem] text-xs text-slate-600">{l.confirmed.reason}</div> : null}</td>
              <td className="px-4 py-2 text-slate-700">{l.reason ?? "no reason recorded"}</td>
              <td className="px-4 py-2 text-xs text-slate-600">{eventRefs(l.event_seqs)}{l.request_ids.map((id) => <div key={id} title="CRS RequestID">CRS {id.slice(0, 8)}…</div>)}
                {runId ? <button type="button" aria-expanded={open === l.loan_id} onClick={() => setOpen(open === l.loan_id ? null : l.loan_id)}
                  className="mt-1 block font-medium text-slate-800 underline underline-offset-2 hover:text-slate-950">{open === l.loan_id ? "Hide" : "Why this verdict?"}</button> : null}</td>
            </tr>
            {runId && open === l.loan_id ? <tr className="bg-slate-50"><td colSpan={7} className="px-4 py-3"><WhyDetail runId={runId} loanId={l.loan_id} /></td></tr> : null}
          </Fragment>))}</tbody>
      </table>
    </div>
  );
}
