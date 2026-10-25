// The landing page's "open the room" link and the claims its copy makes about where it leads.
import { describe, expect, test } from "bun:test";
import { DEMO_HREF } from "@/components/landing/demo";
import { DEFAULT_SCENARIO, reduceEvents, scenarioById, SCENARIOS } from "@/lib/events";

describe("where the landing page's button leads", () => {
  const id = new URL(DEMO_HREF, "http://x").searchParams.get("scenario")!;
  const sample = scenarioById(id);

  test("to a sample situation that exists, without changing the room's own default", () => {
    expect(SCENARIOS.map((s) => s.id)).toContain(id);
    expect(sample.id).toBe(id);
    expect(DEFAULT_SCENARIO).toBe("phone");
    expect(id).not.toBe(DEFAULT_SCENARIO);
  });

  test("and the copy beside the button is true of it: six cases, two taken down by a cited check", () => {
    const leads = new Set(sample.events.filter((e) => e.type === "lead_opened").flatMap((e) => e.loan_ids));
    expect(leads.size).toBe(6);
    const board = reduceEvents(sample.events);
    const takenDown = board.threads.filter((t) => t.explained && t.explained.sources.length > 0);
    // each taken-down thread cites the check row that explains it; two cases have them
    const casesWithOne = new Set(takenDown.map((t) => [...leads].find((l) => t.a === l || t.b === l)));
    expect(casesWithOne.size).toBe(2);
  });

  test("every row of the sample is marked simulated, so the room can say so", () => {
    expect(sample.events.every((e) => e.simulated)).toBe(true);
  });
});
