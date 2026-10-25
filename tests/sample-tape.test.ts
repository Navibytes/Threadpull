// The JSON sample on the upload page (public/templates): the whole seed 13 portfolio as a bank would send it. Intake
// accepts every loan, and the file carries no generator truth (which loans are planted cases, which sandbox persona).
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { JSON_SAMPLE_URL } from "@/components/upload/upload-model";
import { intakeTape } from "@/lib/ingest/intake";

const text = readFileSync(join(import.meta.dir, "..", "public", JSON_SAMPLE_URL), "utf8");

describe("the JSON sample tape", () => {
  test("intake accepts all 1,000 loans, with their documents, and flags the one injected pay stub", () => {
    const r = intakeTape(text).report;
    expect([r.received, r.accepted, r.rejected.length]).toEqual([1000, 1000, 0]);
    expect(r.flagged_documents).toEqual(["L0445-PS"]);
  });

  test("no generator truth: no kind, no persona_id", () => {
    const loans = JSON.parse(text) as Record<string, unknown>[];
    expect(loans.some((l) => "kind" in l || "persona_id" in l)).toBe(false);
  });

  test("small enough for the upload limit", () => {
    expect(Buffer.byteLength(text)).toBeLessThan(10 * 1024 * 1024);
  });
});
