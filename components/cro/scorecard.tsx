// How accurate this run was, where that is known. A run's accuracy needs its portfolio's answer key, which only eval/
// reads, so the app never computes it: the two proof runs show the scores `bun run eval` measured (docs/PROOF.md, via
// components/landing/proof-data.ts, kept in step by a test); any other run says why it has no score.
import { PROOF, PROOF_URL } from "@/components/landing/proof-data";
import styles from "./cro.module.css";

export function Scorecard({ runId }: { runId: string }) {
  const p = PROOF.find((x) => x.run === runId);
  return (
    <section aria-labelledby="score-title" className="border-t border-walnut/30 py-7">
      <h2 id="score-title" className="font-display text-[1.35rem] font-semibold">
        {p ? `Measured against the answer key: seed ${p.seed}, ${p.label.toLowerCase()}` : "Accuracy"}
      </h2>
      {p ? (
        <>
          <p className="mt-1 max-w-[46rem] text-[15.5px] text-walnut/90">
            This is one of the two proof runs. <code>bun run eval</code> compared its statuses with the portfolio&apos;s answer
            key, which the app itself never reads, and ran two baselines on the same loans with CRS live.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[36rem] text-[15.5px]">
              <caption className="sr-only">This run and two baselines, scored against the answer key</caption>
              <thead>
                <tr className={`${styles.caps} border-b-2 border-walnut/70 text-walnut/85`}>
                  {["Agent", "Ring found", "Innocents flagged", "Other loans flagged", "Review cases right", "Acorns", "CRS calls"].map((h, i) => (
                    <th key={h} scope="col" className={`pb-1 pr-3 font-semibold ${i ? "text-right" : "text-left"}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {p.rows.map((row) => {
                  const hazel = row.agent === "Threadpull (Hazel)";
                  return (
                    <tr key={row.agent} className={`border-b border-walnut/20 ${hazel ? "font-semibold" : ""}`}>
                      <th scope="row" className={`py-2 pr-3 text-left ${hazel ? "font-semibold" : "font-normal"}`}>{hazel ? "This run (Threadpull)" : row.agent}</th>
                      {[row.ring, row.innocents, row.other, row.review, row.acorns, row.crs].map((v, i) => <td key={i} className={`${styles.num} py-2 pr-3`}>{v}</td>)}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 max-w-[46rem] text-[15px] text-walnut/90">
            Every ring member was marked Investigate after {p.ringCompleteAt} acorns. <a href={PROOF_URL} className="font-semibold underline underline-offset-2">Method and definitions in PROOF.md</a>
          </p>
        </>
      ) : (
        <p className="mt-1 max-w-[46rem] text-[15.5px] text-walnut/90">
          This run has no accuracy score. Scoring needs the portfolio&apos;s answer key, and only the evaluator reads answer
          keys, so nothing in the app can see which loans were planted. The two proof runs are scored
          (<a href="/#results" className="font-semibold underline underline-offset-2">results</a>); open one with the run picker
          above to see its score here.
        </p>
      )}
    </section>
  );
}
