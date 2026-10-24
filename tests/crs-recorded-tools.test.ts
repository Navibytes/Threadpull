// Ticket 06: the credit report, Fraud Finder and reverse phone tools against the real sandbox responses recorded on
// 2026-10-24 (data/record-crs.ts). The fake-sandbox tests use hand-built bodies; this one checks what CRS really sent.
import { describe, expect, test } from "bun:test";
import { crsCreditReport, crsFraudFinder, crsReversePhone } from "@/lib/crs";
import { bodyForLoan, bodyForPhone } from "@/lib/crs/persona-guard";
import { Ledger } from "@/lib/ledger";
import { client, loanOf, persona, PULLED, rec } from "./crs-replay";

test("the guard builds exactly the requests the sandbox answered", () => {
  for (const id of Object.keys(rec.credit_tu)) expect(bodyForLoan("credit_report", loanOf(id))).toEqual(rec.credit_tu[id].request);
  for (const id of Object.keys(rec.fraud)) expect(bodyForLoan("fraud_finder", loanOf(id))).toEqual(rec.fraud[id].request);
  for (const id of Object.keys(rec.reverse)) expect(bodyForPhone(persona(id).phone)).toEqual(rec.reverse[id].request);
});

describe("crs_credit_report on the real responses", () => {
  const run = async (id: string) => {
    const ledger = new Ledger();
    const r = await crsCreditReport(loanOf(id), ledger, client());
    expect(r.ok).toBe(true);
    expect(r.cost).toEqual({ acorns: 6, unit: "3 CRS calls" });
    expect(ledger.spent).toBe(6);
    expect(r.sources).toEqual([
      { kind: "crs", product: "credit_tu", request_id: rec.credit_tu[id].request_id },
      { kind: "crs", product: "credit_efx", request_id: rec.credit_efx[id].request_id },
      { kind: "crs", product: "credit_exp", request_id: rec.credit_exp[id].request_id },
    ]);
    return r.result!;
  };
  const flags = (c: Awaited<ReturnType<typeof run>>) => ({ partial: c.partial, divergent: c.divergent, no_file_anywhere: c.no_file_anywhere, deceased: c.deceased, hint: c.status_hint });
  const clean = { partial: false, divergent: false, no_file_anywhere: false, deceased: false, hint: null };

  test("a prime borrower: three clean files, deep history", async () => {
    const c = await run("P01");
    expect(flags(c)).toEqual(clean);
    expect(c.bureaus.map((b) => b.score)).toEqual([790, 790, 790]);
    expect(c.features).toMatchObject({ tradeline_depth: 12, authorized_user_share: 0, inquiries_60d: 0, borrower_age_years: 42 });
    expect(c.features.file_age_months).toBe(192);
  });

  test("a thin file is thin because of its history, not because anything is flagged", async () => {
    const c = await run("P03");
    expect(flags(c)).toEqual(clean);
    expect(c.features).toMatchObject({ tradeline_depth: 2, file_age_months: 8 });
  });

  test("P12: no file at any of the three bureaus", async () => {
    const c = await run("P12");
    expect(flags(c)).toEqual({ ...clean, no_file_anywhere: true });
    expect(c.bureaus.map((b) => b.status)).toEqual(["no_file", "no_file", "no_file"]);
  });

  test("P13: a short history, borrowed tradelines and an inquiry burst, without any bureau flag", async () => {
    const c = await run("P13");
    expect(flags(c)).toEqual(clean);
    expect(c.bureaus.map((b) => b.score)).toEqual([640, 640, 640]);
    expect(c.features).toMatchObject({ tradeline_depth: 3, file_age_months: 15, borrower_age_years: 26, inquiries_60d: 6 });
    expect(c.features.authorized_user_share).toBeCloseTo(2 / 3, 5);
  });

  test("P14: deceased at all three bureaus", async () => {
    const c = await run("P14");
    expect(flags(c)).toEqual({ ...clean, deceased: true });
    expect(c.bureaus.map((b) => b.status)).toEqual(["deceased", "deceased", "deceased"]);
  });

  test("P15: a frozen TransUnion file makes the report partial", async () => {
    const c = await run("P15");
    expect(flags(c)).toEqual({ ...clean, partial: true, hint: "Insufficient evidence" });
    expect(c.bureaus.map((b) => [b.status, b.score])).toEqual([["frozen", null], ["file_returned", 740], ["file_returned", 740]]);
  });

  test("P17: the bureaus disagree", async () => {
    const c = await run("P17");
    expect(flags(c)).toEqual({ ...clean, divergent: true, hint: "Insufficient evidence" });
    expect(c.bureaus.map((b) => [b.status, b.score, b.derogatory])).toEqual([["file_returned", 760, 0], ["no_file", null, 0], ["file_returned", 700, 1]]);
  });

  test("the sandbox's credit reports carry no address history, so the count is unknown, not zero", async () => {
    for (const id of ["P01", "P13", "P15"]) expect((await run(id)).features.addresses_on_file).toBeNull();
  });
});

