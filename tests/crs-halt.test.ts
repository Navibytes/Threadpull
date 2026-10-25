// Ticket 06: a deceased result halts that loan for the rest of the run, and only that loan. Real responses, no network.
import { describe, expect, test } from "bun:test";
import { createCrsClient, crsCreditReport, crsFraudFinder, crsIdentityCheck, crsReversePhone, memoryCache } from "@/lib/crs";
import { Ledger } from "@/lib/ledger";
import { client, loanOf, persona } from "./crs-replay";

/** A client that counts every request and fails it: a halted loan must never reach it. */
function noRequests() {
  let calls = 0;
  const fetch = (async (_input: RequestInfo | URL, _init?: RequestInit) => {
    calls++;
    return new Response("a halted loan sent a request", { status: 500 });
  }) as typeof globalThis.fetch;
  return { client: createCrsClient({ fetch, cache: memoryCache(), username: "u", password: "p" }), calls: () => calls };
}

describe("the ledger's halted list", () => {
  test("remembers the first reason, and knows nothing about other loans", () => {
    const ledger = new Ledger();
    ledger.halt("L0001", "first reason");
    ledger.halt("L0001", "second reason");
    expect(ledger.haltedBecause("L0001")).toBe("first reason");
    expect(ledger.haltedBecause("L0002")).toBeUndefined();
  });
});

describe("a deceased identity result (2301)", () => {
  test("halts the loan: every other loan-based CRS tool is then refused with no request and no acorns", async () => {
    const ledger = new Ledger();
    const first = await crsIdentityCheck(loanOf("P14"), ledger, client());
    expect(first.result?.messages.map((m) => m.code)).toEqual(["2301", "2101"]);
    expect(ledger.haltedBecause("L-P14")).toContain("2301");
    expect(ledger.spent).toBe(3);

    const dead = noRequests();
    const refused = [
      await crsCreditReport(loanOf("P14"), ledger, dead.client),
      await crsFraudFinder(loanOf("P14"), ledger, dead.client),
      await crsIdentityCheck(loanOf("P14"), ledger, dead.client),
    ];
    for (const r of refused) {
      expect(r.ok).toBe(false);
      expect(r.error).toContain("halted, nothing sent");
      expect(r.cost.acorns).toBe(0);
    }
    expect(dead.calls()).toBe(0);
    expect(ledger.spent).toBe(3); // the three refusals charged nothing
  });

  test("other deceased-free results do not halt: failed identity (2201) and a fraud alert (2401) keep working", async () => {
    const ledger = new Ledger();
    await crsIdentityCheck(loanOf("P12"), ledger, client()); // 2201 + 2202 + 2101
    await crsIdentityCheck(loanOf("P16"), ledger, client()); // 2401
    expect(ledger.haltedBecause("L-P12")).toBeUndefined();
    expect(ledger.haltedBecause("L-P16")).toBeUndefined();
    expect((await crsCreditReport(loanOf("P12"), ledger, client())).ok).toBe(true);
  });
});

describe("a deceased credit report", () => {
  test("halts the loan too, so a later identity check is refused", async () => {
    const ledger = new Ledger();
    const report = await crsCreditReport(loanOf("P14"), ledger, client());
    expect(report.result?.deceased).toBe(true);
    expect(ledger.haltedBecause("L-P14")).toContain("deceased");
    const dead = noRequests();
    const after = await crsIdentityCheck(loanOf("P14"), ledger, dead.client);
    expect(after.ok).toBe(false);
    expect(after.error).toContain("halted, nothing sent");
    expect(dead.calls()).toBe(0);
  });
});

describe("scope of the halt", () => {
  test("halt one loan, never the batch: other loans keep being checked", async () => {
    const ledger = new Ledger();
    await crsIdentityCheck(loanOf("P14"), ledger, client());
    const other = await crsIdentityCheck(loanOf("P13"), ledger, client());
    expect(other.ok).toBe(true);
    expect(other.result?.messages.map((m) => m.code)).toEqual(["2201", "2202", "2101"]);
  });

  test("a new run (a new ledger) starts with nothing halted", async () => {
    const first = new Ledger();
    await crsIdentityCheck(loanOf("P14"), first, client());
    expect(first.haltedBecause("L-P14")).toBeDefined();
    const next = new Ledger();
    expect(next.haltedBecause("L-P14")).toBeUndefined();
    expect((await crsIdentityCheck(loanOf("P14"), next, client())).ok).toBe(true);
  });

  test("the reverse phone lookup takes a phone, not a loan, so it is not halted", async () => {
    const ledger = new Ledger();
    await crsIdentityCheck(loanOf("P14"), ledger, client());
    expect((await crsReversePhone(persona("P14").phone, ledger, client())).ok).toBe(true);
  });
});
