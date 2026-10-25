// The intake report as a case file: headline numbers on index cards, then every exception with its reasons.
// Presentational only (no state), so it renders on the server and in tests. Nothing here repeats a value from the
// tape: the report itself carries none (lib/ingest/intake.ts).
import type { ReactNode, Ref } from "react";
import type { IntakeReport } from "@/lib/ingest/intake";
import { Pushpin } from "@/components/board/pushpin";
import { REJECTED_SHOWN, reportFacts } from "./upload-model";
import u from "./upload.module.css";

export function IntakeReportView({ name, report, saved, headingRef, actions }: {
  name: string; report: IntakeReport; saved: boolean; headingRef?: Ref<HTMLHeadingElement>; actions?: ReactNode;
}) {
  const rejected = report.rejected.length;
  const stamp = !saved ? "rejected" : rejected ? "accepted with exceptions" : "accepted";
  const shown = report.rejected.slice(0, REJECTED_SHOWN);

  return (
    <article className={`${u.caseFile} panel-paper worn-1`} aria-labelledby="intake-result">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className={u.fileLabel}>Intake report</p>
          <h2 id="intake-result" ref={headingRef} tabIndex={-1} className={u.resultTitle}>
            {saved ? "Tape received." : "No loan could be accepted."}
          </h2>
          <p className="mt-2 break-words">
            <span className="font-semibold">{name}</span> · {report.format.toUpperCase()} · tape <code className={`${u.code} whitespace-nowrap`}>{report.tape_id}</code>
          </p>
        </div>
        <span className={`ink-stamp ${u.stamp}`} data-tone={!saved ? "alert" : rejected ? "warn" : "good"}>{stamp}</span>
      </header>

      <ul className={u.facts} aria-label="Intake numbers">
        {reportFacts(report).map((f) => (
          <li key={f.label} className={`index-ruled ${u.fact}`} data-tone={f.tone}>
            <span className={u.factPin} aria-hidden><Pushpin color={f.tone === "alert" || f.tone === "warn" ? "red" : "brass"} size={18} /></span>
            <span className={u.factValue}>{f.value}</span>
            <span className={u.factLabel}>{f.label}</span>
          </li>
        ))}
      </ul>

      {report.flagged_documents.length > 0 && (
        <section className={u.block} aria-labelledby="intake-flagged">
          <h3 id="intake-flagged" className={u.blockTitle}>Documents with instruction-like text</h3>
          <p className="mt-1 max-w-3xl">
            These documents contain text addressed to a reviewer or a model. Hazel will see only their form fields, and a run
            logs each one as <code className={u.code}>attack_detected</code>. The text changes no status.
          </p>
          <p className="mt-2 flex flex-wrap gap-2">
            {report.flagged_documents.map((d) => <code key={d} className={u.code}>{d}</code>)}
          </p>
        </section>
      )}

      {rejected > 0 && (
        <section className={u.block} aria-labelledby="intake-rejected">
          <h3 id="intake-rejected" className={u.blockTitle}>
            {rejected === 1 ? "1 row was rejected" : `${rejected.toLocaleString("en-US")} rows were rejected`}; the rest of the tape went on without {rejected === 1 ? "it" : "them"}
          </h3>
          <div className={u.tableWrap}>
            <table className={u.table}>
              <thead>
                <tr>
                  <th scope="col">{report.row_label === "CSV line" ? "CSV line" : "Position"}</th>
                  <th scope="col">Loan</th>
                  <th scope="col">Why</th>
                </tr>
              </thead>
              <tbody>
                {shown.map((r) => (
                  <tr key={`${r.row}-${r.loan_id ?? ""}`}>
                    <td className="tabular-nums">{r.row}</td>
                    <td>{r.loan_id ? <code className={u.code}>{r.loan_id}</code> : <span className="italic">no id</span>}</td>
                    <td>
                      <ul className={u.reasons}>
                        {r.reasons.map((why, i) => <li key={i}>{why}</li>)}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {rejected > shown.length && (
            <p className="mt-2">and {(rejected - shown.length).toLocaleString("en-US")} more. Fix the rows in the file and upload it again.</p>
          )}
        </section>
      )}

      {(report.unknown_columns.length > 0 || report.missing_columns.length > 0) && (
        <section className={u.block} aria-labelledby="intake-columns">
          <h3 id="intake-columns" className={u.blockTitle}>Columns</h3>
          {report.missing_columns.length > 0 && (
            <p className="mt-1">Missing ({report.missing_columns.length}): {report.missing_columns.map((c) => <code key={c} className={`${u.code} mr-1.5`}>{c}</code>)}</p>
          )}
          {report.unknown_columns.length > 0 && (
            <p className="mt-1">Ignored, not tape columns: {report.unknown_columns.map((c) => <code key={c} className={`${u.code} mr-1.5`}>{c}</code>)}</p>
          )}
        </section>
      )}

      {report.notes.length > 0 && (
        <aside className={`sticky-note ${u.notes}`} aria-label="Notes">
          <ul>{report.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </aside>
      )}

      <footer className={u.next}>
        {saved && (
          <p className="max-w-xl">
            <button type="button" className={u.unbuilt} disabled aria-describedby="next-step">Open the case</button>
            <span id="next-step" className="mt-2 block">
              Running Hazel on an uploaded tape is the next step and isn&apos;t built yet. The tape is saved and ready for it.
            </span>
          </p>
        )}
        {actions}
      </footer>
    </article>
  );
}
