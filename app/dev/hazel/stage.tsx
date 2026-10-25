"use client";

// The pose and reaction rehearsal on the asset preview page. It drives HazelStanding through the same
// hazelState the board uses, from rows made up on this page, labeled as such; nothing here is a run.
import { useMemo, useState } from "react";
import { HazelStanding } from "@/components/notebook/hazel-standing";
import { hazelState, type RunEvent } from "@/lib/events";

const ROW_TYPES = ["check_run", "link_found", "clue_explained", "run_finished", "budget_spent"] as const;

const row = (seq: number, type: RunEvent["type"]): RunEvent => ({
  run_id: "asset-preview",
  seq,
  ts: new Date(0).toISOString(),
  type,
  loan_ids: [],
  tool: null,
  result: {},
  sources: [],
  note: "",
  budget: { spent: 0, limit: 60 },
  simulated: true,
});

export function HazelStage() {
  const [rows, setRows] = useState<RunEvent[]>([]);
  const [animateAfterSeq, setAnimateAfterSeq] = useState(0);
  const state = useMemo(() => hazelState(rows, animateAfterSeq), [rows, animateAfterSeq]);
  const add = (type: RunEvent["type"]) => setRows((r) => [...r, row(r.length + 1, type)]);

  const btn =
    "min-h-9 rounded-[3px] border border-walnut/25 bg-paper px-3 text-[13px] font-medium hover:bg-walnut/10 focus-visible:outline-2 focus-visible:outline-amber";
  return (
    <section aria-label="Reaction rehearsal" className="mt-10 grid gap-6 md:grid-cols-[1fr_320px]">
      <div className="relative h-[540px] overflow-hidden rounded-lg bg-[#2a2018]">
        <div className="absolute bottom-0 left-8 aspect-[1219/1290] w-[340px] -scale-x-100">
          <HazelStanding pose={state.pose} cue={state.cue} />
        </div>
      </div>
      <div className="space-y-3 text-sm">
        <p className="text-walnut/80">
          Append a made-up row; Hazel reacts through the board&rsquo;s own hazelState. Reduced motion follows the system
          setting.
        </p>
        <div className="flex flex-wrap gap-2">
          {ROW_TYPES.map((type) => (
            <button key={type} type="button" className={btn} onClick={() => add(type)}>
              {type}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={() => setAnimateAfterSeq(rows.at(-1)?.seq ?? 0)}>
            Reload (rows become history)
          </button>
          <button
            type="button"
            className={btn}
            onClick={() => {
              setRows([]);
              setAnimateAfterSeq(0);
            }}
          >
            Clear
          </button>
        </div>
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 tabular-nums" aria-live="polite">
          <dt className="text-walnut/80">pose</dt>
          <dd>{state.pose}</dd>
          <dt className="text-walnut/80">reaction</dt>
          <dd>{state.cue ? `${state.cue.kind} (${state.cue.key})` : "none"}</dd>
          <dt className="text-walnut/80">rows</dt>
          <dd>{rows.map((r) => r.type).join(", ") || "none"}</dd>
        </dl>
      </div>
    </section>
  );
}
