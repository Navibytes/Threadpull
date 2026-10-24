// Ticket 06: crs_credit_report, crs_fraud_finder and crs_reverse_phone, against a fake sandbox (no network, no login).
import { describe, expect, test } from "bun:test";
import { createCrsClient, memoryCache } from "@/lib/crs";
import { crsCreditReport } from "@/lib/crs/credit-report";
import { crsFraudFinder } from "@/lib/crs/fraud-finder";
import { crsReversePhone } from "@/lib/crs/reverse-phone";
import { Ledger } from "@/lib/ledger";

const loan = (loan_id: string, ssn: string, date_of_birth = "1999-12-24") => ({ loan_id, applicant_info: { ssn, date_of_birth } });
const p13 = loan("L0037", "666701013");
const background = loan("L0500", "123456789");

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
const bureauOf = (path: string) => (path.startsWith("/transunion") ? "transunion" : path.startsWith("/equifax") ? "equifax" : "experian");

function sandbox(handle: (path: string, body: Record<string, unknown>) => Response) {
  const box = {
    logins: 0,
    calls: [] as { path: string; body: Record<string, unknown> }[],
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/users/login")) {
        box.logins++;
        return json({ token: "tok" });
      }
      const call = { path: new URL(url).pathname.replace(/^\/api/, ""), body: JSON.parse(String(init?.body)) };
      box.calls.push(call);
      return handle(call.path, call.body);
    }) as typeof fetch,
  };
  return box;
}
const clientFor = (box: ReturnType<typeof sandbox>) => createCrsClient({ fetch: box.fetch, cache: memoryCache(), username: "user", password: "pass" });
const ok = (body: unknown) => json(body, 200, { RequestID: "req-1" });

// CRS Standard Format, only the fields the tool reads.
const file = (o: { tl?: { derog?: boolean }[]; inq?: string[]; pulled?: string } = {}) => ({
  responseDetail: { dateOrdered: o.pulled ?? "2026-10-24T12:00:00Z" },
  creditFiles: [{ creditFileDetail: { creditFileInfileDate: "2015-01-01", creditFileResultStatusType: "FileReturned" }, addresses: [{ addressLine1: "1 MAIN ST", postalCode: "12345" }] }],
  tradelines: (o.tl ?? [{}]).map((t) => ({ accountOwnershipType: "Individual", derogatoryDataIndicator: !!t.derog })),
  inquiries: (o.inq ?? []).map((inquiryDate) => ({ inquiryDate })),
  scores: [{ scoreValue: "700" }],
});
const status = (creditFileResultStatusType: string) => ({ creditFiles: [{ creditFileDetail: { creditFileResultStatusType } }] });
const noHit = status("NoFileReturnedNoHit");
const frozen = status("NoFileReturnedCreditFreeze");

