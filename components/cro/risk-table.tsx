"use client";
// Part 04: where the risk sits. Rings and dealers in one ruled table a reader can sort, every row naming its loans, with one way
// to act on exactly those loans. The working (event rows, formula) lives once in the source ledger; the footnote points there,
// not a repeated "how calculated" on every row. A ring is a set of flagged loans still joined by an open link; a dealer row is
// every loan the run flagged that dealer sold. A connection is a lead for a person to check, not proof.
import { useMemo, useState } from "react";
import type { DealReport } from "@/lib/deal";
import { riskRows, type Risk } from "./figures";
import { refNumber } from "./findings";
import { pct, usd } from "./format";
import { Part, Ref } from "./part";
import styles from "./cro.module.css";

type Key = "name" | "loans" | "balance" | "share";
const VALUE: Record<Key, (x: Risk) => number | string> = {
  name: (x) => x.name.toLowerCase(),
  loans: (x) => x.loanIds.length,
  balance: (x) => x.balance,
  share: (x) => x.share ?? -1, // a ring has no share of a book; it sorts below every dealer
};
const ids = (xs: string[], max = 5) => (xs.length > max ? `${xs.slice(0, max).join(", ")} and ${xs.length - max} more` : xs.join(", "));

export function RiskTable({ r, onDecide }: { r: DealReport; onDecide: (scope: { label: string; loanIds: string[] }) => void }) {
  const [sort, setSort] = useState<{ key: Key; dir: "asc" | "desc" }>({ key: "balance", dir: "desc" });
  const rows = useMemo(() => {
    const sign = sort.dir === "asc" ? 1 : -1;
    return [...riskRows(r)].sort((a, b) => {
      const [x, y] = [VALUE[sort.key](a), VALUE[sort.key](b)];
      return (x < y ? -1 : x > y ? 1 : 0) * sign || a.name.localeCompare(b.name);
    });
  }, [r, sort]);

  const inRing = new Set(r.concentration.rings.flatMap((g) => g.loan_ids));
  const alone = r.loans.filter((l) => l.hazel_status === "Investigate" && !inRing.has(l.loan_id));
  const head = (key: Key, label: string, num = false) => (
    <th scope="col" aria-sort={sort.key === key ? (sort.dir === "asc" ? "ascending" : "descending") : "none"} className={`pb-1 pr-4 font-semibold ${num ? "text-right" : "text-left"}`}>
      <button type="button" onClick={() => setSort({ key, dir: sort.key === key && sort.dir === "desc" ? "asc" : "desc" })} className={`${styles.caps} inline-flex min-h-9 items-center gap-1 hover:underline`}>
        {num ? <span aria-hidden className="w-3 text-terracotta">{sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span> : null}
        {label}
        {num ? null : <span aria-hidden className="w-3 text-terracotta">{sort.key === key ? (sort.dir === "asc" ? "▲" : "▼") : ""}</span>}
      </button>
    </th>
  );

  return (
    <Part n="04" id="risk-title" title="Where the risk sits" lead={<>Loans the run flagged, by the links that still join them and by the dealer that sold them. Click a heading to sort.<Ref id="risk" n={refNumber(r, "risk")} label="the risk table" /></>}>
      {rows.length === 0 ? (
        <p className="text-[16px]">The run flagged no loans, so there is nothing to concentrate.</p>
      ) : (
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-[38rem] border-collapse text-[15.5px]">
            <caption className="sr-only">Rings and dealers, with flagged loans, balance and share of the dealer's book</caption>
            <thead>
              <tr className="border-b-2 border-walnut/70">
                {head("name", "Ring or dealer")}
                {head("loans", "Loans", true)}
                {head("balance", "Flagged balance", true)}
                {head("share", "Share of its book", true)}
                <th scope="col" className="pb-1 text-left"><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={`${x.kind}-${x.key}`} className="border-b border-walnut/20 align-top">
                  <th scope="row" className="py-3.5 pr-4 text-left font-normal">
                    <span className={`${styles.caps} mr-2 text-walnut/80`}>{x.kind === "ring" ? "Ring" : "Dealer"}</span>
                    <span className="text-[1.0625rem] font-semibold">{x.name}</span>
                    <p className="mt-0.5 text-[14px] leading-snug text-walnut/85">{x.detail}</p>
                    <p className="text-[14px] tabular-nums text-walnut/85">{ids(x.loanIds)}</p>
                  </th>
                  <td className={`${styles.num} py-3.5 pr-4`}>{x.loanIds.length}</td>
                  <td className={`${styles.num} py-3.5 pr-4 text-[1.1rem] font-semibold`}>{usd(x.balance)}</td>
                  <td className={`${styles.num} py-3.5 pr-4`}>{x.share === null ? <span className="text-walnut/80">—</span> : pct(x.share)}</td>
                  <td className="py-3.5 text-right">
                    <button type="button" aria-label={`Decide on the loans in ${x.kind === "ring" ? "" : "dealer "}${x.name}`} onClick={() => onDecide({ label: `${x.kind === "ring" ? "" : "dealer "}${x.name}`, loanIds: x.loanIds })} className={`${styles.note} min-h-9 text-[14.5px]`}>
                      Decide on these loans
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {alone.length ? (
        <p className="mt-4 max-w-[46rem] text-[14.5px] leading-snug text-walnut/90">
          {alone.map((l) => l.loan_id).join(", ")} {alone.length === 1 ? "was" : "were"} flagged on {alone.length === 1 ? "its" : "their"} own evidence, not through a recorded link to another flagged loan, so {alone.length === 1 ? "it is" : "they are"} in no ring.
        </p>
      ) : null}
    </Part>
  );
}
