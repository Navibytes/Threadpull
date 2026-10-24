"use client";

import { useMemo, useState } from "react";
import { browserClient } from "@/lib/db/browser";
import { hazelPose, previewFeed, supabaseFeed } from "@/lib/events";
import { HazelNotebook } from "@/components/notebook/hazel-notebook";
import { HazelStanding } from "@/components/notebook/hazel-standing";
import { Corkboard, type Selection } from "./corkboard";
import { EvidencePanel } from "./evidence-panel";
import { ModeBadge } from "./mode-badge";
import { useRunEvents } from "./use-run-events";

// With ?run=<run_id> and Supabase configured, the board follows that run's event rows (history, then
// Realtime). Otherwise it shows the PREVIEW fixture, and says why.
export function InvestigatorView({ runId }: { runId?: string }) {
  const client = useMemo(() => (runId ? browserClient() : null), [runId]);
  const feed = useMemo(() => (runId && client ? supabaseFeed(client, runId) : previewFeed()), [runId, client]);
  const { board, errors } = useRunEvents(feed);
  const [selection, setSelection] = useState<Selection>(null);

  const notices = [
    ...(runId && !client
      ? [`Supabase isn't configured (NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY), so run ${runId} can't be shown.`]
      : []),
    ...errors,
  ];

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-walnut/15 px-6 py-3">
        <h1 className="font-display text-2xl font-semibold">Threadpull</h1>
        <p className="text-sm text-walnut/80">Find the ring. Protect the innocent. Decide the deal.</p>
        <div className="ml-auto self-center">
          <ModeBadge mode={feed.mode} runId={feed.runId} />
        </div>
      </header>

      {/* extra gap and floor so Hazel can step past the board's frame without covering the panels */}
      <main className="flex min-h-0 flex-1 gap-10 px-4 pb-9 pt-4">
        <div className="relative flex min-w-0 flex-1">
          <section aria-label="Corkboard" className="cork relative min-w-0 flex-1 overflow-hidden rounded-lg">
            <Corkboard board={board} onSelect={setSelection} />
            <div className="pointer-events-none absolute left-5 top-5 max-w-[70%] space-y-2">
              {feed.mode === "preview" && (
                <p className="w-fit rounded border border-honey bg-paper/90 px-3 py-1.5 text-xs font-medium text-walnut shadow-sm">
                  PREVIEW · synthetic fixture · not a live or recorded investigation
                </p>
              )}
              {notices.map((n) => (
                <p
                  key={n}
                  role="status"
                  className="w-fit rounded border border-terracotta bg-paper/95 px-3 py-1.5 text-xs font-medium text-walnut shadow-sm"
                >
                  {n}
                </p>
              ))}
            </div>
          </section>
          <HazelStanding pose={hazelPose(board.events).pose} />
        </div>
        <div className="flex min-h-0 w-[22rem] shrink-0 flex-col gap-4">
          <HazelNotebook board={board} mode={feed.mode} />
          <EvidencePanel board={board} selection={selection} mode={feed.mode} />
        </div>
      </main>
    </div>
  );
}
