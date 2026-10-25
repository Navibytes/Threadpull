// Hazel's thought bubble and verdict stamp (components/notebook/thoughts-model.ts) and the replay feed
// (lib/events/replay-feed.ts): only recorded rows are shown, each once, at a readable pace, and a replay is paced
// like the original without any scripted step.
import { describe, expect, test } from "bun:test";
import { PACE, ThoughtQueue, thoughtFor, verdictFor } from "@/components/notebook/thoughts-model";
import { replayFeed, replayGapMs, type RunEvent } from "@/lib/events";

const row = (seq: number, type: RunEvent["type"], extra: Partial<RunEvent> = {}): RunEvent => ({
  run_id: "r1",
  seq,
  ts: new Date(Date.UTC(2026, 9, 25, 10, 0, 0) + seq * 1000).toISOString(),
  type,
  loan_ids: [],
  tool: null,
  result: {},
  sources: [],
  note: "",
  budget: { spent: seq, limit: 60 },
  simulated: false,
  ...extra,
});

describe("what a row says", () => {
  test("a step is worded from the row's own fields, with the log's boilerplate left out", () => {
    const t = thoughtFor(row(3, "check_run", { tool: "inspect_loan", loan_ids: ["L0209"], note: "inspect_loan ran." }))!;
    expect(t.stage).toBe("check");
    expect(t.title).toBe("Ran a check (inspect loan) on Loan L0209");
    expect(t.detail).toBeNull();
    expect(t.acorns).toEqual({ spent: 3, limit: 60 });
    expect(thoughtFor(row(5, "link_found", { loan_ids: ["L0170", "L0209"], result: { kind: "bank_account" }, note: "Same bank account; 3 loans in the pool share it." }))!.detail).toBe("Same bank account; 3 loans in the pool share it.");
  });

  test("bookkeeping rows and conclusions are not steps", () => {
    expect(thoughtFor(row(1, "run_started"))).toBeNull();
    expect(thoughtFor(row(2, "budget_spent"))).toBeNull();
    expect(thoughtFor(row(3, "status_changed", { loan_ids: ["L1"], result: { status: "Investigate" } }))).toBeNull();
    expect(thoughtFor(row(4, "clue_explained"))).toBeNull();
  });

  test("a closed lead is a verdict in the exact status word, with her own reason", () => {
    const v = verdictFor(row(9, "status_changed", { loan_ids: ["L0859"], result: { status: "Investigate", reason: "CRS 2201 and 2202 mismatch" } }))!;
    expect(v.kind).toBe("status");
    expect(v.label).toBe("Investigate");
    expect(v.names).toBe("Loan L0859");
    expect(v.reason).toBe("CRS 2201 and 2202 mismatch");
    // a word that isn't one of the supported statuses, or no status at all, is not a conclusion
    expect(verdictFor(row(10, "status_changed", { loan_ids: ["L1"], result: { status: "Looks fine" } }))).toBeNull();
    expect(verdictFor(row(11, "status_changed", { loan_ids: ["L1"], result: { status: "Not reviewed" } }))).toBeNull();
    expect(verdictFor(row(12, "status_changed", { loan_ids: [], result: { status: "Investigate" } }))).toBeNull();
  });

  test("a thread taken down is a verdict that cites the check, and one without a valid explanation is nothing", () => {
    const ok = row(20, "clue_explained", {
      loan_ids: ["L0393", "L0737"],
      result: { edge_ids: ["e1"], explained_by: "check_address", reason: "a 50-unit building" },
      sources: [{ kind: "event", run_id: "r1", seq: 19 }],
    });
    const v = verdictFor(ok)!;
    expect(v.kind).toBe("explained");
    expect(v.label).toBe("Explained");
    expect(v.cited).toBe("check address");
    expect(v.reason).toBe("a 50-unit building");
    expect(verdictFor(row(21, "clue_explained", { result: { reason: "x" } }))).toBeNull();
  });

  test("nothing says a loan is fraud", () => {
    const rows = [row(1, "lead_opened", { loan_ids: ["L1"] }), row(2, "status_changed", { loan_ids: ["L1"], result: { status: "Investigate", reason: "shares a bank account" } })];
    for (const r of rows) for (const text of [thoughtFor(r)?.title, verdictFor(r)?.label, verdictFor(r)?.reason]) expect(text ?? "").not.toMatch(/fraudster|guilty|criminal/i);
  });
});

