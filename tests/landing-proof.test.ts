// The landing page's results must be PROOF.md's results: every row, run id, commit and ring-complete figure.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { markdownRow, PROOF } from "@/components/landing/proof-data";

const proof = readFileSync(join(import.meta.dir, "..", "docs", "PROOF.md"), "utf8");
const section = (seed: number) => {
  const start = proof.indexOf(`## Seed ${seed}\n`);
  expect(start).toBeGreaterThanOrEqual(0);
  const next = proof.indexOf("\n## ", start + 1);
  return proof.slice(start, next < 0 ? undefined : next);
};

describe("landing page results", () => {
  for (const s of PROOF) {
    test(`seed ${s.seed} matches docs/PROOF.md`, () => {
      const text = section(s.seed);
      for (const r of s.rows) expect(text).toContain(markdownRow(r));
      expect(text).toContain(`\`${s.run}\``);
      expect(text).toContain(`commit \`${s.commit}\``);
      expect(text).toContain(`after **${s.ringCompleteAt} acorns**`);
    });
  }
  test("the held-out seed comes first and both seeds are shown", () => {
    expect(PROOF.map((s) => s.seed)).toEqual([99, 13]);
  });
});
