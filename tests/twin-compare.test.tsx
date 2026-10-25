// Ticket 07: Twin Compare. Two lookalike loans side by side on seed 13's real pairs: what they share, what differs,
// what split them. Identifiers are compared in full but shown masked.
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import type { Loan } from "@/lib/contracts/loan";
import { compareTwins } from "@/lib/evidence";
import { TwinCompareView } from "@/components/twin-compare/twin-compare";
import { portfolio } from "@/components/twin-compare/use-twin-loans";
import type { LoanSource } from "@/components/drawer/loan-source";
import { generate, type AnswerKey } from "@/data/generate";

let byId: Map<string, Loan>, key: AnswerKey;
beforeAll(() => {
  const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
  const r = generate(join(import.meta.dir, "..", "data", "patterns", "seed13.json"), tmp(), tmp());
  key = JSON.parse(readFileSync(join(r.keyDir, "answer_key.json"), "utf8"));
  byId = new Map(r.normalized.map((l) => [l.loan_id, l]));
});
const pair = (start: string) => key.lookalikes.find((x) => x.proving_check.startsWith(start))!.loan_ids.map((id) => byId.get(id)!);

describe("what two loans share", () => {
  test("the apartment twins share only the building; their payroll template is common, not a link", () => {
    const [a, b] = pair("check_address");
    const c = compareTwins(a, b, null, byId.values());
    expect(c.shared).toEqual(["Address"]);
    expect(c.split).toBeNull();
    expect(c.rows.find((r) => r.label === "Address")).toMatchObject({ kind: "address", same: true, shared_by: 2, weight: 0.5, strong: true });
    const template = c.rows.find((r) => r.label === "Pay-stub template")!;
    expect(template).toMatchObject({ same: true, strong: false });
    expect(template.shared_by!).toBeGreaterThan(50); // a payroll provider's template: hundreds of loans use it
  });

  test("without the pool, every same fact counts (no rarity to weigh it by)", () => {
    const [a, b] = pair("check_address");
    expect(compareTwins(a, b).shared).toEqual(["Address", "Pay-stub template"]);
  });

  test("the spouses share phone and address, not the applicant", () => {
    const [a, b] = pair("household check");
    const c = compareTwins(a, b, null, byId.values());
    expect(c.shared).toEqual(expect.arrayContaining(["Phone", "Address"]));
    expect(c.shared).not.toContain("Applicant");
  });

  test("the ring lead and its background member share the rare phone, the employer, the dealer and the recycled stub", () => {
    const [lead, , , bg1] = key.rings[0].loan_ids.map((id) => byId.get(id)!);
    const c = compareTwins(lead, bg1, null, byId.values());
    expect(c.shared).toEqual(expect.arrayContaining(["Phone", "Employer", "Pay-stub template"]));
    expect(c.rows.find((r) => r.label === "Pay-stub template")!.shared_by).toBe(6); // the ring's recycled stub: six loans
    expect(c.shared).not.toContain("SSN");
  });

  test("SSN and bank account are compared in full but shown as their last four", () => {
    const [a] = pair("check_address");
    const twin: Loan = structuredClone(a);
    twin.loan_id = "L9999";
    twin.applicant_info.ssn = `999${a.applicant_info.ssn.slice(3)}`; // same last four, different number
    const rows = new Map(compareTwins(a, twin).rows.map((r) => [r.label, r]));
    expect(rows.get("SSN")).toMatchObject({ same: false, a: `•••${a.applicant_info.ssn.slice(-4)}` });
    expect(rows.get("Bank account")!.a).toBe(`•••${a.funding_info.ach_bank_account.slice(-4)}`);
    expect(JSON.stringify(compareTwins(a, twin))).not.toContain(a.applicant_info.ssn);
  });
});

describe("the card", () => {
  test("explained: the thread's fact is marked, and the foot cites the check and its event", () => {
    const [a, b] = pair("check_address");
    const html = renderToStaticMarkup(<TwinCompareView threadKind="address"
      comparison={compareTwins(a, b, { explainedBy: "check_address", ruleId: null, reason: "212-unit building; 2 loans name it", seq: 13 }, byId.values())} />);
    expect(html).toContain("this thread · explained · 2 loans");
    expect(html).toMatch(/common · \d+ loans/);
    expect(html).toContain("<strong>check_address</strong>: 212-unit building; 2 loans name it");
    expect(html).toContain("event seq 13");
    expect(html).toMatch(/data-explained="true"/);
    expect(html).not.toContain(a.applicant_info.ssn);
  });

  test("not explained: says nothing has split them, lists what differs, and that a connection is not proof", () => {
    const [lead, p12] = key.rings[0].loan_ids.map((id) => byId.get(id)!);
    const html = renderToStaticMarkup(<TwinCompareView threadKind="bank_account" comparison={compareTwins(lead, p12)} />);
    expect(html).toContain("Nothing yet: no check or saved rule has explained this link");
    expect(html).toContain("They differ on Applicant");
    expect(html).toContain("not proof");
    expect(html).toContain(">this thread<");
  });

  test("a saved rule is named by its id", () => {
    const [a, b] = key.lookalikes.find((x) => x.loan_ids.length === 40)!.loan_ids.map((id) => byId.get(id)!);
    const html = renderToStaticMarkup(<TwinCompareView threadKind="employer"
      comparison={compareTwins(a, b, { explainedBy: "rule", ruleId: "R-001", reason: "Large employer", seq: 21 })} />);
    expect(html).toContain("<strong>R-001</strong>: Large employer");
  });
});

describe("loading the two files", () => {
  test("the portfolio is fetched once for every comparison, and a failure is retried next time", async () => {
    let calls = 0, fail = true;
    const source: LoanSource = { kind: "preview", load: async () => { calls++; if (fail) throw new Error("down"); return [...byId.values()]; } };
    await expect(portfolio(777, source)).rejects.toThrow("down");
    fail = false;
    const first = await portfolio(777, source);
    const second = await portfolio(777, source);
    expect(first).toBe(second);
    expect(first.get("L0037")!.loan_id).toBe("L0037");
    expect(calls).toBe(2); // one failure, then one fetch shared by both
  });
});
