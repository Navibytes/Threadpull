"use client";

import { useEffect, useId, useState } from "react";
import type { Loan } from "@/lib/contracts/loan";
import { apiLoanSource, portfolioLabel, type LoanSource, type Portfolio } from "./loan-source";
import { LoanList, type LoanListProps } from "./loan-list";
import styles from "./drawer.module.css";

export type FilingDrawerProps = Omit<LoanListProps, "loans"> & {
  seed?: Portfolio;
  /** Opt in explicitly to a separate preview adapter; API failures never fall back to fixtures. */
  source?: LoanSource;
};

type LoadState = { source: LoanSource; seed: Portfolio; request: number } & (
  | { phase: "loading" }
  | { phase: "ready"; loans: Loan[] }
  | { phase: "error"; message: string }
);

export function FilingDrawer({ seed = 13, source = apiLoanSource, selectedLoanId, onSelectLoan }: FilingDrawerProps) {
  const id = useId();
  const [request, setRequest] = useState(0);
  const [state, setState] = useState<LoadState>({ source, seed, request, phase: "loading" });
  const current = state.source === source && state.seed === seed && state.request === request ? state : null;
  const loading = !current || current.phase === "loading";

  useEffect(() => {
    const controller = new AbortController();
    const context = { source, seed, request };
    setState({ ...context, phase: "loading" });
    async function load() {
      try {
        const loans = await source.load({ seed, signal: controller.signal });
        if (!controller.signal.aborted) setState({ ...context, phase: "ready", loans });
      } catch (error) {
        if (!controller.signal.aborted) setState({ ...context, phase: "error",
          message: error instanceof Error && !(error instanceof TypeError || error instanceof SyntaxError)
            ? error.message : "Could not read the loan service. Check your connection, then retry." });
      }
    }
    void load();
    return () => controller.abort();
  }, [source, seed, request]);

  return (
    <section className={styles.drawer} aria-labelledby={`${id}-title`}>
      <header className={styles.header}>
        <h2 id={`${id}-title`}>Filing drawer</h2>
        <button type="button" disabled={loading} onClick={() => setRequest((value) => value + 1)}>Refresh</button>
      </header>
      <p className={styles.source}>Portfolio · {portfolioLabel(seed)}</p>
      <div className={styles.content} aria-busy={loading}>
        {loading && <p role="status" className={styles.empty}>Loading loan files…</p>}
        {current?.phase === "error" && (
          <div className={styles.empty}>
            <div role="alert"><h3>Loan files unavailable</h3><p>{current.message}</p></div>
            <button type="button" onClick={() => setRequest((value) => value + 1)}>Retry</button>
          </div>
        )}
        {current?.phase === "ready" && <LoanList loans={current.loans} selectedLoanId={selectedLoanId} onSelectLoan={onSelectLoan} />}
      </div>
    </section>
  );
}
