// Ticket 06: bureau views and the merge. Fixtures follow the CRS Standard Format field names.
import { describe, expect, test } from "bun:test";
import { bureauView, CreditResponseSchema, mergeBureaus, type Bureau } from "@/lib/crs/credit-features";

const ASOF = Date.parse("2026-10-24");
type Tl = { au?: boolean; derog?: boolean };
const file = (o: { open?: string; addrs?: number; tl?: Tl[]; inq?: string[]; score?: string | null; reason?: string } = {}) =>
  CreditResponseSchema.parse({
    creditFiles: [{
      // the sandbox's infile date is canned and the same for many people: it must never be read as the age of the file
      creditFileDetail: { creditFileInfileDate: "2001-01-01", creditFileResultStatusType: "FileReturned" },
      addresses: Array.from({ length: o.addrs ?? 1 }, (_, i) => ({ addressLine1: `${i} MAIN ST`, postalCode: "12345-0000" })),
    }],
    tradelines: (o.tl ?? []).map((t) => ({ accountOwnershipType: t.au ? "AuthorizedUser" : "Individual", accountOpenedDate: o.open ?? "2015-01-01", derogatoryDataIndicator: !!t.derog })),
    inquiries: (o.inq ?? []).map((inquiryDate) => ({ inquiryDate })),
    scores: [{ scoreValue: o.score === undefined ? "700" : o.score, noScoreReasonType: o.reason }],
  });
const result = (creditFileResultStatusType: string) => CreditResponseSchema.parse({ creditFiles: [{ creditFileDetail: { creditFileResultStatusType } }] });
const noHit = result("NoFileReturnedNoHit");
const frozen = result("NoFileReturnedCreditFreeze");
const deceased = CreditResponseSchema.parse({ errorMessages: [{ creditErrorMessageCode: "E7001", creditErrorMessageText: "Subject is deceased" }] });

const BUREAUS: Bureau[] = ["transunion", "equifax", "experian"];
const merge = (responses: Parameters<typeof bureauView>[1][], dateOfBirth?: string) =>
  mergeBureaus(responses.map((r, i) => bureauView(BUREAUS[i], r, ASOF)), { asOf: ASOF, dateOfBirth });

describe("one bureau", () => {
  test("a returned file gives its score, tradelines and oldest tradeline", () => {
    const v = bureauView("transunion", file({ score: "790", open: "2010-05-01", tl: [{}, {}, {}] }), ASOF);
    expect(v).toMatchObject({ status: "file_returned", score: 790, oldest_tradeline_date: "2010-05-01", tradelines: 3, derogatory: 0 });
  });
  test("no score keeps the reason", () => {
    const v = bureauView("equifax", file({ score: null, reason: "NotScoredInsufficientCredit" }), ASOF);
    expect(v).toMatchObject({ score: null, no_score_reason: "NotScoredInsufficientCredit" });
  });
  test("no-hit, freeze and deceased are told apart", () => {
    expect(bureauView("transunion", noHit, ASOF).status).toBe("no_file");
    expect(bureauView("transunion", frozen, ASOF).status).toBe("frozen");
    expect(bureauView("transunion", deceased, ASOF).status).toBe("deceased");
  });
  test("an empty or unreadable body is an error, never a clean file", () => {
    expect(bureauView("experian", CreditResponseSchema.parse({}), ASOF).status).toBe("error");
    expect(bureauView("experian", result("NoFileReturnedError"), ASOF).status).toBe("error");
  });
  test("a file that also carries error messages is an error", () => {
    const withErrors = CreditResponseSchema.parse({ ...file(), errorMessages: [{ creditErrorMessageCode: "E1005", creditErrorMessageText: "User configuration not found" }] });
    expect(bureauView("experian", withErrors, ASOF).status).toBe("error");
  });
  test("only inquiries in the 60 days before the pull count", () => {
    const v = bureauView("transunion", file({ inq: ["2026-10-20", "2026-09-01", "2026-08-01", "2026-11-01"] }), ASOF);
    expect(v.inquiries_60d).toBe(2);
  });
  test("derogatory counts flagged tradelines", () => {
    expect(bureauView("experian", file({ tl: [{ derog: true }, {}] }), ASOF).derogatory).toBe(1);
  });
});

describe("merging three bureaus", () => {
  test("three clean files agree", () => {
    const m = merge([file({ tl: [{}] }), file({ tl: [{}] }), file({ tl: [{}] })]);
    expect(m).toMatchObject({ partial: false, divergent: false, no_file_anywhere: false, deceased: false });
  });
  test("a frozen bureau makes the picture partial, not divergent", () => {
    const m = merge([frozen, file({ score: "740" }), file({ score: "740" })]);
    expect(m).toMatchObject({ partial: true, divergent: false });
  });
  test("a file at some bureaus and none at another is divergent", () => {
    const m = merge([file({ score: "760" }), noHit, file({ score: "700", tl: [{ derog: true }] })]);
    expect(m).toMatchObject({ partial: false, divergent: true });
  });
  test("derogatories at only some of the returned files are divergent", () => {
    const m = merge([file({ tl: [{}] }), file({ tl: [{}] }), file({ tl: [{ derog: true }] })]);
    expect(m.divergent).toBe(true);
  });
  test("no file at any bureau is its own state", () => {
    expect(merge([noHit, noHit, noHit])).toMatchObject({ no_file_anywhere: true, partial: false, divergent: false });
  });
  test("deceased at the bureaus is flagged", () => {
    expect(merge([deceased, deceased, deceased]).deceased).toBe(true);
  });
});

describe("thick file, thin life features", () => {
  test("file age, borrower age, depth and inquiry burst", () => {
    const m = merge(
      [file({ open: "2026-04-24", tl: [{}, {}], inq: ["2026-10-20", "2026-10-21", "2026-10-22"] }), file({ open: "2026-06-01", tl: [{}] }), noHit],
      "1999-12-24",
    );
    expect(m.features).toMatchObject({ file_age_months: 6, borrower_age_years: 26, tradeline_depth: 2, inquiries_60d: 3 });
  });
  test("addresses are counted once across bureaus", () => {
    const m = merge([file({ addrs: 2 }), file({ addrs: 1 }), noHit]);
    expect(m.features.addresses_on_file).toBe(2);
  });
  test("no address history is unknown (null), not zero addresses", () => {
    expect(merge([file({ addrs: 0 }), file({ addrs: 0 }), noHit]).features.addresses_on_file).toBeNull();
  });
  test("file age comes from the oldest tradeline, never the canned infile date", () => {
    const m = merge([file({ open: "2026-04-24", tl: [{}] }), noHit, noHit]);
    expect(m.features.file_age_months).toBe(6); // the fixture's infile date is 2001, which would give 300+
  });
  test("a file with no tradelines has no file age", () => {
    expect(merge([file({ tl: [] }), noHit, noHit]).features.file_age_months).toBeNull();
  });
  test("authorized-user share is pooled over the files returned", () => {
    const m = merge([file({ tl: [{ au: true }, { au: true }, {}, {}] }), noHit, noHit]);
    expect(m.features.authorized_user_share).toBe(0.5);
  });
  test("no tradelines means no share, and no file means no ages", () => {
    const m = merge([noHit, noHit, noHit]);
    expect(m.features).toMatchObject({ authorized_user_share: null, file_age_months: null, borrower_age_years: null, tradeline_depth: 0 });
  });
});
