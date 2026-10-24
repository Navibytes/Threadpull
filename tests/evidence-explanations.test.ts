// lib/evidence/explanations.ts. The most important property: no ring link is ever explained away.
// Runs on seed 13 plus seeds 7 and 21 (fresh placements). Seed 99 is held out and never used here.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Loan } from "@/lib/contracts/loan";
import { ToolResultSchema } from "@/lib/contracts/tool-result";
import { generate, type AnswerKey } from "@/data/generate";
import { loadReference, type Reference } from "@/lib/ingest/reference";
import { checkAddress, checkEmployer, checkHousehold, dealerTimeline } from "@/lib/evidence";

const SPEC = join(import.meta.dir, "..", "data", "patterns", "seed13.json");
const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
function portfolio(seed: number) {
  const spec = { ...JSON.parse(readFileSync(SPEC, "utf8")), seed };
  const specPath = join(tmp(), `seed${seed}.json`);
  writeFileSync(specPath, JSON.stringify(spec));
  const r = generate(specPath, tmp(), tmp());
  const key: AnswerKey = JSON.parse(readFileSync(join(r.keyDir, "answer_key.json"), "utf8"));
  return { loans: r.normalized, key, ref: loadReference(r.outDir), by: new Map(r.normalized.map((l) => [l.loan_id, l])) };
}
const personal = (l: Loan) => [`phone:${l.applicant_info.phone}`, `email:${l.applicant_info.email}`,
  `bank:${l.funding_info.ach_bank_account}`, `device:${l.submission.device_id}`, `ip:${l.submission.ip_address}`,
  `addr:${l.derived.address_key}`];

describe.each([13, 7, 21])("seed %i", (seed) => {
  const { loans, key, ref, by } = portfolio(seed);
  const ring = key.rings[0].loan_ids.map((id) => by.get(id)!);
  const ringIds = new Set(ring.map((l) => l.loan_id));
  const look = (prefix: string) => key.lookalikes.find((x) => x.explanation.startsWith(prefix))!.loan_ids.map((id) => by.get(id)!);

  describe("no ring link is explained away", () => {
    test("household check never explains a ring member's shared identifier", () => {
      let compared = 0;
      for (const a of ring)
        for (const b of loans)
          if (a.loan_id !== b.loan_id && personal(a).some((p) => personal(b).includes(p))) {
            expect([a.loan_id, b.loan_id, checkHousehold(a, b).result!.explains]).toEqual([a.loan_id, b.loan_id, false]);
            compared++;
          }
      expect(compared).toBeGreaterThanOrEqual(5); // the planted ring links exist
    });
    test("address check never explains a ring member's address", () => {
      for (const l of ring) expect(checkAddress(l.derived.address_key, loans, ref).result.explains).toBe(false);
    });
    test("employer check never clears anyone, and ring employers come back small", () => {
      for (const l of ring) {
        const r = checkEmployer(l.employment_info.employer_name, loans, ref).result;
        expect(r.explains).toBe(false);
      }
      for (const name of new Set(ring.map((l) => l.employment_info.employer_name)))
        if (ring.filter((l) => l.employment_info.employer_name === name).length > 1)
          expect(checkEmployer(name, loans, ref).result.verdict).toBe("small_employer");
    });
    test("the ring dealer's burst is found and left unexplained", () => {
      const t = dealerTimeline(key.rings[0].dealer_id, loans).result!;
      const inBursts = t.bursts.filter((b) => b.loan_ids.some((id) => ringIds.has(id)));
      expect(inBursts.length).toBeGreaterThan(0);
      for (const b of inBursts) expect(b.explains).toBe(false);
      expect(inBursts.flatMap((b) => b.loan_ids).filter((id) => ringIds.has(id)).length).toBeGreaterThanOrEqual(4);
    });
  });

  describe("lookalikes come down, citing their proof", () => {
    test("the shared apartment building is explained by check_address", () => {
      const [a] = look("same ");
      const r = checkAddress(a.derived.address_key, loans, ref);
      expect(r.result.explains).toBe(true);
      expect(r.simulated).toBe(true);
      expect(r.sources).toContainEqual({ kind: "lookup", name: "address_type", key: a.derived.address_key, simulated: true });
    });
    test("the household is explained, and it is the only shared-phone pair that is", () => {
      const [a, b] = look("spouses");
      expect(checkHousehold(a, b).result!.explains).toBe(true);
      const byPhone = new Map<string, Loan[]>();
      for (const l of loans) byPhone.set(l.applicant_info.phone, [...(byPhone.get(l.applicant_info.phone) ?? []), l]);
      const explained = [...byPhone.values()].filter((g) => g.length === 2 && checkHousehold(g[0], g[1]).result!.explains);
      expect(explained.map((g) => g.map((l) => l.loan_id).sort())).toEqual([[a.loan_id, b.loan_id].sort()]);
    });
    test("the big employer is reported large but not cleared (that is R-001's job)", () => {
      const hospital = look("Meridian");
      const r = checkEmployer(hospital[0].employment_info.employer_name, loans, ref).result;
      expect([r.verdict, r.explains, r.loans_in_pool]).toEqual(["large_employer", false, hospital.length]);
      expect(r.weight).toBeCloseTo(1 / hospital.length);
    });
    test("the small dental group is small, so Hazel must ask", () => {
      const dental = look("Kestrel");
      expect(checkEmployer(dental[0].employment_info.employer_name, loans, ref).result.verdict).toBe("small_employer");
    });
    test("the month-end burst is explained by the dealer's own history", () => {
      const burst = key.dealer_bursts[0];
      const t = dealerTimeline(burst.dealer_id, loans).result!;
      const b = t.bursts.find((x) => burst.loan_ids.every((id) => x.loan_ids.includes(id)));
      expect(b?.explains).toBe(true);
      expect(t.month_end_heavy_months).toBeGreaterThanOrEqual(3);
    });
  });
});

