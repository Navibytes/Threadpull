// lib/evidence/documents.ts on seed 13. Tests may read the answer key; lib/ code may not.
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Loan } from "@/lib/contracts/loan";
import { ToolResultSchema } from "@/lib/contracts/tool-result";
import { generate, type AnswerKey } from "@/data/generate";
import { compareDocuments, parsePayStub, payStubIssues, RECYCLED_THRESHOLD, templateUsage } from "@/lib/evidence";

let loans: Loan[], byId: Map<string, Loan>, key: AnswerKey, usage: Map<string, number>;
beforeAll(() => {
  const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
  const r = generate(join(import.meta.dir, "..", "data", "patterns", "seed13.json"), tmp(), tmp());
  loans = r.normalized;
  byId = new Map(loans.map((l) => [l.loan_id, l]));
  key = JSON.parse(readFileSync(join(r.keyDir, "answer_key.json"), "utf8"));
  usage = templateUsage(loans);
});
const stubId = (l: Loan) => l.documents.find((d) => d.type === "pay_stub")!.doc_id;
const side = (l: Loan) => ({ loan: l, doc_id: stubId(l) });
const ringIds = () => key.rings[0].loan_ids;
const pairs = <T,>(xs: T[]) => xs.flatMap((a, i) => xs.slice(i + 1).map((b) => [a, b] as const));

test("every pay stub in the pool parses", () => {
  for (const l of loans) expect(parsePayStub(l.documents.find((d) => d.type === "pay_stub")!.text)).not.toBeNull();
});

describe("arithmetic checks", () => {
  test("ring stubs fail the YTD check; every other stub passes all checks", () => {
    const ring = new Set(ringIds());
    for (const l of loans) {
      const stub = parsePayStub(l.documents.find((d) => d.type === "pay_stub")!.text)!;
      const issues = payStubIssues(stub, l.employment_info.time_at_employer_months);
      if (ring.has(l.loan_id)) expect(issues.map((i) => i.code)).toContain("ytd_inconsistent");
      else expect([l.loan_id, issues]).toEqual([l.loan_id, []]);
    }
  });
  test("a new hire's small YTD is not flagged", () => {
    const stub = { employer: "X", employee: "Y", position: "Z", pay_date: "2026-07-31", check_no: "1",
      gross: 2000, net: 1500, ytd: 4000 };
    expect(payStubIssues(stub, 3)).toEqual([]);
    expect(payStubIssues(stub, 30).map((i) => i.code)).toEqual(["ytd_inconsistent"]);
  });
  test("net pay at or above gross is flagged", () => {
    const stub = { employer: "X", employee: "Y", position: "Z", pay_date: "2026-01-15", check_no: "1", gross: 2000, net: 2100, ytd: 2000 };
    expect(payStubIssues(stub).map((i) => i.code)).toEqual(["net_not_below_gross"]);
  });
});

describe("compareDocuments", () => {
  test("every pair of ring stubs is a recycled template, with cited differences", () => {
    for (const [a, b] of pairs(ringIds().map((id) => byId.get(id)!))) {
      const r = compareDocuments(side(a), side(b), usage);
      expect(r.ok).toBe(true);
      expect(r.result!.verdict).toBe("recycled_template");
      expect(r.result!.same_check_no).toBe(true);
      expect(r.sources.some((s) => s.kind === "document" && s.detail?.includes("check no"))).toBe(true);
      expect(r.cost).toEqual({ acorns: 1, unit: "1 document pair" });
      expect(ToolResultSchema.safeParse(r).success).toBe(true);
    }
  });
  test("ordinary loans on the same payroll template are not called recycled", () => {
    const ring = new Set(ringIds());
    const byTemplate = new Map<string, Loan[]>();
    for (const l of loans.filter((l) => !ring.has(l.loan_id))) {
      const t = l.documents.find((d) => d.type === "pay_stub")!.template_id;
      byTemplate.set(t, [...(byTemplate.get(t) ?? []), l]);
    }
    let checked = 0;
    for (const group of byTemplate.values())
      for (const [a, b] of pairs(group.slice(0, 40))) {
        const r = compareDocuments(side(a), side(b), usage).result!;
        expect(r.match_score).toBeLessThan(RECYCLED_THRESHOLD);
        expect(r.verdict).toBe("same_standard_template");
        checked++;
      }
    expect(checked).toBeGreaterThan(1000);
  });
  test("a ring stub vs an ordinary stub is different", () => {
    const ring = byId.get(ringIds()[0])!, other = loans.find((l) => !ringIds().includes(l.loan_id))!;
    expect(compareDocuments(side(ring), side(other), usage).result!.verdict).toBe("different");
  });
  test("bad input is refused at no cost", () => {
    const l = loans[0];
    for (const r of [compareDocuments(side(l), side(l), usage),
      compareDocuments(side(l), { loan: l, doc_id: `${l.loan_id}-APP` }, usage),
      compareDocuments(side(l), { loan: loans[1], doc_id: "nope" }, usage)]) {
      expect(r.ok).toBe(false);
      expect(r.cost.acorns).toBe(0);
    }
  });
});
