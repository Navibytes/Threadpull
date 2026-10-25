// Part 03: how the price is built. A ledger, not a chart: principal, less the excluded and held loans, is the principal in the
// bid; less the assumed pricing adjustment, it is the proposed bid. The identity is only printed when the report's loan counts
// split the same way as the money; otherwise the page says so and prints nothing it cannot back. "Balance under review" is a
// different cut that overlaps the first two, so it is set apart and never subtracted. Money is right-aligned and always to the cent.
import type { DealReport } from "@/lib/deal";
import { reconcile } from "./figures";
import { refNumber } from "./findings";
import { pct, usd } from "./format";
import { Part, Ref } from "./part";
import styles from "./cro.module.css";

type Props = {
  r: DealReport; busy: boolean;
  inputs: { lgd: string; margin: string }; setInputs: (v: { lgd: string; margin: string }) => void; onApply: () => void;
};

const loansOf = (n: number) => `${n.toLocaleString("en-US")} ${n === 1 ? "loan" : "loans"}`;
const money = (n: number, minus = false) => `${minus ? "−" : ""}${usd(n, true)}`;

function Line({ r, label, sub, loans, amount, share, ref_, refLabel, tone = "plain", minus }: {
  r: DealReport; label: string; sub?: string; loans?: string; amount: number; share: number; ref_: string; refLabel: string; tone?: "plain" | "sum" | "total"; minus?: boolean;
}) {
  const edge = tone === "sum" ? "border-t border-walnut/70" : tone === "total" ? "border-t-[3px] border-double border-walnut/80" : "border-t border-walnut/20";
  return (
    <tr className={edge}>
      <th scope="row" className={`py-3 pr-4 text-left align-baseline ${tone === "plain" ? "font-normal" : "font-semibold"}`}>
        <span className={tone === "total" ? "text-[1.15rem]" : "text-[1.0625rem]"}>{label}</span>
        <Ref id={ref_} n={refNumber(r, ref_)} label={refLabel} />
        {sub ? <span className="block text-[14px] font-normal text-walnut/85">{sub}</span> : null}
      </th>
      <td className="hidden py-3 pr-4 text-right align-baseline text-[14.5px] tabular-nums text-walnut/90 sm:table-cell">{loans}</td>
      <td className={`${styles.num} py-3 pr-4 align-baseline ${tone === "total" ? "text-[1.35rem] font-bold" : tone === "sum" ? "text-[1.1rem] font-semibold" : "text-[1.1rem]"}`}>{money(amount, minus)}</td>
      <td className="py-3 text-right align-baseline text-[14.5px] tabular-nums text-walnut/85">{pct(share, 2)}</td>
    </tr>
  );
}

export function PriceLedger({ r, busy, inputs, setInputs, onApply }: Props) {
  const x = reconcile(r);
  const t = r.totals;
  const a = r.assumptions;
  const of = (n: number) => (x.principal ? n / x.principal : 0);
  return (
    <Part n="03" id="price-title" title="How the price is built" lead="Every loan is in exactly one place: in the bid, excluded, or held for a person. The bid is then priced down from what stays in.">
      {x.splits ? (
        <table className="w-full border-collapse">
          <caption className="sr-only">How total principal becomes the proposed bid, in dollars</caption>
          <thead>
            <tr className={`${styles.caps} text-walnut/85`}>
              <th scope="col" className="pb-2 pr-4 text-left font-semibold">Line</th>
              <th scope="col" className="hidden pb-2 pr-4 text-right font-semibold sm:table-cell">Loans</th>
              <th scope="col" className="pb-2 pr-4 text-right font-semibold">Amount</th>
              <th scope="col" className="pb-2 text-right font-semibold">of principal</th>
            </tr>
          </thead>
          <tbody>
            <Line r={r} label="Total principal" sub="what every loan is owed today" loans={loansOf(x.loans.all)} amount={x.principal} share={1} ref_="principal" refLabel="total principal" />
            <Line r={r} label="Excluded" loans={loansOf(x.loans.excluded)} amount={x.excluded} share={of(x.excluded)} ref_="excluded" refLabel="the excluded balance" minus />
            <Line r={r} label="Held for a person" loans={loansOf(x.loans.held)} amount={x.held} share={of(x.held)} ref_="held" refLabel="the held balance" minus />
            <Line r={r} label="Principal in the bid" sub={`${t.not_reviewed.toLocaleString("en-US")} of these loans were not investigated`} loans={loansOf(x.loans.inBid)} amount={x.inBid} share={of(x.inBid)} ref_="inbid" refLabel="principal in the bid" tone="sum" />
            <Line r={r} label="Pricing adjustment" sub={`assumed: ${pct(a.margin, 0)} margin and a default haircut where a credit score exists`} amount={x.adjustment} share={of(x.adjustment)} ref_="adjustment" refLabel="the pricing adjustment" minus />
            <Line r={r} label="Proposed bid" sub="assumed, not a market quote" loans={loansOf(x.loans.inBid)} amount={x.bid} share={of(x.bid)} ref_="bid" refLabel="the proposed bid" tone="total" />
          </tbody>
        </table>
      ) : (
        <p role="alert" className="border-y border-terracotta py-3 text-[15.5px] font-semibold text-[#8e3b2a]">
          This report's loan counts do not add up (in the bid + excluded + held ≠ all loans), so the working from principal to bid is not printed. The totals above are still the report's own.
        </p>
      )}

      <div className="mt-8 grid gap-x-10 gap-y-2 border-t border-walnut/25 pt-5 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="max-w-[40rem]">
          <p className="text-[1.0625rem] font-semibold">Balance under review<Ref id="review" n={refNumber(r, "review")} label="the balance under review" /></p>
          <p className="mt-1 text-[15.5px] leading-snug text-walnut/90">
            Flagged by the run and not yet decided by a person. It overlaps the excluded and held lines above, so it is not a further deduction. It falls as a person decides.
          </p>
        </div>
        <p className={`${styles.num} text-[1.35rem] font-semibold`}>{usd(t.balance_under_review, true)}</p>
      </div>

      <details className="mt-6 border-t border-walnut/25 pt-4">
        <summary className={`${styles.note} inline-block text-[15px]`}>Pricing assumptions: loss given default {pct(a.lgd, 0)}, margin {pct(a.margin, 0)}. Change them.</summary>
        <form className="mt-3 grid max-w-xl grid-cols-2 gap-3" onSubmit={(e) => { e.preventDefault(); onApply(); }}>
          <label className="text-[14.5px] font-semibold">Loss given default
            <input inputMode="decimal" value={inputs.lgd} onChange={(e) => setInputs({ ...inputs, lgd: e.target.value })} aria-describedby="assume-hint" className="mt-1 block w-full rounded-sm border border-walnut/40 bg-paper px-2 py-2 text-[15px] font-normal tabular-nums" />
          </label>
          <label className="text-[14.5px] font-semibold">Margin
            <input inputMode="decimal" value={inputs.margin} onChange={(e) => setInputs({ ...inputs, margin: e.target.value })} aria-describedby="assume-hint" className="mt-1 block w-full rounded-sm border border-walnut/40 bg-paper px-2 py-2 text-[15px] font-normal tabular-nums" />
          </label>
          <p id="assume-hint" className="col-span-2 text-[14px] text-walnut/85">Fractions between 0 and 1, for example 0.55 and 0.04. Only the bid is recalculated.</p>
          <button type="submit" disabled={busy} className={`${styles.secondary} col-span-2`}>Recalculate the bid</button>
        </form>
      </details>
    </Part>
  );
}
