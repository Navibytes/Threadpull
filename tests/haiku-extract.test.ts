// Ticket 08 trial (eval/haiku-extract.ts): the trials and the scoring, without a model. The layouts carry every value,
// the fixed-label parser can't read them (that's what the trial asks Haiku to do), and the injection trials exist.
import { describe, expect, test } from "bun:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generate } from "@/data/generate";
import { buildTrials, fieldsWrong, LAYOUTS } from "@/eval/haiku-extract";
import { parsePayStub } from "@/lib/evidence";

const gen = generate(join(import.meta.dir, "..", "data", "patterns", "seed13.json"), mkdtempSync(join(tmpdir(), "tp-")), mkdtempSync(join(tmpdir(), "tp-")));
const stubs = gen.normalized.flatMap((l) => l.documents.filter((d) => d.type === "pay_stub"));
const trials = buildTrials(stubs, 9);

describe("Haiku trial", () => {
  test("clean and layout trials per stub, and injection trials on the planted stub and one more", () => {
    expect(trials.filter((t) => t.test === "clean")).toHaveLength(9);
    expect(trials.filter((t) => t.test === "layout")).toHaveLength(9);
    const inj = trials.filter((t) => t.test === "injection");
    expect(new Set(inj.map((t) => t.attack))).toEqual(new Set(["planted", "extractor"]));
    expect(inj).toHaveLength(4 + 4 + 4); // the planted stub: both attacks in 4 layouts; a clean stub: the extractor attack
  });

  test("every layout carries the truth's numbers, and the fixed-label parser reads none of them", () => {
    const truth = parsePayStub(stubs[0].text)!;
    for (const layout of Object.values(LAYOUTS)) {
      const text = layout(truth);
      expect(parsePayStub(text)).toBeNull();
      for (const n of [truth.gross, truth.net, truth.ytd]) expect(text.replace(/,/g, "")).toContain(n.toFixed(2));
      expect(text).toContain(truth.check_no);
    }
  });

  test("scoring: case and spacing don't matter, a wrong number does", () => {
    const truth = parsePayStub(stubs[0].text)!;
    expect(fieldsWrong(truth, { ...truth, employee: `  ${truth.employee.toLowerCase()} ` })).toEqual([]);
    expect(fieldsWrong(truth, { ...truth, gross: 9850 })).toEqual(["gross"]);
    expect(fieldsWrong(truth, null)).toHaveLength(8);
  });
});