describe("the pace", () => {
  test("each step stays up for its time, then the next appears; a connection lingers", () => {
    const q = new ThoughtQueue();
    q.push([row(1, "lead_opened", { loan_ids: ["L1"] }), row(2, "link_found", { loan_ids: ["L1", "L2"], result: { kind: "phone" } }), row(3, "check_run", { tool: "inspect_loan", loan_ids: ["L2"] })]);
    expect(q.tick(0).thought?.seq).toBe(1);
    expect(q.tick(PACE.thoughtMs - 1).thought?.seq).toBe(1);
    expect(q.tick(PACE.thoughtMs).thought?.seq).toBe(2);
    expect(q.tick(PACE.thoughtMs + PACE.lingerMs - 1).thought?.seq).toBe(2);
    expect(q.tick(PACE.thoughtMs + PACE.lingerMs).thought?.seq).toBe(3);
  });

  test("the bubble fades after the last step, and nothing is shown twice", () => {
    const q = new ThoughtQueue();
    q.push([row(1, "lead_opened", { loan_ids: ["L1"] })]);
    expect(q.tick(0).thought?.seq).toBe(1);
    expect(q.tick(PACE.thoughtMs + PACE.idleMs - 1).thought?.seq).toBe(1);
    expect(q.tick(PACE.thoughtMs + PACE.idleMs).thought).toBeNull();
    expect(q.tick(PACE.thoughtMs + PACE.idleMs + 5000).thought).toBeNull();
  });

  test("a verdict stays up long enough to read, and the next one waits its turn", () => {
    const q = new ThoughtQueue();
    q.push([row(1, "status_changed", { loan_ids: ["L1"], result: { status: "Investigate" } })]);
    q.push([row(2, "status_changed", { loan_ids: ["L2"], result: { status: "No material anomaly found" } })]);
    expect(q.tick(0).verdict?.names).toBe("Loan L1");
    expect(q.tick(PACE.verdictHurriedMs - 1).verdict?.names).toBe("Loan L1");
    expect(q.tick(PACE.verdictHurriedMs).verdict?.names).toBe("Loan L2"); // hurried: another was waiting
    expect(q.tick(PACE.verdictHurriedMs + PACE.verdictMs).verdict).toBeNull();
  });

  test("when the run outruns the bubble, routine steps are skipped and connections and conclusions are kept", () => {
    const q = new ThoughtQueue();
    const rows: RunEvent[] = [];
    for (let i = 1; i <= 12; i++) rows.push(row(i, "check_run", { tool: "inspect_loan", loan_ids: [`L${i}`] }));
    rows.push(row(13, "link_found", { loan_ids: ["L1", "L2"], result: { kind: "phone" } }));
    rows.push(row(14, "status_changed", { loan_ids: ["L1"], result: { status: "Investigate" } }));
    q.push(rows);
    expect(q.skipped).toBeGreaterThan(0);
    expect(q.pending).toBeLessThanOrEqual(PACE.maxBacklog + 1);
    const seen = new Set<number>();
    let verdict = null;
    for (let t = 0; t < 30000; t += 100) {
      const v = q.tick(t);
      if (v.thought) seen.add(v.thought.seq);
      verdict = verdict ?? v.verdict;
    }
    expect(seen.has(13)).toBe(true); // the connection was shown
    expect(verdict).not.toBeNull(); // so was the conclusion
  });

  test("the same rows at the same times always show the same thing", () => {
    const run = () => {
      const q = new ThoughtQueue();
      q.push([row(1, "lead_opened", { loan_ids: ["L1"] }), row(2, "check_run", { tool: "inspect_loan", loan_ids: ["L1"] })]);
      return [0, 400, 700, 1500, 9000].map((t) => q.tick(t).thought?.seq ?? null);
    };
    expect(run()).toEqual(run());
  });
});

describe("replay", () => {
  const rows = [row(1, "run_started"), row(2, "lead_opened", { loan_ids: ["L1"] }), row(3, "check_run"), row(4, "run_finished")];

  test("the gap between rows is their recorded gap, clamped, divided by the speed", () => {
    expect(replayGapMs(rows[0], rows[1], 1)).toBe(1000);
    expect(replayGapMs(rows[0], rows[1], 4)).toBe(250);
    const far = row(5, "run_finished", { ts: "2026-10-25T10:30:00.000Z" });
    expect(replayGapMs(rows[2], far, 1)).toBe(2500); // a long pause is capped
    const same = row(6, "check_run", { ts: rows[2].ts });
    expect(replayGapMs(rows[2], same, 1)).toBe(120); // rows that landed together play a beat apart
  });

  test("nothing counts as history, the rows arrive one at a time in order, and stopping stops them", () => {
    const timers: { fn: () => void; ms: number; live: boolean }[] = [];
    const schedule = (fn: () => void, ms: number) => {
      const t = { fn, ms, live: true };
      timers.push(t);
      return () => void (t.live = false);
    };
    const feed = replayFeed([rows[2], rows[0], rows[3], rows[1]], "r1", { speed: 2, mode: "preview", schedule });
    expect(feed.mode).toBe("preview");
    const got: number[][] = [];
    let history = null as number | null;
    const stop = feed.subscribe((batch) => got.push(batch.map((r) => r.seq)), undefined, undefined, (s) => (history = s));
    expect(history).toBe(0);
    expect(got).toEqual([]);
    const play = () => { const t = timers.find((x) => x.live)!; t.live = false; t.fn(); return t.ms; };
    expect(play()).toBe(0);
    expect(play()).toBe(500); // 1000ms recorded gap at 2x
    expect(got).toEqual([[1], [2]]);
    stop();
    expect(timers.filter((t) => t.live)).toHaveLength(0);
    expect(got).toEqual([[1], [2]]);
  });
});
