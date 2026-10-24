"use client";

import { useMemo, useState } from "react";
import { previewFeed } from "@/lib/events";
import { Corkboard, type Selection } from "./corkboard";
import { EvidencePanel } from "./evidence-panel";
import { ModeBadge } from "./mode-badge";
import { useRunEvents } from "./use-run-events";

export function InvestigatorView() {
  // The only data source today is the PREVIEW fixture. Replay/live feeds plug in here.
  const feed = useMemo(() => previewFeed(), []);
  const board = useRunEvents(feed);
  const [selection, setSelection] = useState<Selection>(null);

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex flex-wrap items-baseline gap-x-5 gap-y-1 border-b border-walnut/15 px-6 py-3">
        <h1 className="font-display text-2xl font-semibold">Threadpull</h1>
        <p className="text-sm text-walnut/80">Find the ring. Protect the innocent. Decide the deal.</p>
        <div className="ml-auto self-center">
          <ModeBadge mode={feed.mode} runId={feed.runId} />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 gap-4 p-4">
        <section aria-label="Corkboard" className="cork relative min-w-0 flex-1 overflow-hidden rounded-lg">
          <Corkboard board={board} onSelect={setSelection} />
          {feed.mode === "preview" && (
            <p className="pointer-events-none absolute left-5 top-5 rounded border border-honey bg-paper/90 px-3 py-1.5 text-xs font-medium text-walnut shadow-sm">
              PREVIEW · synthetic fixture · not a live or recorded investigation
            </p>
          )}
        </section>
        <EvidencePanel board={board} selection={selection} mode={feed.mode} />
      </main>
    </div>
  );
}
