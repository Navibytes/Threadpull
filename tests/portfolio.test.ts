// Ticket 02: seeded portfolio, normalization and answer-key isolation.
import { beforeAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { mkdtempSync, readdirSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Loan, RawLoan } from "@/lib/contracts/loan";
import { generate, PERSONAS, type AnswerKey } from "@/data/generate";

const SPEC = join(import.meta.dir, "..", "data", "patterns", "seed13.json");
const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
const files = (d: string): string[] =>
  readdirSync(d).sort().flatMap((f) => (statSync(join(d, f)).isDirectory() ? files(join(d, f)) : [join(d, f)]));
const digest = (d: string) => files(d).reduce((h, f) => h.update(readFileSync(f)), createHash("sha256")).digest("hex");

let outDir: string, key: AnswerKey, raw: RawLoan[], loans: Map<string, Loan>;
beforeAll(() => {
  const r = generate(SPEC, tmp(), tmp());
  outDir = r.outDir;
  key = JSON.parse(readFileSync(join(r.keyDir, "answer_key.json"), "utf8"));
  raw = JSON.parse(readFileSync(join(outDir, "loans.json"), "utf8"));
  loans = new Map(r.normalized.map((l) => [l.loan_id, l]));
});
const get = (id: string) => loans.get(id)!;
const payStub = (l: Loan) => l.documents.find((d) => d.type === "pay_stub")!;

test("same seed is byte-identical", () => {
  expect(digest(generate(SPEC, tmp(), tmp()).outDir)).toBe(digest(outDir));
});

test("1,000 loans in the dealer-application shape", () => {
  expect(loans.size).toBe(1000);
  expect([...loans.keys()][0]).toBe("L0001");
  expect([...loans.keys()][999]).toBe("L1000");
  for (const l of loans.values()) {
    expect(new Set(l.documents.map((d) => d.type))).toEqual(new Set(["pay_stub", "application"]));
    expect(l.status).toBe("Not reviewed");
    const v = l.vehicle_and_loan_details;
    expect(v.requested_loan_amount).toBe(v.purchase_price - v.down_payment);
  }
});

test("case loans match the CRS persona bodies exactly after normalization", () => {
  const cases = [...loans.values()].filter((l) => l.kind === "case");
  expect(cases.map((l) => l.persona_id).sort()).toEqual(Object.keys(PERSONAS).sort());
  for (const l of cases) {
    const p = PERSONAS[l.persona_id!], a = l.applicant_info, r = l.residential_info;
    expect([a.first_name, a.last_name, a.ssn, a.date_of_birth, a.phone, a.email, r.street_address, r.city, r.state, r.zip_code])
      .toEqual([p.first_name, p.last_name, p.ssn, p.dob, p.phone, p.email, p.street1, p.city, p.state, p.zip]);
  }
});

test("loan #37 is the lead (P13)", () => expect(get("L0037").persona_id).toBe("P13"));

test("the raw tape is messy on purpose", () => {
  expect(raw.some((r) => r.applicant_info.first_name.includes(","))).toBe(true);
  expect(raw.some((r) => r.applicant_info.ssn.includes("-"))).toBe(true);
  expect(raw.some((r) => r.applicant_info.date_of_birth.includes("/"))).toBe(true);
  expect(raw.some((r) => r.residential_info.street_address.includes(", Apt"))).toBe(true);
  expect(raw.some((r) => typeof r.funding_info.amount_financed === "string")).toBe(true);
  expect(new Set(raw.filter((r) => r.submission.dealer_id === "D03").map((r) => r.submission.dealer_name)).size).toBe(3);
  expect(new Set([...loans.values()].filter((l) => l.submission.dealer_id === "D03").map((l) => l.submission.dealer_name)).size).toBe(1);
});

describe("planted patterns", () => {
  test("ring of six at one dealer with a recycled pay stub", () => {
    const ring = key.rings[0].loan_ids.map(get);
    expect(ring.length).toBe(6);
    expect(new Set(ring.map((l) => l.submission.dealer_id))).toEqual(new Set(["D03"]));
    expect(ring.map((l) => l.persona_id).filter(Boolean).sort()).toEqual(["P12", "P13", "P14"]);
    expect([...loans.values()].filter((l) => payStub(l).template_id === "T-7F3A").length).toBe(6);
    expect([...loans.values()].filter((l) => l.applicant_info.phone === get("L0037").applicant_info.phone).length).toBe(2);
  });
  test("lookalikes, review cases, burst and injection", () => {
    const [building, hospital, dental, household] = key.lookalikes.map((x) => x.loan_ids.map(get));
    expect(new Set(building.map((l) => l.derived.address_key)).size).toBe(1);
    expect(new Set(building.map((l) => l.residential_info.street_address)).size).toBe(2);
    expect(hospital.length).toBe(40);
    expect(dental.length).toBe(3);
    expect(new Set(household.map((l) => `${l.applicant_info.phone}|${l.residential_info.street_address}|${l.applicant_info.last_name}`)).size).toBe(1);
    expect(household.every((l) => l.co_applicant_info?.relationship === "Spouse")).toBe(true);
    expect(key.review_cases.flatMap((r) => r.loan_ids.map((id) => get(id).persona_id))).toEqual(["P16", "P15", "P17"]);
    expect(key.dealer_bursts[0].loan_ids.length).toBe(40);
    const [doc] = key.injected_docs;
    expect(payStub(get(doc.replace(/-PS$/, ""))).text).toContain("ignore all prior instructions");
  });
});

test("no detection code can read the answer key", () => {
  const roots = ["lib", "app"].map((d) => join(import.meta.dir, "..", d));
  const src = roots.flatMap((r) => { try { return files(r); } catch { return []; } }).filter((f) => /\.tsx?$/.test(f));
  expect(src.length).toBeGreaterThan(0);
  for (const f of src) expect(readFileSync(f, "utf8")).not.toMatch(/answer_key|data\/keys/);
});
