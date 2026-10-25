// Ticket 03: the identity check against the real sandbox responses recorded on 2026-10-24 (data/record-crs.ts).
// The fake-sandbox tests use hand-built bodies; this one checks the tool against what CRS really sent.
import { describe, expect, test } from "bun:test";
import { crsIdentityCheck } from "@/lib/crs";
import { bodyForLoan } from "@/lib/crs/persona-guard";
import { Ledger } from "@/lib/ledger";
import { client, loanOf, rec } from "./crs-replay";

// Codes seen live on 2026-10-24.
const IDENTITY: Record<string, string[]> = {
  P01: [], P08: [], P12: ["2201", "2202", "2101"], P13: ["2201", "2202", "2101"],
  P14: ["2301", "2101"], P15: [], P16: ["2401"], P17: [],
};

describe("crs_identity_check on the real responses", () => {
  test("every recorded persona is answered with the codes CRS really returned", async () => {
    expect(Object.keys(rec.identity).sort()).toEqual(Object.keys(IDENTITY).sort());
    for (const [id, codes] of Object.entries(IDENTITY)) {
      const ledger = new Ledger();
      const r = await crsIdentityCheck(loanOf(id), ledger, client());
      expect(r.ok).toBe(true);
      expect(r.result?.messages.map((m) => m.code)).toEqual(codes);
      expect(r.result?.verified).toBe(codes.length === 0);
      expect(r.sources).toEqual([{ kind: "crs", product: "tu_identity", request_id: rec.identity[id].request_id }]);
      expect(r.simulated).toBe(false);
      expect(ledger.spent).toBe(3);
    }
  });
  test("the guard builds exactly the request the sandbox answered", () => {
    for (const id of Object.keys(IDENTITY)) expect(bodyForLoan("tu_identity", loanOf(id))).toEqual(rec.identity[id].request);
  });
});
