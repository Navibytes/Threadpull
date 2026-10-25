"use client";

// The two loans behind a thread, from the same source the filing drawer reads (GET /api/loans). The portfolio is
// fetched once per page and shared by every comparison; a failed fetch is forgotten so the next one can retry.
import { useEffect, useState } from "react";
import type { Loan } from "@/lib/contracts/loan";
import { apiLoanSource, type LoanSource } from "@/components/drawer/loan-source";

export type TwinLoans =
  | { phase: "loading" }
  | { phase: "ready"; a: Loan; b: Loan; pool: ReadonlyMap<string, Loan> } // pool: the whole portfolio, for rarity
  | { phase: "missing" } // the cards aren't loans of this portfolio (e.g. the preview board's example ids)
  | { phase: "error"; message: string };

const cache = new Map<string, Promise<Map<string, Loan>>>();

export function portfolio(seed: number, source: LoanSource = apiLoanSource): Promise<Map<string, Loan>> {
  const key = `${source.kind}:${seed}`;
  let p = cache.get(key);
  if (!p) {
    p = source.load({ seed, signal: new AbortController().signal }).then((loans) => new Map(loans.map((l) => [l.loan_id, l])));
    p.catch(() => cache.delete(key));
    cache.set(key, p);
  }
  return p;
}

/** seed null: the run names no generated portfolio, so there is nothing to fetch ("missing"). */
export function useTwinLoans(a: string, b: string, seed: number | null, source: LoanSource = apiLoanSource): TwinLoans {
  const [state, setState] = useState<{ key: string; loans: TwinLoans }>({ key: "", loans: { phase: "loading" } });
  const key = `${seed}:${a}:${b}`;
  useEffect(() => {
    if (seed === null) return;
    let live = true;
    portfolio(seed, source).then(
      (byId) => {
        const la = byId.get(a), lb = byId.get(b);
        if (live) setState({ key, loans: la && lb ? { phase: "ready", a: la, b: lb, pool: byId } : { phase: "missing" } });
      },
      (e: unknown) => live && setState({ key, loans: { phase: "error", message: e instanceof Error ? e.message : "The loans could not be loaded." } }),
    );
    return () => { live = false; };
  }, [key, a, b, seed, source]);
  if (seed === null) return { phase: "missing" };
  return state.key === key ? state.loans : { phase: "loading" };
}
