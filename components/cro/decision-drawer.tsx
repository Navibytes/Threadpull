"use client";
// "Review & Decide": the panel where a CRO acts on the proposal. It says exactly what is being approved (the run, the
// snapshot of its audit log, the pricing assumptions and the loans), keeps what code proposed apart from what a person
// has decided, and asks for an explicit confirmation before an approval is recorded. Nothing is decided here that the
// existing route did not already allow: the same `onDecide` posts to /api/dispositions, the same override rules apply
// (a verdict to use instead and a reason of at least 10 characters), and every decision lands in the run's event log.
// Nothing is sent to a dealer: the drafts are text for a person to send.
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Verdict } from "@/lib/deal";
import type { ReportBundle } from "@/lib/deal/service";
import { reconcile, reviewState, REVIEW_LABEL } from "./figures";
import { eventRefs, pct, plural, usd } from "./format";
import { VerdictBadge } from "./sections";
import styles from "./cro.module.css";

export type Decide = (d: { loan_ids: string[]; decision: "approve" | "override"; final_verdict?: Verdict; reason?: string }) => Promise<string | null>;
type Row = ReportBundle["report"]["loans"][number];

/** A scope narrows the drawer to the loans of one ring or dealer ("decide from this ring"). */
export type Scope = { label: string; loanIds: readonly string[] } | null;

// The word beside each verdict in the override menu; the value sent to the route is unchanged. "Clear" is never offered as a word: it is "not flagged".
const CHOICE_WORDS: Record<Verdict, string> = { Exclude: "Exclude", Review: "Hold for a person (Review)", Reprice: "Reprice", Clear: "Not flagged (Clear)" };
const sum = (rows: Row[]) => rows.reduce((s, l) => s + l.balance, 0);
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';

function LoanRows({ rows }: { rows: Row[] }) {
  if (!rows.length) return <p className="text-[15px] text-walnut/80">No loans here.</p>;
  return (
    <ul className="divide-y divide-walnut/10">
      {rows.map((l) => (
        <li key={l.loan_id} className="py-2.5">
          <div className="flex items-baseline justify-between gap-3">
            <span className="font-semibold tabular-nums">{l.loan_id}</span>
            <span className="tabular-nums">{usd(l.balance, true)}</span>
          </div>
          <p className="mt-0.5 text-[14.5px] leading-snug text-walnut/90">{l.reason ?? "No reason recorded."}</p>
          <p className="mt-1 text-[13.5px] text-walnut/80">
            {l.confirmed ? (
              <span className="font-semibold text-[#3f5233]">Human decision: {l.confirmed.decision === "approve" ? "approved" : `overridden to ${l.confirmed.final_verdict}`} by {l.confirmed.decided_by}</span>
            ) : (
              <span className="font-semibold">AI proposal, not yet decided</span>
            )}
            {" · "}
            {l.dealer_name} · {eventRefs(l.event_seqs)}
          </p>
        </li>
      ))}
    </ul>
  );
}

function Drafts({ title, items }: { title: string; items: { key: string; heading: string; text: string }[] }) {
  if (!items.length) return null;
  return (
    <div>
      <p className="text-[13px] font-semibold uppercase tracking-[0.08em] text-walnut/80">{title} (drafts, nothing is sent)</p>
      {items.map((d) => (
        <details key={d.key} className="mt-2 rounded-sm border border-walnut/15 bg-walnut/[0.04] px-3 py-2">
          <summary className="cursor-pointer text-[14.5px] font-semibold">{d.heading}</summary>
          <pre className="mt-2 whitespace-pre-wrap text-[13.5px] leading-relaxed text-walnut/90">{d.text}</pre>
        </details>
      ))}
    </div>
  );
}

