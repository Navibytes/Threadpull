"use client";
// A one-line digest of each recorded run (how many loans, how many investigated), read from the existing report route, so the
// run picker can say what each run is. Read-only, a few at a time, newest first. It never decides which run is shown.
import { useEffect, useState } from "react";
import type { ReportBundle, RunSummary } from "@/lib/deal/service";
import { digestOf, type Digest } from "./findings";

const MAX_RUNS = 12;
const AT_ONCE = 3;

export function useRunDigests(runs: RunSummary[] | null): Digest[] {
  const [digests, setDigests] = useState<Digest[]>([]);
  useEffect(() => {
    if (!runs?.length) return;
    const ac = new AbortController();
    const queue = runs.slice(0, MAX_RUNS).map((r) => r.run_id);
    const worker = async () => {
      for (let id = queue.shift(); id; id = queue.shift()) {
        try {
          const res = await fetch(`/api/runs/${encodeURIComponent(id)}/report`, { signal: ac.signal });
          if (!res.ok) continue;
          const d = digestOf(((await res.json()) as ReportBundle).report);
          setDigests((prev) => (prev.some((p) => p.run_id === d.run_id) ? prev : [...prev, d]));
        } catch {
          /* a run whose report can't be read is simply not described in the picker */
        }
      }
    };
    void Promise.all(Array.from({ length: AT_ONCE }, worker));
    return () => ac.abort();
  }, [runs]);
  return digests;
}
