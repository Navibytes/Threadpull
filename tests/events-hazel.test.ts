// Hazel's pose and notebook come only from applied event rows, in seq order.
import { describe, expect, test } from "bun:test";
import { hazelPose, notebookEntry, PREVIEW_EVENTS, reduceEvents, type RunEvent } from "@/lib/events";

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
