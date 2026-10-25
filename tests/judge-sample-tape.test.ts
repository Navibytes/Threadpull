// A visitor's own portfolio (data/sample-tape.ts, GET /api/sample-tape): any seed, a size the page offers, intake
// accepts every loan, the same request gives the same tape, and no generator truth or answer key goes out.
import { describe, expect, test } from "bun:test";
import { GET } from "@/app/api/sample-tape/route";
import { sampleTape } from "@/data/sample-tape";
import { sampleProblem } from "@/lib/ingest/sample";
import { intakeTape } from "@/lib/ingest/intake";

describe("a judge's sample tape", () => {
  test("any seed, each offered size: intake accepts every loan and flags the injected pay stub", () => {
    for (const [seed, loans] of [[4242, 300], [7, 500], [123456, 1000]] as const) {
      const r = intakeTape(JSON.stringify(sampleTape({ seed, loans }))).report;
      expect([r.received, r.accepted, r.rejected.length]).toEqual([loans, loans, 0]);
      expect(r.flagged_documents).toHaveLength(1);
      expect(r.sandbox_identities).toBeGreaterThan(0);
    }
  });

  test("same request, same tape; another seed, another tape", () => {
    const a = JSON.stringify(sampleTape({ seed: 31, loans: 300 }));
    expect(JSON.stringify(sampleTape({ seed: 31, loans: 300 }))).toBe(a);
    expect(JSON.stringify(sampleTape({ seed: 32, loans: 300 }))).not.toBe(a);
  });

  test("no generator truth in the tape", () => {
    const loans = sampleTape({ seed: 5, loans: 300 }) as unknown as Record<string, unknown>[];
    expect(loans.some((l) => "kind" in l || "persona_id" in l)).toBe(false);
  });

  test("refuses seeds and sizes it doesn't offer", () => {
    for (const [s, n] of [[0, 300], [1.5, 300], [1_000_000, 300], [NaN, 300], [5, 200], [5, 2000]])
      expect(sampleProblem(s, n)).not.toBeNull();
    expect(sampleProblem(5, 500)).toBeNull();
  });

  test("the route: 200 with a named JSON attachment, 400 for a bad request", async () => {
    const ok = GET(new Request("http://x/api/sample-tape?seed=4242&loans=300"));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-disposition")).toContain("sample-tape-seed4242-300-loans.json");
    expect((await ok.json()) as unknown[]).toHaveLength(300);
    const bad = GET(new Request("http://x/api/sample-tape?seed=abc&loans=300"));
    expect(bad.status).toBe(400);
  });
});
