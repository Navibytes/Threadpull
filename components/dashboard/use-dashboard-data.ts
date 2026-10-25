"use client";

import { useCallback, useEffect, useState } from "react";
import { apiLoanSource, type Portfolio } from "@/components/drawer/loan-source";
import type { Loan } from "@/lib/contracts/loan";
import { browserClient } from "@/lib/db/browser";
import { EventSchema, scenarioById, scenarioRunId, type RunEvent } from "@/lib/events";

export type Load<T> = { state: "loading" } | { state: "ok"; data: T } | { state: "error"; message: string } | { state: "off"; message: string };

export type RunsInfo = { runs: string[]; selected: string | null };

const ROW_LIMIT = 2000;

// Reads only what the app already exposes: the loan files through /api/loans, and the run's event rows through
// the browser (anon) Supabase client, which can read the events table. No new queries, tables or routes.
export function useDashboardData({ run, seed, sample, scenario }: { run?: string; seed: Portfolio; sample: boolean; scenario?: string }) {
  const [loans, setLoans] = useState<Load<Loan[]>>({ state: "loading" });
  const [events, setEvents] = useState<Load<{ rows: RunEvent[]; invalid: number; truncated: boolean }>>({ state: "loading" });
  const [runs, setRuns] = useState<RunsInfo>({ runs: [], selected: null });
  const [tick, setTick] = useState(0);
  const retry = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    const ac = new AbortController();
    setLoans({ state: "loading" });
    apiLoanSource
      .load({ seed, signal: ac.signal })
      .then((data) => setLoans({ state: "ok", data }))
      .catch((e: unknown) => {
        if (!ac.signal.aborted) setLoans({ state: "error", message: e instanceof Error ? e.message : "The loan files could not be loaded." });
      });
    return () => ac.abort();
  }, [seed, tick]);

  useEffect(() => {
    let cancelled = false;
    setEvents({ state: "loading" });
    if (sample) {
      const sc = scenarioById(scenario);
      setRuns({ runs: [scenarioRunId(sc)], selected: scenarioRunId(sc) });
      setEvents({ state: "ok", data: { rows: sc.events, invalid: 0, truncated: false } });
      return;
    }
    const client = browserClient();
    if (!client) {
      setRuns({ runs: [], selected: null });
      setEvents({ state: "off", message: "The event log isn't connected: NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are not set." });
      return;
    }
    (async () => {
      let selected = run ?? null;
      let list: string[] = [];
      const recent = await client.from("events").select("run_id,ts").order("ts", { ascending: false }).limit(1000);
      if (recent.error) throw new Error("The event log could not be read.");
      list = [...new Set((recent.data ?? []).map((r: { run_id: string }) => r.run_id))];
      if (!selected) selected = list[0] ?? null;
      if (selected && !list.includes(selected)) list = [selected, ...list];
      if (cancelled) return;
      setRuns({ runs: list, selected });
      if (!selected) {
        setEvents({ state: "ok", data: { rows: [], invalid: 0, truncated: false } });
        return;
      }
      const res = await client.from("events").select("*").eq("run_id", selected).order("seq", { ascending: true }).range(0, ROW_LIMIT - 1);
      if (res.error) throw new Error("This run's rows could not be read.");
      const parsed = (res.data ?? []).map((row: unknown) => EventSchema.safeParse(row));
      if (!cancelled)
        setEvents({
          state: "ok",
          data: {
            rows: parsed.flatMap((p) => (p.success ? [p.data] : [])),
            invalid: parsed.filter((p) => !p.success).length,
            truncated: (res.data ?? []).length >= ROW_LIMIT,
          },
        });
    })().catch((e: unknown) => {
      if (!cancelled) setEvents({ state: "error", message: e instanceof Error ? e.message : "The event log could not be read." });
    });
    return () => {
      cancelled = true;
    };
  }, [run, sample, scenario, tick]);

  return { loans, events, runs, retry };
}