describe("crs_credit_report", () => {
  test("three clean files: one 6-acorn charge, three cited sources", async () => {
    const box = sandbox(() => ok(file()));
    const ledger = new Ledger();
    const r = await crsCreditReport(p13, ledger, clientFor(box));
    expect(r.ok).toBe(true);
    expect(r.cost).toEqual({ acorns: 6, unit: "3 CRS calls" });
    expect(ledger.spent).toBe(6);
    expect(r.simulated).toBe(false);
    expect(r.sources.map((s) => s.kind === "crs" && s.product).sort()).toEqual(["credit_efx", "credit_exp", "credit_tu"]);
    expect(new Set(box.calls.map((c) => c.path))).toEqual(new Set([
      "/transunion/credit-report/standard/tu-prequal-fico9", "/equifax/credit-report/standard/efx-prequal-vantage4", "/experian/credit-report/standard/exp-prequal-vantage4",
    ]));
    expect(r.result).toMatchObject({ loan_id: "L0037", partial: false, divergent: false, status_hint: null });
    expect(box.logins).toBe(1);
  });

  test("a frozen bureau is partial and leads to Insufficient evidence", async () => {
    const r = await crsCreditReport(p13, new Ledger(), clientFor(sandbox((p) => ok(bureauOf(p) === "transunion" ? frozen : file()))));
    expect(r.result).toMatchObject({ partial: true, divergent: false, status_hint: "Insufficient evidence" });
    expect(r.result?.bureaus.find((b) => b.bureau === "transunion")?.status).toBe("frozen");
  });

  test("bureaus that disagree are divergent", async () => {
    const r = await crsCreditReport(p13, new Ledger(), clientFor(sandbox((p) => ok(bureauOf(p) === "equifax" ? noHit : bureauOf(p) === "experian" ? file({ tl: [{ derog: true }] }) : file()))));
    expect(r.result).toMatchObject({ partial: false, divergent: true, status_hint: "Insufficient evidence" });
  });

  test("no file at all three is reported, without a status hint", async () => {
    const r = await crsCreditReport(p13, new Ledger(), clientFor(sandbox(() => ok(noHit))));
    expect(r.result).toMatchObject({ no_file_anywhere: true, partial: false, divergent: false, status_hint: null });
  });

  test("deceased at the bureaus is flagged", async () => {
    const dead = { errorMessages: [{ creditErrorMessageCode: "E7001", creditErrorMessageText: "Subject is deceased" }] };
    const r = await crsCreditReport(p13, new Ledger(), clientFor(sandbox(() => ok(dead))));
    expect(r.result?.deceased).toBe(true);
  });

  test("one bureau down leaves a partial report, all three down is a refund", async () => {
    const some = new Ledger();
    const partial = await crsCreditReport(p13, some, clientFor(sandbox((p) => (bureauOf(p) === "experian" ? json({}, 503) : ok(file())))));
    expect(partial.ok).toBe(true);
    expect(partial.result).toMatchObject({ partial: true });
    expect(partial.result?.bureaus.find((b) => b.bureau === "experian")).toMatchObject({ status: "error" });
    expect(partial.sources).toHaveLength(2);

    const none = new Ledger();
    const down = await crsCreditReport(p13, none, clientFor(sandbox(() => json({}, 503))));
    expect(down.ok).toBe(false);
    expect(none.spent).toBe(0);
  });

  test("a background loan is refused with no login and no request", async () => {
    const box = sandbox(() => ok(file()));
    const ledger = new Ledger();
    const r = await crsCreditReport(background, ledger, clientFor(box));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("refused, nothing sent");
    expect(box.calls).toHaveLength(0);
    expect(box.logins).toBe(0);
    expect(ledger.spent).toBe(0);
  });

  test("over budget is refused before any request", async () => {
    const box = sandbox(() => ok(file()));
    const r = await crsCreditReport(p13, new Ledger(5), clientFor(box));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("over budget");
    expect(box.calls).toHaveLength(0);
  });

  test("inquiries are counted back from the pull date, and age from the loan's birth date", async () => {
    const pulled = file({ inq: ["2026-10-20", "2026-08-01"], pulled: "2026-10-24T12:00:00Z" });
    const r = await crsCreditReport(p13, new Ledger(), clientFor(sandbox(() => ok(pulled))), Date.parse("2027-06-01"));
    expect(r.result?.features).toMatchObject({ inquiries_60d: 1, borrower_age_years: 26 });
  });
});

