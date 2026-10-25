// Part 02: why this recommendation. The run's findings in plain sentences, strongest first, each with the balance it moves, the
// evidence behind it (event numbers, CRS RequestIDs from the sandbox) and what remains uncertain. A loan with no anomaly is
// "not flagged", never "safe". Everything is read from the report (findings.ts); the page adds no judgement of its own.
import type { DealReport } from "@/lib/deal";
import { eventRefsShort, plural, usd } from "./format";
import { findings, unestablished, type Finding } from "./findings";
import { Part } from "./part";
import styles from "./cro.module.css";

const TONE: Record<Finding["verdict"], string> = { Exclude: "text-[#9c3f2a]", Review: "text-[#7a560a]", Reprice: "text-[#2f4a63]", Clear: "text-[#3f5233]" };
const ids = (xs: string[], max = 6) => (xs.length > max ? `${xs.slice(0, max).join(", ")} and ${xs.length - max} more` : xs.join(", "));

export function WhyRecommended({ r }: { r: DealReport }) {
  const list = findings(r);
  const gaps = unestablished(r);
  return (
    <Part n="02" id="why-title" title="Why this recommendation?" lead="What the run found, in the order that moves money. Each line says where the evidence is.">
      {list.length === 0 ? (
        <p className="text-[16px]">The run closed no loan, so there is no finding to explain.</p>
      ) : (
        <ol className="border-b border-walnut/25">
          {list.map((f) => (
            <li key={f.key} className="grid gap-x-8 gap-y-1 border-t border-walnut/25 py-5 sm:grid-cols-[8.5rem_minmax(0,1fr)]">
              <div className="sm:text-right">
                <p className="text-[1.15rem] font-semibold tabular-nums">{usd(f.balance)}</p>
                <p className="text-[14px] text-walnut/85">{plural(f.loanIds.length, "loan")}</p>
              </div>
              <div className="min-w-0">
                <p className={`${styles.caps} ${TONE[f.verdict]}`}>{f.label}</p>
                <p className="mt-1 text-[1.0625rem] font-semibold leading-snug">{f.heading}</p>
                {f.detail ? <p className="mt-1 max-w-[42rem] text-[15.5px] leading-snug text-walnut/90">{f.detail}</p> : null}
                <p className="mt-2 text-[14px] leading-snug text-walnut/85">
                  <span className="tabular-nums">{ids(f.loanIds)}</span>
                  {" · "}
                  {f.seqs.length ? <span className="tabular-nums">{eventRefsShort(f.seqs, 5)}</span> : "no event rows"}
                  {f.crsIds ? <> · {plural(f.crsIds, "CRS RequestID")} (sandbox){f.ownCrs < f.loanIds.length ? `, own CRS check on ${f.ownCrs} of ${f.loanIds.length}` : ""}</> : f.verdict !== "Clear" ? " · no CRS RequestID cited" : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}

      <h3 className={`${styles.caps} mt-9 text-walnut/90`}>What this does not establish</h3>
      <ul className="mt-2 max-w-[46rem]">
        {gaps.map((g) => (
          <li key={g} className="relative py-1.5 pl-6 text-[15.5px] leading-snug">
            <span aria-hidden className="absolute left-0 top-1.5 text-terracotta">—</span>
            {g}
          </li>
        ))}
      </ul>
    </Part>
  );
}
