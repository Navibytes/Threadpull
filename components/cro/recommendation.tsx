// Part 01: the recommendation. One figure leads (the proposed bid, with its basis said plainly), one sentence says what it
// covers, three ruled lines say what stays out and what is unexamined, and the action sits beside it. The stamp shows,
// in the page's one physical gesture, whether any person has decided. The same status is in the masthead as text; the
// stamp is for the eye and is hidden from assistive technology so it is not read twice.
import Link from "next/link";
import type { DealReport } from "@/lib/deal";
import { reconcile, reviewState } from "./figures";
import { refNumber } from "./findings";
import { pct, usd } from "./format";
import { Basis, Part, Ref } from "./part";
import styles from "./cro.module.css";

const STAMP = { none: "Nothing flagged", awaiting: "Proposal · not yet decided", partial: "Partly decided by a person", confirmed: "Confirmed by a person" } as const;

function Row({ label, count, amount, note, refId, r, ariaLabel }: { label: string; count: string; amount?: string; note: string; refId?: string; r: DealReport; ariaLabel?: string }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-6 gap-y-0.5 border-t border-walnut/25 py-3 sm:grid-cols-[11rem_6.5rem_minmax(0,1fr)]">
      <dt className="font-semibold">{label}</dt>
      <dd className={`${styles.num} text-[1.1rem] font-semibold sm:order-none`}>{amount ?? "—"}</dd>
      <dd className="col-span-2 text-[15px] leading-snug text-walnut/90 sm:col-span-1">
        <span className="font-semibold tabular-nums">{count}</span> · {note}
        {refId ? <Ref id={refId} n={refNumber(r, refId)} label={ariaLabel ?? label} /> : null}
      </dd>
    </div>
  );
}

export function Recommendation({ r, onReview, boardHref }: { r: DealReport; onReview: () => void; boardHref: string }) {
  const x = reconcile(r);
  const s = reviewState(r.loans);
  const share = x.principal ? x.bid / x.principal : 0;
  return (
    <Part n="01" id="rec-title" title="The recommendation" first>
      <div className="grid gap-x-14 gap-y-7 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:grid-rows-[auto_1fr]">
        <div className="min-w-0 lg:col-start-1 lg:row-start-1">
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className={styles.caps}>Hazel proposes a bid of</span>
            <Basis basis="Assumed" />
            <Ref id="bid" n={refNumber(r, "bid")} label="the proposed bid" />
          </p>
          <p className={`${styles.figure} mt-2`} aria-label={`Proposed bid ${usd(x.bid)}`}>{usd(x.bid)}</p>
          <p className="mt-3 max-w-[40rem] text-[1.125rem] leading-snug">
            for {x.loans.inBid.toLocaleString("en-US")} of the {x.loans.all.toLocaleString("en-US")} loans: {pct(share)} of the principal. A modelled price under stated assumptions, not a market quote.
          </p>
        </div>

        <aside aria-label="The decision" className="flex flex-col items-start gap-4 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:border-l lg:border-walnut/25 lg:pl-7">
          <span aria-hidden className={styles.stamp} data-tone={s.state}>{STAMP[s.state]}</span>
          <button type="button" onClick={onReview} aria-haspopup="dialog" className={`${styles.cta} w-full`}>
            Review &amp; Decide <span aria-hidden>→</span>
          </button>
          <p className="text-[14.5px] leading-snug text-walnut/90">
            You will see exactly what you are approving, then confirm. A decision is written to the run's audit log under your name. Nothing is sent to anyone.
          </p>
          <Link href={boardHref} className={`${styles.note} text-[14.5px]`}>See the evidence on the board</Link>
        </aside>

        <div className="min-w-0 lg:col-start-1 lg:row-start-2">
          <dl>
            <Row r={r} label="Excluded" count={x.loans.excluded === 1 ? "1 loan" : `${x.loans.excluded} loans`} amount={usd(x.excluded)} refId="excluded" ariaLabel="the excluded balance"
              note={x.loans.excluded ? "removed from the purchase; a buyback demand is drafted for each dealer" : "no loan is proposed for exclusion"} />
            <Row r={r} label="Held for a person" count={x.loans.held === 1 ? "1 loan" : `${x.loans.held} loans`} amount={usd(x.held)} refId="held" ariaLabel="the held balance"
              note={x.loans.held ? "out of the bid until one named person answers" : "no loan is held"} />
            <Row r={r} label="Not investigated" count={`${r.totals.not_reviewed.toLocaleString("en-US")} loans`}
              note={r.totals.not_reviewed ? "stay in the bid at base price; the run did not examine them" : "every loan was examined"} />
            <div className="border-t border-walnut/25" />
          </dl>
        </div>
      </div>
    </Part>
  );
}