describe("contract and edge cases", () => {
  const { loans, ref } = portfolio(13);
  test("costs come from TOOL_SPECS and every result validates", () => {
    const rs = [checkAddress(loans[0].derived.address_key, loans, ref), checkHousehold(loans[0], loans[1]),
      checkEmployer(loans[0].employment_info.employer_name, loans, ref), dealerTimeline(loans[0].submission.dealer_id, loans)];
    expect(rs.map((r) => r.cost.acorns)).toEqual([0, 0, 0, 1]);
    for (const r of rs) {
      expect(ToolResultSchema.safeParse(r).success).toBe(true);
      expect(r.sources.length).toBeGreaterThan(0);
    }
  });
  test("a multi-unit address named by only one loan explains nothing (regression)", () => {
    const solo = Object.entries(ref.addresses).find(([k, v]) =>
      v.address_type === "multi_unit" && loans.filter((l) => l.derived.address_key === k).length === 1)!;
    expect(checkAddress(solo[0], loans, ref).result).toMatchObject({ loans_at_address: 1, explains: false });
  });
  test("unknown address or employer explains nothing", () => {
    expect(checkAddress("1 NOWHERE RD|00000", loans, ref).result).toMatchObject({ address_type: "unknown", explains: false });
    expect(checkEmployer("No Such Co", loans, ref).result).toMatchObject({ verdict: "unknown", explains: false });
  });
  test("an employer named by more borrowers than it has staff is implausible", () => {
    const tiny: Reference = { ...ref, employers: { ...ref.employers, "Tiny Co": { headcount: 1 } } };
    const two = loans.slice(0, 2).map((l) => ({ ...l, employment_info: { ...l.employment_info, employer_name: "Tiny Co" } }));
    expect(checkEmployer("Tiny Co", two, tiny).result.verdict).toBe("implausible");
  });
  test("bad input is refused at no cost", () => {
    for (const r of [checkHousehold(loans[0], loans[0]), dealerTimeline("D99", loans)]) {
      expect(r.ok).toBe(false);
      expect(r.cost.acorns).toBe(0);
    }
  });
});
