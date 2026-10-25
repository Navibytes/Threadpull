"use client";

// Twin Compare (ticket 07): the two loans a thread ties together, side by side on one ruled card. Shared facts are
// marked, the thread's own fact is pinned, and the foot says what split them: the check or saved rule that
// explained the link, or that nothing has yet. A connection is not proof, and the panel says so.
import { useMemo } from "react";
import { compareTwins, type TwinComparison, type TwinRow, type TwinSplit } from "@/lib/evidence";
import type { BoardThread, FeedMode, RunEvent } from "@/lib/events";
import { portfolioLabel, type Portfolio } from "@/components/drawer/loan-source";
import { useTwinLoans } from "./use-twin-loans";
import t from "./twin-compare.module.css";

/**
 * Which generated portfolio the board's loans come from: the seed on the run's run_started row. The preview board
 * uses example ids, so seed 13 there. A run of an uploaded tape names the tape instead (run_started.result.tape_id);
 * a run that names neither has no files to pull, since the same ids in another portfolio are other loans.
 */
export function portfolioSeed(events: readonly RunEvent[], mode: FeedMode): Portfolio | null {
  const started = events.find((e) => e.type === "run_started")?.result;
  const seed = started?.seed, tape = started?.tape_id;
  if (typeof seed === "number" && Number.isInteger(seed)) return seed;
  if (typeof tape === "string" && /^t-[0-9a-f]{12}$/.test(tape)) return tape;
  return mode === "preview" ? 13 : null;
}

export function TwinCompare({ thread, seed }: { thread: BoardThread; seed: Portfolio | null }) {
  const loans = useTwinLoans(thread.a, thread.b, seed);
  const x = thread.explained;
  const comparison = useMemo(() => {
    if (loans.phase !== "ready") return null;
    const split: TwinSplit | null = x ? { explainedBy: x.explainedBy, ruleId: x.ruleId, reason: x.reason, seq: x.seq } : null;
    return compareTwins(loans.a, loans.b, split, loans.pool.values());
  }, [loans, x]);

  return (
    <section aria-labelledby={`twin-${thread.id}`} className={t.wrap}>
      <h3 id={`twin-${thread.id}`} className={t.title}>Twin Compare</h3>
      {loans.phase === "loading" && <p className={t.quiet} role="status">Pulling both files…</p>}
      {loans.phase === "missing" && (
        <p className={t.quiet}>
          {seed === null
            ? "This run doesn't say which portfolio it used, so the two files can't be pulled."
            : `No loan records for these cards in the ${portfolioLabel(seed)} portfolio (the preview board uses example ids).`}
        </p>
      )}
      {loans.phase === "error" && <p className={t.quiet} role="alert">{loans.message}</p>}
      {comparison && <TwinCompareView comparison={comparison} threadKind={thread.kind} />}
    </section>
  );
}

const count = (r: TwinRow) => (r.shared_by !== null ? ` · ${r.shared_by.toLocaleString("en-US")} loans` : "");

/** The comparison card itself. No state: renders the same on the server and in tests. */
export function TwinCompareView({ comparison: c, threadKind }: { comparison: TwinComparison; threadKind: string }) {
  const differ = c.rows.filter((r) => !r.same).map((r) => r.label);
  return (
    <div className={`index-ruled ${t.card}`}>
      <table className={t.table}>
        <caption className="sr-only">
          {c.a} and {c.b}: {c.shared.length ? `they share ${c.shared.join(", ")}` : "they share none of these facts"}
        </caption>
        <thead>
          <tr>
            <th scope="col"><span className="sr-only">Fact</span></th>
            <th scope="col" className={t.loan}>{c.a}</th>
            <th scope="col" className={t.loan}>{c.b}</th>
          </tr>
        </thead>
        <tbody>
          {c.rows.map((r) => {
            const pinned = r.kind !== null && r.kind === threadKind;
            return (
              <tr key={r.label} data-same={r.strong || undefined} data-common={(r.same && !r.strong) || undefined}
                data-thread={pinned || undefined} data-explained={(pinned && !!c.split) || undefined}>
                <th scope="row" className={t.label}>
                  {r.label}
                  {pinned && <span className={t.tag}>{c.split ? "this thread · explained" : "this thread"}{count(r)}</span>}
                  {!pinned && r.same && <span className={t.tag}>{r.strong ? "shared" : "common"}{count(r)}</span>}
                </th>
                <td>{r.a}</td>
                <td>{r.same ? <span className={t.ditto} aria-label={r.b}>same</span> : r.b}</td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className={t.split} data-explained={!!c.split || undefined}>
        <p className={t.splitTitle}>What splits them</p>
        {c.split ? (
          <p>
            <strong>{c.split.ruleId ?? c.split.explainedBy}</strong>: {c.split.reason}. The suspicion came down at event seq {c.split.seq};
            the shared {threadKind.replace("_", " ")} stays on the board as a fact.
          </p>
        ) : (
          <p>
            Nothing yet: no check or saved rule has explained this link. They differ on {differ.length ? differ.join(", ") : "none of these facts"}.
            A connection is a lead, not proof.
          </p>
        )}
      </div>
    </div>
  );
}