/** Approve (with a confirmation step) or override (a verdict and a reason) for the loans in a group that nobody has decided. */
function Controls({ rows, choices, onDecide, busy, approveLabel, impact, who }: {
  rows: Row[]; choices: Verdict[]; onDecide: Decide; busy: boolean; approveLabel: string; impact: string; who: string;
}) {
  const pending = rows.filter((l) => !l.confirmed);
  const [step, setStep] = useState<"idle" | "confirm" | "override">("idle");
  const [verdict, setVerdict] = useState<Verdict>(choices[0]);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (step === "confirm") confirmRef.current?.focus(); }, [step]);
  if (!rows.length) return null;
  if (!pending.length) return <p className="text-[15px] font-semibold text-[#3f5233]">All {plural(rows.length, "loan")} decided by a person.</p>;
  const ids = pending.map((l) => l.loan_id);
  const name = who.trim() || "CRO";
  const run = async (d: Parameters<Decide>[0]) => {
    const err = await onDecide(d);
    setError(err);
    if (!err) { setStep("idle"); setReason(""); }
  };
  return (
    <div className="border-t border-walnut/15 pt-4">
      {step === "idle" ? (
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={busy} onClick={() => { setError(null); setStep("confirm"); }} className={styles.primary}>
            {approveLabel} ({ids.length})…
          </button>
          <button type="button" disabled={busy} onClick={() => { setError(null); setStep("override"); }} className={styles.secondary}>Override…</button>
        </div>
      ) : null}

      {step === "confirm" ? (
        <div role="group" aria-label="Confirm approval" className="rounded-sm border-2 border-walnut/70 bg-paper p-4">
          <p className="text-[15.5px] font-semibold">Approve the proposal for {plural(ids.length, "loan")}, {usd(sum(pending), true)}?</p>
          <p className="mt-1 text-[14.5px] leading-snug text-walnut/90">{impact}</p>
          <p className="mt-2 text-[14.5px] leading-snug text-walnut/90">
            This records <b>{name}</b>'s decision in the run's audit log. The loans then read “Human-confirmed disposition”. It cannot be undone on this screen, and nothing is sent to anyone.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button ref={confirmRef} type="button" disabled={busy} onClick={() => void run({ loan_ids: ids, decision: "approve" })} className={styles.primary}>
              Yes, record {name}'s approval
            </button>
            <button type="button" disabled={busy} onClick={() => setStep("idle")} className={styles.secondary}>Go back</button>
          </div>
        </div>
      ) : null}

      {step === "override" ? (
        <form className="space-y-3 rounded-sm border border-walnut/25 bg-walnut/[0.04] p-4" onSubmit={(e) => { e.preventDefault(); void run({ loan_ids: ids, decision: "override", final_verdict: verdict, reason: reason.trim() }); }}>
          <p className="text-[14.5px] text-walnut/90">Overriding {plural(ids.length, "loan")}, {usd(sum(pending), true)}, as {name}. The reason is kept in the audit log.</p>
          <label className="block text-[14.5px] font-semibold">Instead, treat as
            <select value={verdict} onChange={(e) => setVerdict(e.target.value as Verdict)} className="mt-1 block w-full rounded-sm border border-walnut/35 bg-paper px-2 py-2 text-[15px] font-normal">
              {choices.map((c) => <option key={c} value={c}>{CHOICE_WORDS[c]}</option>)}
            </select>
          </label>
          <label className="block text-[14.5px] font-semibold">Reason (required, at least 10 characters)
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className="mt-1 block w-full rounded-sm border border-walnut/35 bg-paper px-2 py-2 text-[15px] font-normal" />
          </label>
          <div className="flex flex-wrap gap-2">
            <button type="submit" disabled={busy || reason.trim().length < 10} className={styles.primary}>Record override</button>
            <button type="button" disabled={busy} onClick={() => setStep("idle")} className={styles.secondary}>Cancel</button>
          </div>
        </form>
      ) : null}
      {error ? <p role="alert" className="mt-2 text-[14.5px] font-semibold text-terracotta">{error}</p> : null}
    </div>
  );
}

