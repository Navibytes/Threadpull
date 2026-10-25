"use client";
// The three portfolio actions on the CRO screen (SKELETON section 3): Exclude, Reprice, Protect. Each shows what the run
// proposes, the drafts code wrote, and Approve / Override. Nothing is sent anywhere: a decision is recorded, a person sends.
import { useState } from "react";
import type { Verdict } from "@/lib/deal";
import type { ReportBundle } from "@/lib/deal/service";
import { eventRefs, plural, usd } from "./format";
import { Assumed, VerdictBadge } from "./sections";

export type Decide = (d: { loan_ids: string[]; decision: "approve" | "override"; final_verdict?: Verdict; reason?: string }) => Promise<string | null>;
type Row = ReportBundle["report"]["loans"][number];

const Panel = ({ title, summary, children }: { title: string; summary: string; children: React.ReactNode }) => (
  <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
    <h3 className="text-base font-semibold text-slate-900">{title}</h3>
    <p className="mt-1 text-sm text-slate-600">{summary}</p>
    <div className="mt-4 flex flex-1 flex-col gap-4">{children}</div>
  </div>
);

function LoanList({ rows }: { rows: Row[] }) {
  if (!rows.length) return <p className="text-sm text-slate-500">None in this run.</p>;
  return (
    <ul className="divide-y divide-slate-100 text-sm">
      {rows.map((l) => (
        <li key={l.loan_id} className="py-2">
          <div className="flex items-baseline justify-between gap-3"><b>{l.loan_id}</b><span className="tabular-nums">{usd(l.balance, true)}</span></div>
          <div className="text-slate-600">{l.reason ?? "no reason recorded"}</div>
          <div className="text-xs text-slate-500">{eventRefs(l.event_seqs)}{l.confirmed ? ` · ${l.confirmed.decision === "approve" ? "approved" : "overridden"} by ${l.confirmed.decided_by}` : ""}</div>
        </li>))}
    </ul>
  );
}

function Drafts({ title, items }: { title: string; items: { key: string; heading: string; text: string }[] }) {
  if (!items.length) return null;
  return (
    <div>
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{title}</div>
      {items.map((d) => (
        <details key={d.key} className="mt-2 rounded border border-slate-200 bg-slate-50 px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium text-slate-800">{d.heading}</summary>
          <pre className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-700">{d.text}</pre>
        </details>))}
    </div>
  );
}