describe("crs_fraud_finder", () => {
  const p13Response = {
    risk: { score: 88, postal: { address_type: "multi_unit", ip_postal_distance: "1500" }, phone: { line_type: "voip", prepaid: true, status: "valid", owner: { first_name_match: "no_match", last_name_match: "no_match" } } },
    eam: { date_first_seen: "2026-10-21" },
    email_validation: { status: "valid" },
  };

  test("reports email age, phone owner, address type, distance and score for 2 acorns", async () => {
    const box = sandbox(() => ok(p13Response));
    const ledger = new Ledger();
    const r = await crsFraudFinder(p13, ledger, clientFor(box), Date.parse("2026-10-24"));
    expect(r.cost).toEqual({ acorns: 2, unit: "1 CRS call" });
    expect(ledger.spent).toBe(2);
    expect(r.sources).toEqual([{ kind: "crs", product: "fraud_finder", request_id: "req-1" }]);
    expect(r.result).toEqual({
      loan_id: "L0037", risk_score: 88, email_first_seen: "2026-10-21", email_age_days: 3, email_status: "valid",
      phone_line_type: "voip", phone_prepaid: true, phone_owner_name: "no_match", address_type: "multi_unit", ip_postal_distance: "1500",
    });
    expect(box.calls[0].path).toBe("/fraud-finder/fraud-finder");
  });

  test("owner match, no owner block and missing sections", async () => {
    const owned = { risk: { score: 9, phone: { owner: { first_name_match: "match", last_name_match: "match" } } } };
    expect((await crsFraudFinder(p13, new Ledger(), clientFor(sandbox(() => ok(owned)))))?.result?.phone_owner_name).toBe("match");
    const bare = (await crsFraudFinder(p13, new Ledger(), clientFor(sandbox(() => ok({ risk: { score: 9 } })))))?.result;
    expect(bare).toMatchObject({ risk_score: 9, phone_owner_name: null, email_age_days: null, address_type: null });
  });

  test("a background loan is refused with no request", async () => {
    const box = sandbox(() => ok(p13Response));
    const r = await crsFraudFinder(background, new Ledger(), clientFor(box));
    expect(r.ok).toBe(false);
    expect(box.calls).toHaveLength(0);
  });

  test("a sandbox failure is an error result, not a throw", async () => {
    const r = await crsFraudFinder(p13, new Ledger(), clientFor(sandbox(() => json({ codes: ["CRS111"] }, 401))));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("CRS111");
  });
});

describe("crs_reverse_phone", () => {
  const record = { firstName: "RAJESH", lastName: "MENON", address: "1 WATER ST", city: "NEW YORK", state: "NY", postalCode: "10041" };

  test("returns the registered name and address for 1 acorn", async () => {
    const box = sandbox(() => ok({ success: true, data: { transactionId: "t", records: [record] } }));
    const ledger = new Ledger();
    const r = await crsReversePhone("(555) 010-1012", ledger, clientFor(box));
    expect(r.cost).toEqual({ acorns: 1, unit: "1 CRS call" });
    expect(ledger.spent).toBe(1);
    expect(r.result).toEqual({
      phone: "5550101012",
      records: [{ first_name: "RAJESH", last_name: "MENON", address: "1 WATER ST", city: "NEW YORK", state: "NY", postal_code: "10041" }],
    });
    expect(box.calls[0]).toEqual({ path: "/accurate-append/reverse", body: { phoneNumber: "5550101012" } });
  });

  test("no record is an answer, not an error", async () => {
    const r = await crsReversePhone("5550101013", new Ledger(), clientFor(sandbox(() => ok({ success: true, data: { records: [] } }))));
    expect(r).toMatchObject({ ok: true, result: { phone: "5550101013", records: [] } });
  });

  test("a phone no persona owns is refused with no request", async () => {
    const box = sandbox(() => ok({ success: true, data: { records: [record] } }));
    const ledger = new Ledger();
    const r = await crsReversePhone("2085551234", ledger, clientFor(box));
    expect(r.ok).toBe(false);
    expect(r.error).toContain("refused, nothing sent");
    expect(box.calls).toHaveLength(0);
    expect(ledger.spent).toBe(0);
  });

  test("success: false is an error and costs nothing", async () => {
    const ledger = new Ledger();
    const r = await crsReversePhone("5550101012", ledger, clientFor(sandbox(() => ok({ success: false }))));
    expect(r.ok).toBe(false);
    expect(ledger.spent).toBe(0);
  });
});
