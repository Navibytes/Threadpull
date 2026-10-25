// Hazel's pose and notebook come only from applied event rows, in seq order.
import { describe, expect, test } from "bun:test";
import { applyEvent, emptyBoard, hazelPose, hazelState, notebookEntry, PREVIEW_EVENTS, reduceEvents, type RunEvent } from "@/lib/events";

const base = PREVIEW_EVENTS[0];
const ev = (seq: number, type: RunEvent["type"], extra: Partial<RunEvent> = {}): RunEvent => ({
  ...base,
  run_id: "r-hazel",
  seq,
  type,
  tool: null,
  loan_ids: [],
  result: {},
  note: `note ${seq}`,
  ...extra,
});
const events = (...rows: RunEvent[]) => reduceEvents(rows).events;

describe("Hazel's pose", () => {
  test("is idle with no events, and with only rows that don't change it", () => {
    expect(hazelPose([])).toEqual({ pose: "idle", seq: null });
    expect(hazelPose(events(ev(1, "run_started"), ev(2, "lead_opened"), ev(3, "budget_spent")))).toEqual({
      pose: "idle",
      seq: null,
    });
  });

  test("check_run → thinking, link_found → discovery, clue_explained → resolved", () => {
    expect(hazelPose(events(ev(1, "check_run")))).toEqual({ pose: "thinking", seq: 1 });
    expect(hazelPose(events(ev(1, "check_run"), ev(2, "link_found")))).toEqual({ pose: "discovery", seq: 2 });
    expect(hazelPose(events(ev(1, "link_found"), ev(2, "clue_explained")))).toEqual({ pose: "resolved", seq: 2 });
  });

  test("other rows keep the last pose", () => {
    expect(hazelPose(events(ev(1, "check_run"), ev(2, "budget_spent"), ev(3, "status_changed"))).pose).toBe("thinking");
  });

  test("follows seq order, not arrival order", () => {
    const rows = [ev(2, "clue_explained"), ev(1, "check_run")];
    expect(hazelPose(reduceEvents(rows).events)).toEqual({ pose: "resolved", seq: 2 });
  });

  test("the PREVIEW fixture's own link_found sets discovery; nothing is added to it", () => {
    expect(PREVIEW_EVENTS.map((e) => e.type)).toEqual(["run_started", "lead_opened", "link_found"]);
    expect(hazelPose(reduceEvents(PREVIEW_EVENTS).events)).toEqual({ pose: "discovery", seq: 3 });
  });
});

describe("Hazel's notebook", () => {
  test("is empty with no events", () => {
    expect(notebookEntry([])).toBeNull();
  });

  test("shows the latest row's own fields and leaves unrecorded ones null", () => {
    const e = notebookEntry(
      events(
        ev(1, "check_run", { tool: "crs_identity_check", loan_ids: ["L0037"], budget: { spent: 3, limit: 60 } }),
        ev(2, "budget_spent", { simulated: false, budget: { spent: 6, limit: 60 } }),
      ),
    );
    expect(e).toMatchObject({ seq: 2, type: "budget_spent", saw: "note 2", why: null, next: null, simulated: false });
    expect(e?.budget).toEqual({ spent: 6, limit: 60 });
  });

  test("a blank note is shown as not recorded, not as an empty claim", () => {
    expect(notebookEntry(events(ev(1, "check_run", { note: "  " })))?.saw).toBeNull();
  });
});