function DecisionControls({ rows, choices, onDecide, busy, approveLabel }: { rows: Row[]; choices: Verdict[]; onDecide: Decide; busy: boolean; approveLabel: string }) {
  const pending = rows.filter((l) => !l.confirmed);
  const [open, setOpen] = useState(false);
  const [verdict, setVerdict] = useState<Verdict>(choices[0]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  if (!rows.length) return null;
  if (!pending.length) return <p className="text-sm font-medium text-emerald-800">All {plural(rows.length, "loan")} decided by a person.</p>;
  const ids = pending.map((l) => l.loan_id);
  const run = async (d: Parameters<Decide>[0]) => { setError(await onDecide(d)); if (d.decision === "override") setReason(""); };
  return (
    <div className="mt-auto border-t border-slate-100 pt-4">
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => run({ loan_ids: ids, decision: "approve" })}
          className="rounded-md bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">{approveLabel} ({ids.length})</button>
        <button type="button" disabled={busy} onClick={() => setOpen(!open)} aria-expanded={open}
          className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">Override…</button>
      </div>
      {open ? (
        <form className="mt-3 space-y-3 rounded-md bg-slate-50 p-3" onSubmit={(e) => { e.preventDefault(); void run({ loan_ids: ids, decision: "override", final_verdict: verdict, reason: reason.trim() }); }}>
          <label className="block text-sm font-medium text-slate-800">Instead, treat as
            <select value={verdict} onChange={(e) => setVerdict(e.target.value as Verdict)} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm">
              {choices.map((c) => <option key={c}>{c}</option>)}
            </select>
          </label>
          <label className="block text-sm font-medium text-slate-800">Reason (required, at least 10 characters)
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={2} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" />
          </label>
          <button type="submit" disabled={busy || reason.trim().length < 10} className="rounded-md bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">Record override</button>
        </form>) : null}
      {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

export function Actions({ bundle, busy, onDecide, inputs, setInputs, onApply }: {
  bundle: ReportBundle;
  busy: boolean;
  onDecide: Decide;
  inputs: { lgd: string; margin: string };
  setInputs: (v: { lgd: string; margin: string }) => void;
  onApply: () => void;
}) {
  const { report: r } = bundle;
  const by = (v: Verdict) => r.loans.filter((l) => l.verdict === v);
  const sum = (rows: Row[]) => rows.reduce((s, l) => s + l.balance, 0);
  const [ex, rp, rv] = [by("Exclude"), by("Reprice"), by("Review")];
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <Panel title="Exclude" summary={`${plural(ex.length, "loan")}, ${usd(sum(ex))} removed from the purchase; a buyback demand is drafted to each dealer.`}>
        <LoanList rows={ex} />
        <Drafts title="Buyback demands" items={bundle.buyback_demands.map((d) => ({ key: d.dealer_id, heading: `${d.dealer_name}: ${plural(d.loans.length, "loan")}, ${usd(d.total_balance, true)}`, text: d.text }))} />
        <DecisionControls rows={ex} choices={["Review", "Clear", "Reprice"]} onDecide={onDecide} busy={busy} approveLabel="Approve exclusion" />
      </Panel>

      <Panel title="Reprice" summary="Price scenarios from your assumptions. The tier table and the formula are the brief's; change the two inputs and recalculate.">
        <form className="grid grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); onApply(); }}>
          <label className="text-sm font-medium text-slate-800">Loss given default <Assumed />
            <input inputMode="decimal" value={inputs.lgd} onChange={(e) => setInputs({ ...inputs, lgd: e.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm tabular-nums" aria-describedby="assume-hint" />
          </label>
          <label className="text-sm font-medium text-slate-800">Margin <Assumed />
            <input inputMode="decimal" value={inputs.margin} onChange={(e) => setInputs({ ...inputs, margin: e.target.value })} className="mt-1 block w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm tabular-nums" aria-describedby="assume-hint" />
          </label>
          <p id="assume-hint" className="col-span-2 text-xs text-slate-500">Fractions between 0 and 1, e.g. 0.55 and 0.04.</p>
          <button type="submit" disabled={busy} className="col-span-2 rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">Recalculate the bid</button>
        </form>
        <p className="text-sm text-slate-700">Bid: <b className="tabular-nums">{usd(r.totals.proposed_price)}</b> <Assumed /></p>
        <p className="text-sm text-slate-600">{r.totals.unscored.toLocaleString("en-US")} of {r.totals.loans.toLocaleString("en-US")} loans have no credit score yet, so they are priced at the margin only. Tiers: 720+ 2%, 660-719 5%, 620-659 10%, 580-619 18%, below 580 28%.</p>
        <LoanList rows={rp} />
        <DecisionControls rows={rp} choices={["Clear", "Review", "Exclude"]} onDecide={onDecide} busy={busy} approveLabel="Approve repricing" />
      </Panel>

      <Panel title="Protect" summary={`${plural(rv.length, "loan")}, ${usd(sum(rv))} held out of the bid until one named person answers; hold the money back until the open cases close.`}>
        <LoanList rows={rv} />
        <Drafts title="Document requests" items={bundle.document_requests.map((d) => ({ key: d.loan_id, heading: `${d.loan_id} · ${d.dealer_name}`, text: d.text }))} />
        <DecisionControls rows={rv} choices={["Clear", "Reprice", "Exclude"]} onDecide={onDecide} busy={busy} approveLabel="Approve hold" />
      </Panel>
    </div>
  );
}
