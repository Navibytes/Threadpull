"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { InvestigatorView } from "@/components/board/investigator-view";
import { entranceTime } from "@/components/board/entrance-plan";
import { SCENARIOS, scenarioById, type RunEvent, type RunEventFeed } from "@/lib/events";

const bySeq = (a: RunEvent, b: RunEvent) => a.seq - b.seq;

// A feed that delivers a sample's rows by hand: everything before the first link as history (what the board shows on
// entry), then one row each time `step` is called. The board treats those rows exactly as it treats live ones.
function steppedFeed(events: RunEvent[], whole = false) {
  const rows = [...events].sort(bySeq);
  const firstLink = rows.findIndex((r) => r.type === "link_found");
  const start = whole || firstLink < 0 ? rows.length : firstLink;
  let sink: ((rows: RunEvent[]) => void) | null = null;
  let delivered = start;
  const feed: RunEventFeed = {
    mode: "preview",
    runId: rows[0]?.run_id ?? "entrance-rehearsal",
    subscribe(onEvents, _onError, _onReset, onHistory) {
      sink = onEvents;
      delivered = start;
      onEvents(rows.slice(0, start));
      onHistory?.(rows[start - 1]?.seq ?? 0);
      return () => {
        sink = null;
      };
    },
  };
  return {
    feed,
    rows,
    start,
    step: () => {
      if (!sink || delivered >= rows.length) return null;
      const row = rows[delivered++];
      sink([row]);
      return delivered;
    },
  };
}

const btn =
  "min-h-9 rounded-[3px] border border-walnut/30 bg-paper px-3 text-[13px] font-semibold text-walnut hover:bg-white focus-visible:outline-2 focus-visible:outline-amber disabled:opacity-45";

export function EntranceStage() {
  const [scenario, setScenario] = useState("phone");
  const [nonce, setNonce] = useState(0); // a new nonce is a new feed: the board is entered again
  const [slow, setSlow] = useState(1); // every duration and delay times this, for checking the feel frame by frame
  useEffect(() => () => void (entranceTime.scale = 1), []); // leaving the page restores real speed
  const [whole, setWhole] = useState(false); // true: the whole run is already recorded when the board is entered
  const stepped = useMemo(() => steppedFeed(scenarioById(scenario).events, whole), [scenario, nonce, whole]); // eslint-disable-line react-hooks/exhaustive-deps
  const [delivered, setDelivered] = useState(stepped.start);
  const next = stepped.rows[delivered];

  return (
    <>
      <InvestigatorView key={`${scenario}-${nonce}`} feed={stepped.feed} scenario={scenario} />
      <div
        role="group"
        aria-label="Entrance rehearsal"
        className="fixed bottom-3 left-1/2 z-50 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-md border border-walnut/30 bg-cream/95 px-3 py-2 shadow-lg"
      >
        <span className="text-[12px] font-semibold text-walnut/80">Dev rehearsal · sample rows</span>
        <select
          aria-label="Sample situation"
          value={scenario}
          onChange={(e) => {
            setScenario(e.target.value);
            setDelivered(steppedFeed(scenarioById(e.target.value).events, whole).start);
            setNonce((n) => n + 1);
          }}
          className="min-h-9 rounded-[3px] border border-walnut/30 bg-paper px-2 text-[13px]"
        >
          {SCENARIOS.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={btn}
          disabled={!next}
          onClick={() => {
            const n = stepped.step();
            if (n !== null) setDelivered(n);
          }}
        >
          {next ? `Add row ${delivered + 1} of ${stepped.rows.length}: ${next.type}${next.loan_ids.length ? ` (${next.loan_ids.join(", ")})` : ""}` : "All rows added"}
        </button>
        <label className="flex items-center gap-1.5 text-[13px] font-medium text-walnut">
          <input
            type="checkbox"
            checked={whole}
            onChange={(e) => {
              setWhole(e.target.checked);
              setDelivered(steppedFeed(scenarioById(scenario).events, e.target.checked).start);
              setNonce((n) => n + 1);
            }}
          />
          Whole run is history
        </label>
        <select
          aria-label="Playback speed"
          value={slow}
          onChange={(e) => {
            entranceTime.scale = Number(e.target.value);
            setSlow(Number(e.target.value));
          }}
          className="min-h-9 rounded-[3px] border border-walnut/30 bg-paper px-2 text-[13px]"
        >
          <option value={1}>Real speed</option>
          <option value={2}>2× slower</option>
          <option value={4}>4× slower</option>
          <option value={8}>8× slower</option>
        </select>
        <button
          type="button"
          className={btn}
          onClick={() => {
            setDelivered(stepped.start);
            setNonce((n) => n + 1);
          }}
        >
          Replay entrance
        </button>
        <Link href="/dashboard?sample=1" className={`${btn} inline-grid place-items-center`}>
          Go to dashboard
        </Link>
      </div>
    </>
  );
}