describe("Hazel's reactions", () => {
  const run = [
    ev(1, "run_started"),
    ev(2, "check_run"),
    ev(3, "link_found"),
    ev(4, "budget_spent"),
    ev(5, "clue_explained", {
      result: { edge_ids: ["e1"], explained_by: "check_address", reason: "a 212-unit apartment building" },
      sources: [{ kind: "event", run_id: "r-hazel", seq: 2 }],
    }),
    ev(6, "run_finished"),
  ];

  test("each reacting row maps to its reaction: lean, perk, nod, settle", () => {
    const at = (n: number) => hazelState(events(...run.slice(0, n)), 0).cue?.kind ?? null;
    expect([1, 2, 3, 4, 5, 6].map(at)).toEqual([null, "lean", "perk", "perk", "nod", "settle"]);
  });

  test("the cue is keyed by the row's identity, so a re-render or a duplicate row doesn't replay it", () => {
    const once = hazelState(events(ev(1, "check_run"), ev(2, "link_found")), 0);
    expect(once.cue).toEqual({ kind: "perk", key: "r-hazel:2" });
    // the same row delivered twice (a Realtime retry, a history/live overlap) is applied once
    const twice = reduceEvents([ev(1, "check_run"), ev(2, "link_found"), ev(2, "link_found")]);
    expect(hazelState(twice.events, 0)).toEqual(once);
    const again = applyEvent(reduceEvents([ev(1, "check_run"), ev(2, "link_found")]), ev(2, "link_found"));
    expect(hazelState(again.events, 0)).toEqual(once);
    // a row that doesn't react leaves the cue (and its key) as it was
    expect(hazelState(events(ev(1, "check_run"), ev(2, "link_found"), ev(3, "budget_spent")), 0).cue).toEqual(once.cue);
  });

  test("history on load sets the pose but plays nothing; rows after it react", () => {
    const loaded = events(...run.slice(0, 3)); // history ends at seq 3
    expect(hazelState(loaded, 3)).toEqual({ pose: "discovery", seq: 3, cue: null });
    expect(hazelState(loaded)).toEqual({ pose: "discovery", seq: 3, cue: null }); // before history has arrived
    const live = applyEvent(reduceEvents(run.slice(0, 3)), run[4]);
    expect(hazelState(live.events, 3).cue).toEqual({ kind: "nod", key: "r-hazel:5" });
  });

  test("replay: the state at a cursor depends only on the rows up to it", () => {
    const states = run.map((_, i) => hazelState(reduceEvents(run.slice(0, i + 1)).events, 0));
    const again = run.map((_, i) => hazelState(run.slice(0, i + 1).reduce(applyEvent, emptyBoard).events, 0));
    expect(again).toEqual(states);
    expect(states.map((s) => s.pose)).toEqual(["idle", "thinking", "discovery", "discovery", "resolved", "resolved"]);
    // stepping back rebuilds from the earlier cursor: the same state as when it was first reached
    expect(hazelState(reduceEvents(run.slice(0, 3)).events, 0)).toEqual(states[2]);
  });

  test("run_finished settles a running check to idle and keeps a discovery or a resolution", () => {
    expect(hazelState(events(ev(1, "check_run"), ev(2, "run_finished")), 0).pose).toBe("idle");
    expect(hazelState(events(ev(1, "link_found"), ev(2, "run_finished")), 0).pose).toBe("discovery");
    expect(hazelState(events(ev(1, "run_finished")), 0).pose).toBe("idle");
  });
});

describe("Hazel's notebook, grounded in the row", () => {
  test("a link: what it shares, its rarity weight, and the thread you can open", () => {
    const e = notebookEntry(events(ev(1, "link_found", { note: "", loan_ids: ["L1", "L2"], result: { kind: "phone", weight: 0.33 } })));
    expect(e?.saw).toBe("L1 and L2 share a phone.");
    expect(e?.why).toContain("weighs 0.33");
    expect(e?.why).toContain("A connection is not proof.");
    expect(e?.next).toBe("Select the thread between L1 and L2 to see its sources.");
  });

  test("a link without a weight says nothing about why", () => {
    expect(notebookEntry(events(ev(1, "link_found", { loan_ids: ["L1", "L2"], result: { kind: "phone" } })))?.why).toBeNull();
  });

  test("an explained clue quotes its own reason and what explained it", () => {
    const e = notebookEntry(
      events(
        ev(1, "clue_explained", {
          result: { edge_ids: ["e1"], explained_by: "rule", rule_id: "R-001", reason: "same hospital employer" },
          sources: [{ kind: "rule", rule_id: "R-001", version: 1 }],
        }),
      ),
    );
    expect(e?.why).toBe("Suspicion comes down: same hospital employer (rule R-001). The shared fact stays on the board.");
  });

  test("a question waits on its recipient; a check records no next step", () => {
    expect(notebookEntry(events(ev(1, "question_asked", { result: { to: "credit_analyst" } })))?.next).toBe(
      "Waiting for an answer from credit analyst.",
    );
    expect(notebookEntry(events(ev(1, "check_run", { tool: "check_address" })))).toMatchObject({ why: null, next: null });
  });
});
