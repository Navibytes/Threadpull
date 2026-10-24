// Ticket 03: the ledger refuses over-budget calls, charges only successful ones, and reports every spend.
import { describe, expect, test } from "bun:test";
import { toolError, toolOk, TOOL_SPECS, type ToolResult } from "@/lib/contracts/tool-result";
import { DEFAULT_BUDGET, Ledger, type Spend } from "@/lib/ledger";

const crs = [{ kind: "crs" as const, product: "tu_identity", request_id: "req-1" }];
const identity = () => toolOk("crs_identity_check", { codes: ["2201"] }, crs);
const free = () => toolOk("check_address", { explains: false }, [{ kind: "lookup", name: "address_type", key: "a", simulated: true }], true);
const recorder = () => {
  const spends: Spend[] = [];
  return { spends, onSpend: (s: Spend) => void spends.push(s) };
};

describe("budget", () => {
  test("the default budget is 60 acorns", () => {
    expect(DEFAULT_BUDGET).toBe(60);
    expect(new Ledger().remaining).toBe(60);
  });
  test("a successful call is charged its TOOL_SPECS cost", async () => {
    const ledger = new Ledger();
    const r = await ledger.run("crs_identity_check", identity);
    expect(r.ok).toBe(true);
    expect(ledger.spent).toBe(TOOL_SPECS.crs_identity_check.acorns);
    expect(ledger.remaining).toBe(60 - 3);
  });
  test("a call that would go over budget is refused and the tool never runs", async () => {
    const ledger = new Ledger(2);
    let ran = false;
    const r = await ledger.run("crs_identity_check", () => ((ran = true), identity()));
    expect(r.ok).toBe(false);
    expect(r.error).toBe("over budget: crs_identity_check costs 3 acorns, 2 of 2 left");
    expect(r.cost.acorns).toBe(0);
    expect(ran).toBe(false);
    expect(ledger.spent).toBe(0);
  });
  test("the last acorn can be spent, the next call is refused", async () => {
    const ledger = new Ledger(3);
    expect((await ledger.run("crs_identity_check", identity)).ok).toBe(true);
    expect(ledger.remaining).toBe(0);
    expect((await ledger.run("crs_identity_check", identity)).ok).toBe(false);
    expect((await ledger.run("check_address", free)).ok).toBe(true); // free tools still run on an empty budget
  });
});

describe("only successful calls are charged", () => {
  test("a refused or failed result costs nothing and emits nothing", async () => {
    const { spends, onSpend } = recorder();
    const ledger = new Ledger(60, onSpend);
    const r = await ledger.run("crs_identity_check", () => toolError("crs_identity_check", "no sandbox persona for this loan"));
    expect(r.ok).toBe(false);
    expect(ledger.spent).toBe(0);
    expect(spends).toHaveLength(0);
  });
  test("a call that throws is given back and the error propagates", async () => {
    const ledger = new Ledger(3);
    await expect(ledger.run("crs_identity_check", () => { throw new Error("login failed"); })).rejects.toThrow("login failed");
    expect(ledger.spent).toBe(0);
    expect((await ledger.run("crs_identity_check", identity)).ok).toBe(true);
  });
});

describe("parallel calls", () => {
  test("two calls that cannot both fit do not overspend together", async () => {
    const ledger = new Ledger(5);
    let ran = 0;
    const call = async (): Promise<ToolResult<{ codes: string[] }>> => {
      ran++;
      await Promise.resolve(); // yield, so both calls are in flight at once
      return identity();
    };
    const [a, b] = await Promise.all([ledger.run("crs_identity_check", call), ledger.run("crs_identity_check", call)]);
    expect([a.ok, b.ok].sort()).toEqual([false, true]);
    expect(ran).toBe(1);
    expect(ledger.spent).toBe(3);
  });
});

describe("budget_spent", () => {
  test("every paid call reports the tool, cost, sources and the running budget", async () => {
    const { spends, onSpend } = recorder();
    const ledger = new Ledger(60, onSpend);
    await ledger.run("crs_identity_check", identity);
    await ledger.run("crs_identity_check", identity);
    expect(spends).toHaveLength(2);
    expect(spends[0]).toEqual({
      tool: "crs_identity_check", cost: { acorns: 3, unit: "1 CRS call" }, sources: crs, simulated: false, budget: { spent: 3, limit: 60 },
    });
    expect(spends[1].budget).toEqual({ spent: 6, limit: 60 });
  });
  test("a free tool spends nothing, so it emits nothing", async () => {
    const { spends, onSpend } = recorder();
    await new Ledger(60, onSpend).run("check_address", free);
    expect(spends).toHaveLength(0);
  });
  test("a simulated result is reported as simulated", async () => {
    const { spends, onSpend } = recorder();
    await new Ledger(60, onSpend).run("crs_identity_check", () => toolOk("crs_identity_check", { codes: [] }, crs, true));
    expect(spends[0].simulated).toBe(true);
  });
  test("the event is written before the result comes back", async () => {
    const order: string[] = [];
    const ledger = new Ledger(60, async () => { await Promise.resolve(); order.push("event"); });
    await ledger.run("crs_identity_check", identity);
    order.push("returned");
    expect(order).toEqual(["event", "returned"]);
  });
});
