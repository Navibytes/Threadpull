// The CRO screen's shared pieces (ticket 10): the verdict badge, the "assumed" tag, a section frame, and the table of every
// investigated loan. The page's headline figures live in recommendation.tsx, price-ledger.tsx, risk-table.tsx and efficiency.tsx.
import { Fragment, useState } from "react";
import type { LoanRow, Verdict } from "@/lib/deal";
import { eventRefs, usd } from "./format";
import { Part } from "./part";
import { WhyDetail } from "./why";
import styles from "./cro.module.css";

// Colour only reinforces the word, which always says the verdict: a small square beside plain text, not a pill. [mark, text]
export const VERDICT_STYLE: Record<Verdict, [string, string]> = {
  Exclude: ["bg-terracotta", "text-[#8e3b2a]"],
  Review: ["bg-honey", "text-[#6b4a0a]"],
  Reprice: ["bg-dusty", "text-[#2f4a63]"],
  Clear: ["bg-sage", "text-[#3f5233]"],
};
// The words on a badge. "Clear" is never shown: a loan with no anomaly found is "not flagged", which says nothing about whether it is sound.
const VERDICT_WORDS: Record<Verdict, string> = { Exclude: "Exclude + buyback", Review: "Hold for a person", Reprice: "Reprice", Clear: "Not flagged" };
export const VerdictBadge = ({ verdict }: { verdict: Verdict }) => (
  <span className={`inline-flex items-baseline gap-1.5 text-[14px] font-semibold ${VERDICT_STYLE[verdict][1]}`}>
    <span aria-hidden className={`inline-block size-2 shrink-0 ${VERDICT_STYLE[verdict][0]}`} />{VERDICT_WORDS[verdict]}
  </span>
);
export const Assumed = () => <span className="ml-1.5 rounded bg-walnut/10 px-1.5 py-0.5 align-middle text-[12px] font-semibold uppercase tracking-wide text-walnut/85">assumed</span>;

/** A numbered part of the memorandum around one of the older panels (memo, questions, every loan, adapting). */
export const Section = ({ n, id, title, hint, children }: { n: string; id: string; title: string; hint?: string; children: React.ReactNode }) => (
  <Part n={n} id={id} title={title} lead={hint}>{children}</Part>
);

/** `runId` makes each loan number a button that traces its verdict through the run's events (ticket 14). */
export function LoansTable({ loans, runId }: { loans: LoanRow[]; runId?: string }) {
  const [open, setOpen] = useState<string | null>(null);
  if (!loans.length) return <p className="text-[15px] text-walnut/85">The run has not closed any loan yet.</p>;
  const th = "pb-1 pr-4 text-left font-semibold";
  return (
    <div>
      {runId ? <p className="mb-3 text-[14.5px] text-walnut/85">Select a loan number to trace its verdict through the run's audit-log events.</p> : null}
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[46rem] border-collapse text-[15px]">
          <caption className="sr-only">Every loan the run investigated, with balance, status, verdict, reason and evidence</caption>
          <thead><tr className={`${styles.caps} border-b-2 border-walnut/70 text-walnut/85`}>
            <th scope="col" className={th}>Loan and dealer</th>
            <th scope="col" className={`${th} text-right`}>Balance</th>
            <th scope="col" className={th}>Verdict and status</th>
            <th scope="col" className={th}>Why</th>
            <th scope="col" className="pb-1 text-left font-semibold">Evidence</th>
          </tr></thead>
          <tbody>{loans.map((l) => (
            <Fragment key={l.loan_id}>
              <tr className="border-b border-walnut/20 align-top">
                <th scope="row" className="py-3 pr-4 text-left font-normal">
                  {runId
                    ? <button type="button" aria-expanded={open === l.loan_id} onClick={() => setOpen(open === l.loan_id ? null : l.loan_id)} className={`${styles.note} font-semibold tabular-nums`}>{l.loan_id}</button>
                    : <span className="font-semibold tabular-nums">{l.loan_id}</span>}
                  <p className="text-[14px] leading-snug text-walnut/85">{l.dealer_name}</p>
                </th>
                <td className={`${styles.num} py-3 pr-4`}>{usd(l.balance, true)}</td>
                <td className="py-3 pr-4">
                  <VerdictBadge verdict={l.verdict} />
                  <p className="text-[14px] leading-snug text-walnut/85">{l.status}{l.confirmed ? ` · ${l.confirmed.decision === "approve" ? "approved" : "overridden"} by ${l.confirmed.decided_by}` : ""}</p>
                  {l.confirmed?.reason ? <p className="mt-1 max-w-[16rem] text-[14px] leading-snug text-walnut/85">{l.confirmed.reason}</p> : null}
                </td>
                <td className="py-3 pr-4 leading-snug text-walnut/90">{l.reason ?? "no reason recorded"}</td>
                <td className="py-3 text-[14px] leading-snug tabular-nums text-walnut/85">{eventRefs(l.event_seqs)}{l.request_ids.map((id) => <div key={id} title="CRS RequestID">CRS {id.slice(0, 8)}…</div>)}</td>
              </tr>
              {runId && open === l.loan_id ? <tr className="bg-walnut/[0.05]"><td colSpan={5} className="px-4 py-3"><WhyDetail runId={runId} loanId={l.loan_id} /></td></tr> : null}
            </Fragment>))}</tbody>
        </table>
      </div>
    </div>
  );
}