describe("crs_fraud_finder on the real responses", () => {
  const run = async (id: string) => {
    const ledger = new Ledger();
    const r = await crsFraudFinder(loanOf(id), ledger, client(), PULLED);
    expect(r.ok).toBe(true);
    expect(ledger.spent).toBe(2);
    expect(r.sources).toEqual([{ kind: "crs", product: "fraud_finder", request_id: rec.fraud[id].request_id }]);
    return r.result!;
  };

  test("P13: a days-old email, a prepaid VoIP phone owned by someone else, and an IP far away", async () => {
    expect(await run("P13")).toMatchObject({
      risk_score: 88, email_age_days: 9, email_status: "valid", phone_line_type: "voip", phone_prepaid: true, phone_owner_name: "no_match", ip_postal_distance: "> 1000 miles",
    });
  });
  test("P12: the phone belongs to someone else and the IP is far away", async () => {
    expect(await run("P12")).toMatchObject({ risk_score: 85, phone_owner_name: "no_match", ip_postal_distance: "> 1000 miles" });
  });
  test("P14: a dead email and a landline", async () => {
    expect(await run("P14")).toMatchObject({ risk_score: 80, email_status: "invalid", phone_line_type: "landline", phone_owner_name: "no_data" });
  });
  test("ordinary borrowers score low with an old email and their own phone", async () => {
    for (const id of ["P01", "P02", "P08", "P10", "P18", "P19"]) {
      const f = await run(id);
      expect(f.risk_score).toBeLessThan(15);
      expect(f.phone_owner_name).toBe("match");
      expect(f.email_age_days).toBeGreaterThan(3000);
    }
  });
  test("address_type is 'Street' for everyone, P08's high-rise included, so it cannot show a multi-unit building", async () => {
    for (const id of Object.keys(rec.fraud)) expect((await run(id)).address_type).toBe("Street");
  });
});

describe("crs_reverse_phone on the real responses", () => {
  const run = async (id: string) => {
    const ledger = new Ledger();
    const r = await crsReversePhone(persona(id).phone, ledger, client());
    expect(r.ok).toBe(true);
    expect(ledger.spent).toBe(1);
    expect(r.sources).toEqual([{ kind: "crs", product: "reverse_phone", request_id: rec.reverse[id].request_id }]);
    return r.result!;
  };
  test("P12's phone is registered to a different person", async () => {
    const r = await run("P12");
    expect(r.records.map((x) => `${x.first_name} ${x.last_name}`)).toEqual(["RAJESH MENON"]);
  });
  test("P13's phone is registered to no one: an answer, not an error", async () => {
    expect((await run("P13")).records).toEqual([]);
  });
  test("an ordinary phone returns its own owner", async () => {
    expect((await run("P01")).records[0]).toMatchObject({ first_name: "MARGARET", last_name: "OKAFOR", state: "CA" });
  });
});
