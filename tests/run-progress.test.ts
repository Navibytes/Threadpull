// The board's progress strip reads a run's rows only: phase, budget, counts and time (lib/events/progress.ts).
import { describe, expect, test } from "bun:test";
import type { Event } from "@/lib/contracts/event";
import { clock, runProgress, type RunEvent } from "@/lib/events";

const row = (seq: number, type: Event["type"], extra: Partial<Event> = {}, spent = 0): RunEvent => ({
  run_id: "r", seq, ts: new Date(Date.UTC(2026, 9, 25, 5, 0, seq * 5)).toISOString(), type, loan_ids: [], tool: null, result: {},
  sources: [], note: "", budget: { spent, limit: 60 }, simulated: false, ...extra,
}) as RunEvent;

const started = row(1, "run_started", { result: { loans: 1000 } });
const lead = row(2, "lead_opened", { loan_ids: ["L0037"] });
const investigate = row(3, "status_changed", { loan_ids: ["L0037"], result: { status: "Investigate" } }, 3);
const asked = row(4, "question_asked", { loan_ids: ["L0742"], result: { question_id: "q-001" } }, 3);
const sweep = row(5, "lead_opened", { loan_ids: ["L0194"], result: { sweep: true } }, 3);
const clean = row(6, "status_changed", { loan_ids: ["L0194"], result: { status: "No material anomaly found" } }, 12);
const finished = row(7, "run_finished", { result: { stop_reason: "end_turn" } }, 12);

describe("runProgress", () => {
  test("phases follow the rows: starting, leads, spot checks, done", () => {
    expect(runProgress([]).phase).toBe("starting");
    expect(runProgress([started]).phase).toBe("starting");
    expect(runProgress([started, lead]).phase).toBe("leads");
    expect(runProgress([started, lead, investigate, sweep]).phase).toBe("spot_checks");
    expect(runProgress([started, lead, investigate, sweep, clean, finished]).phase).toBe("done");
  });

  test("counts, budget and time come from the rows", () => {
    const p = runProgress([started, lead, investigate, asked, sweep, clean]);
    expect(p).toMatchObject({ loans: 1000, spent: 12, limit: 60, cases: 1, spotChecks: 1, decided: 2, flagged: 1, questionsWaiting: 1,
      finishedAt: null, stopReason: null });
    expect(p.startedAt).toBe(Date.parse(started.ts));
    const answered = row(8, "question_answered", { result: { question_id: "q-001" } }, 12);
    expect(runProgress([started, asked, answered]).questionsWaiting).toBe(0);
    const done = runProgress([finished, clean, started, lead]); // order doesn't matter
    expect([done.phase, done.stopReason, done.finishedAt! - done.startedAt!]).toEqual(["done", "end_turn", 30_000]);
  });

  test("clock", () => {
    expect([clock(0), clock(47_000), clock(66_400), clock(723_000)]).toEqual(["0:00", "0:47", "1:06", "12:03"]);
  });
});

describe("the strip renders", () => {
  const render = async (events: RunEvent[]) => {
    const { renderToStaticMarkup } = await import("react-dom/server");
    const { createElement } = await import("react");
    const { RunProgressStrip } = await import("@/components/board/run-progress");
    return renderToStaticMarkup(createElement(RunProgressStrip, { events, runId: "r13-x" }));
  };

  test("a run still going: the full strip, with phases, acorns, counts, time and a Hide button (its last row is old here, so it says it is waiting)", async () => {
    const html = await render([started, lead, investigate, asked, sweep, clean]);
    for (const s of ["Following leads", "Spot checks", "Done", "<b>12</b> of 60 acorns", "1,000 loans scanned", "1 case opened", "1 spot check",
      "2 decided (1 Investigate)", "1 question waiting", "elapsed", "Waiting for the next step", ">Hide<"]) expect(html).toContain(s);
  });

  test("a finished run: folded to one line in the corner (Done, acorns, time, the CRO link, Details), covering no cards", async () => {
    const html = await render([started, lead, investigate, asked, sweep, clean, finished]);
    for (const s of [">Done<", "12 of 60 acorns", "0:30", "/cro?run=r13-x", ">Details<", "left-3 top-3"]) expect(html).toContain(s);
    expect(html).not.toContain("loans scanned");
  });

  test("no rows, no strip", async () => {
    expect(await render([])).toBe("");
  });
});
