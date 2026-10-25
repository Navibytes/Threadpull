// Part 06: what the investigation cost. One sentence and a small table, no chart: how many acorns the run spent, which tools used
// them, and what checking everything would have taken (an estimate, with its working in the source ledger). Acorns are
// Threadpull's unit, not dollars, and the page never shows a dollar cost for the run.
import type { DealReport } from "@/lib/deal";
import { TOOL_SPECS, type ToolName } from "@/lib/contracts/tool-result";
import { spendBreakdown } from "./figures";
import { refNumber } from "./findings";
import { pct, plural } from "./format";
import { Basis, Part, Ref } from "./part";
import styles from "./cro.module.css";

const words = (s: string) => s.replace(/_/g, " ");
const unit = (tool: string) => (tool in TOOL_SPECS ? TOOL_SPECS[tool as ToolName].unit : null);

export function Efficiency({ r }: { r: DealReport }) {
  const s = spendBreakdown(r);
  const e = s.everything;
  const used = s.limit ? Math.min(1, s.spent / s.limit) : null;
  return (
    <Part n="06" id="eff-title" title="What the investigation cost" lead="Acorns are Threadpull's unit for the checking budget. They are not dollars, and this page shows no dollar cost for the run.">
      <div className="grid gap-x-14 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div>
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="font-display text-[3rem] font-semibold leading-none tabular-nums">{s.spent}</span>
            <span className="text-[1.0625rem]">{s.limit ? `of ${s.limit} acorns spent` : "acorns spent"}</span>
            <Ref id="spend" n={refNumber(r, "spend")} label="the acorns spent" />
          </p>
          {used !== null ? <div role="img" aria-label={`${s.spent} of ${s.limit} acorns used`} className="mt-3 h-1.5 bg-walnut/15"><div className="h-full bg-walnut" style={{ width: `${used * 100}%` }} /></div> : null}
          <p className="mt-2 text-[15.5px] text-walnut/90">{s.limit ? (s.spent >= s.limit ? "The whole budget was used." : `${s.limit - s.spent} acorns of the budget were left unused.`) : "No budget limit is recorded for this run."}</p>
        </div>
        <div>
          {s.tools.length ? (
            <table className="w-full text-[15.5px]">
              <caption className="sr-only">Acorns spent by tool</caption>
              <thead><tr className={`${styles.caps} border-b-2 border-walnut/70 text-walnut/85`}><th scope="col" className="pb-1 pr-3 text-left font-semibold">Tool</th><th scope="col" className="pb-1 pr-3 text-right font-semibold">Calls</th><th scope="col" className="pb-1 text-right font-semibold">Acorns</th></tr></thead>
              <tbody>{s.tools.map((t) => (
                <tr key={t.tool} className="border-b border-walnut/20">
                  <th scope="row" className="py-2 pr-3 text-left font-normal">{words(t.tool)}{unit(t.tool) ? <span className="text-walnut/80"> · {unit(t.tool)}</span> : null}</th>
                  <td className={`${styles.num} py-2 pr-3`}>{t.calls}</td><td className={`${styles.num} py-2 font-semibold`}>{t.acorns}</td>
                </tr>))}</tbody>
            </table>
          ) : <p className="text-[15.5px]">No paid check is recorded in this run.</p>}
          {!s.toolsMatchSpend ? <p role="note" className="mt-2 text-[14px] font-semibold text-terracotta">These rows add up to {s.tools.reduce((n, t) => n + t.acorns, 0)} acorns, not the {s.spent} the run reports; the difference is not itemised in the log.</p> : null}
        </div>
      </div>
      <p className="mt-7 max-w-[46rem] border-t border-walnut/25 pt-4 text-[16px] leading-snug">
        {e.total > 0
          ? <>Checking every case loan with every CRS tool would take about <b className="tabular-nums">{e.total}</b> acorns ({plural(e.caseLoans, "case loan")} × {e.perLoan}), so this run used {pct(s.spent / e.total, 0)} of that. <Basis basis="Estimate" /><Ref id="estimate" n={refNumber(r, "estimate")} label="the cost of checking everything" /> It is arithmetic over the tool price list, not a second run.</>
          : "No comparison is shown: this run has no case loans to compare against."}
      </p>
    </Part>
  );
}