function Group({ title, state, summary, children }: { title: string; state: string; summary: string; children: ReactNode }) {
  return (
    <section className="border-t-2 border-walnut/80 pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-display text-[1.35rem] font-semibold">{title}</h3>
        <span className="text-[13.5px] font-semibold text-walnut/85">{state}</span>
      </div>
      <p className="mt-1 text-[15px] leading-snug text-walnut/90">{summary}</p>
      <div className="mt-3 space-y-4">{children}</div>
    </section>
  );
}

const stateOf = (rows: Row[]) => {
  if (!rows.length) return "Nothing to decide";
  const done = rows.filter((l) => l.confirmed).length;
  return done === 0 ? "AI-proposed · awaiting review" : done === rows.length ? "Human-confirmed" : `${done} of ${rows.length} confirmed by a person`;
};

export function DecisionDrawer({ bundle, open, onClose, onDecide, busy, who, setWho, scope, clearScope }: {
  bundle: ReportBundle; open: boolean; onClose: () => void; onDecide: Decide; busy: boolean; who: string; setWho: (v: string) => void;
  scope: Scope; clearScope: () => void;
}) {
  const r = bundle.report;
  const titleId = useId();
  const panel = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  // focus moves in when it opens, stays inside while it is open, and goes back to what opened it when it closes
  useEffect(() => {
    if (!open) return;
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    heading.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onClose(); return; }
      if (e.key !== "Tab" || !panel.current) return;
      const items = [...panel.current.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.offsetParent !== null || el === document.activeElement);
      if (!items.length) return;
      const [first, last] = [items[0], items[items.length - 1]];
      if (e.shiftKey && (document.activeElement === first || document.activeElement === heading.current)) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      opener.current?.focus();
    };
  }, [open, onClose]);

  if (!open) return null;
  const inScope = (l: Row) => !scope || scope.loanIds.includes(l.loan_id);
  const by = (v: Verdict) => r.loans.filter((l) => l.verdict === v && inScope(l));
  const [ex, rp, rv] = [by("Exclude"), by("Reprice"), by("Review")];
  const restReprice = Math.max(0, r.totals.counts.Reprice - r.loans.filter((l) => l.verdict === "Reprice").length);
  const review = reviewState(r.loans);
  const a = r.assumptions;
  const x = reconcile(r);
  const money = (n: number) => usd(n, true);
  const loansOf = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "loan" : "loans"}`;
  return (
    <div className={styles.layer}>
      <div className={styles.scrim} onClick={onClose} aria-hidden />
      <div ref={panel} role="dialog" aria-modal="true" aria-labelledby={titleId} className={styles.drawer}>
        <div className="flex items-start justify-between gap-3 border-b border-walnut/20 bg-paper px-5 py-4">
          <div>
            <p className="text-[13px] font-semibold uppercase tracking-[0.1em] text-terracotta">Decision for the CRO</p>
            <h2 id={titleId} ref={heading} tabIndex={-1} className="font-display text-[1.7rem] font-semibold leading-tight outline-none">Review &amp; Decide</h2>
            <p className="mt-1 text-[14.5px] font-semibold text-walnut/90">{REVIEW_LABEL[review.state]}{review.total ? ` · ${review.confirmed} of ${review.total} decided` : ""}</p>
          </div>
          <button type="button" onClick={onClose} className={styles.secondary} aria-label="Close the decision panel">Close <span aria-hidden>✕</span></button>
        </div>

        <div className="space-y-6 overflow-y-auto px-5 py-5">
          <section aria-label="What you are approving" className="rounded-sm border border-walnut/20 bg-paper p-4">
            <h3 className="text-[13px] font-semibold uppercase tracking-[0.1em] text-walnut/85">What you are approving</h3>
            <dl className="mt-2 grid grid-cols-[7.5rem_minmax(0,1fr)] gap-x-3 gap-y-1.5 text-[14.5px]">
              <dt className="text-walnut/80">Run</dt><dd className="break-all font-semibold tabular-nums">{r.run_id}</dd>
              <dt className="text-walnut/80">Snapshot</dt><dd>{r.run.events.toLocaleString("en-US")} audit-log events, up to event #{r.run.last_seq}{r.run.model ? ` · written with ${r.run.model}` : ""}</dd>
              <dt className="text-walnut/80">In the bid</dt><dd className="tabular-nums"><b>{loansOf(x.loans.inBid)}</b> · principal {money(x.inBid)} · proposed bid <b>{money(x.bid)}</b> <span className="font-semibold">(assumed)</span></dd>
              <dt className="text-walnut/80">Excluded</dt><dd className="tabular-nums"><b>{loansOf(x.loans.excluded)}</b> · {money(x.excluded)}</dd>
              <dt className="text-walnut/80">Held</dt><dd className="tabular-nums"><b>{loansOf(x.loans.held)}</b> · {money(x.held)}, out of the bid until a person answers</dd>
              <dt className="text-walnut/80">Assumptions</dt><dd>Loss given default {pct(a.lgd, 0)} · margin {pct(a.margin, 0)} <span className="font-semibold">(assumed, not market prices)</span></dd>
              {r.run.note ? <><dt className="text-walnut/80">Data</dt><dd>{r.run.note}</dd></> : null}
            </dl>
            <label className="mt-3 block text-[14.5px] font-semibold">Deciding as (name recorded with every decision)
              <input value={who} onChange={(e) => setWho(e.target.value)} maxLength={80} className="mt-1 block w-full max-w-xs rounded-sm border border-walnut/35 bg-paper px-2 py-2 text-[15px] font-normal" />
            </label>
          </section>

          {scope ? (
            <p className="flex flex-wrap items-center justify-between gap-2 rounded-sm bg-honey/20 px-3 py-2 text-[14.5px] font-semibold">
              <span>Showing only the loans in {scope.label} ({scope.loanIds.length}).</span>
              <button type="button" onClick={clearScope} className="underline underline-offset-4">Show every loan</button>
            </p>
          ) : null}

          <Group title="Exclude" state={stateOf(ex)} summary={`${plural(ex.length, "loan")}, ${usd(sum(ex), true)} removed from the purchase. A buyback demand is drafted for each dealer.`}>
            <LoanRows rows={ex} />
            <Drafts title="Buyback demands" items={bundle.buyback_demands.map((d) => ({ key: d.dealer_id, heading: `${d.dealer_name}: ${plural(d.loans.length, "loan")}, ${usd(d.total_balance, true)}`, text: d.text }))} />
            <Controls rows={ex} choices={["Review", "Clear", "Reprice"]} onDecide={onDecide} busy={busy} approveLabel="Approve exclusion" who={who}
              impact="These loans stay out of the bid and the proposed buyback demands apply to the dealers that sold them." />
          </Group>

          <Group title="Reprice" state={stateOf(rp)} summary={`${plural(rp.length, "investigated loan")} priced down for credit risk; the bid is ${usd(r.totals.proposed_price)} (assumed).${restReprice ? ` ${plural(restReprice, "more loan")} ${restReprice === 1 ? "is" : "are"} priced down by credit score alone; they were not investigated, so there is nothing to approve for them.` : ""}`}>
            <LoanRows rows={rp} />
            <Controls rows={rp} choices={["Clear", "Review", "Exclude"]} onDecide={onDecide} busy={busy} approveLabel="Approve repricing" who={who}
              impact="These loans stay in the bid at the lower, assumed price shown on the page." />
          </Group>

          <Group title="Protect" state={stateOf(rv)} summary={`${plural(rv.length, "loan")}, ${usd(sum(rv), true)} held out of the bid until one named person answers. Hold the money back until the open cases close.`}>
            <LoanRows rows={rv} />
            <Drafts title="Document requests" items={bundle.document_requests.map((d) => ({ key: d.loan_id, heading: `${d.loan_id} · ${d.dealer_name}`, text: d.text }))} />
            <Controls rows={rv} choices={["Clear", "Reprice", "Exclude"]} onDecide={onDecide} busy={busy} approveLabel="Approve hold" who={who}
              impact="These loans stay out of the bid until a person answers the open question or the documents arrive." />
          </Group>
        </div>
      </div>
    </div>
  );
}
