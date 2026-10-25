// Every sample situation is a valid event sequence, labelled simulated, and reads the way its label says.
import { describe, expect, test } from "bun:test";
import { EventSchema } from "@/lib/contracts/event";
import { reduceEvents, SCENARIOS, scenarioById } from "@/lib/events";

describe("sample situations", () => {
  test.each(SCENARIOS.map((s) => [s.id, s] as const))("%s validates and is labelled simulated", (_id, s) => {
    for (const e of s.events) {
      expect(() => EventSchema.parse(e)).not.toThrow();
      expect(e.simulated).toBe(true);
    }
    expect(new Set(s.events.map((e) => e.seq)).size).toBe(s.events.length);
  });

  test("the explained situation takes its thread down with a cited check", () => {
    const board = reduceEvents(scenarioById("explained").events);
    expect(board.threads).toHaveLength(1);
    expect(board.threads[0].explained).not.toBeNull();
  });

  test("the ring situation keeps every connection open", () => {
    const board = reduceEvents(scenarioById("ring").events);
    expect(board.threads).toHaveLength(2);
    expect(board.threads.every((t) => t.explained === null)).toBe(true);
  });

  test("an unknown id falls back to the shared phone situation", () => {
    expect(scenarioById("nope").id).toBe("phone");
  });
});

describe("large sample situations", () => {
  test.each([["busy", 19, 13, 4], ["large", 31, 21, 9]] as const)("%s: every loan is on the board, and only the explained threads are taken down", (id, loans, threads, explained) => {
    const board = reduceEvents(scenarioById(id).events);
    expect(board.cards).toHaveLength(loans);
    expect(board.threads).toHaveLength(threads);
    expect(board.threads.filter((t) => t.explained !== null)).toHaveLength(explained);
  });
});
