import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { LoanSchema } from "@/lib/contracts/loan";
import { DISPOSITIONS, EMPTY_FILTERS, filterLoans, loanDealers, loanPage, PAGE_SIZE } from "@/components/drawer/loan-list-model";
import { apiLoanSource } from "@/components/drawer/loan-source";
import { createPreviewLoans, previewLoanSource } from "@/components/drawer/preview-loan-source";
import { LoanList } from "@/components/drawer/loan-list";
import { FilingDrawer } from "@/components/drawer/filing-drawer";

const loans = createPreviewLoans();
const options = () => ({ seed: 13, signal: new AbortController().signal });
let fetchSpy: ReturnType<typeof spyOn<typeof globalThis, "fetch">> | undefined;
afterEach(() => { fetchSpy?.mockRestore(); fetchSpy = undefined; });

describe("filing drawer data and filtering", () => {
  test("1,000 explicit preview records satisfy the unchanged loan contract", () => {
    expect(LoanSchema.array().parse(loans)).toHaveLength(1000);
    expect(new Set(loans.map((loan) => loan.loan_id)).size).toBe(1000);
    expect(previewLoanSource.kind).toBe("preview");
  });

  test("four exact dispositions stay separate from the initial review state", () => {
    expect(DISPOSITIONS).toEqual([
      "Investigate", "No material anomaly found", "Insufficient evidence", "Human-confirmed disposition",
    ]);
    const unreviewed = filterLoans(loans, { ...EMPTY_FILTERS, status: "Not reviewed" });
    expect(unreviewed).toHaveLength(600);
    for (const status of DISPOSITIONS) {
      const matches = filterLoans(loans, { ...EMPTY_FILTERS, status });
      expect(matches).toHaveLength(100);
      expect(matches.every((loan) => loan.status === status)).toBe(true);
    }
  });

  test("loan ID search trims whitespace and ignores case, without searching borrower names", () => {
    expect(filterLoans(loans, { ...EMPTY_FILTERS, query: " l0037 " }).map((loan) => loan.loan_id)).toEqual(["L0037"]);
    expect(filterLoans(loans, { ...EMPTY_FILTERS, query: "L00" })).toHaveLength(99);
    expect(filterLoans(loans, { ...EMPTY_FILTERS, query: "Synthetic" })).toHaveLength(0);
  });

  test("search, dealer and status intersect without rewriting source records", () => {
    const before = JSON.stringify(loans);
    const filters = { query: "L0001", status: "Investigate" as const, dealerId: "PREVIEW-D1" };
    expect(filterLoans(loans, filters)).toEqual([loans[0]]);
    expect(filterLoans(loans, { ...filters, dealerId: "PREVIEW-D2" })).toEqual([]);
    expect(filterLoans(loans, { ...filters, status: "Not reviewed" })).toEqual([]);
    expect(JSON.stringify(loans)).toBe(before);
  });

  test("dealers use IDs, even when names collide or vary", () => {
    const sameName = { ...loans[1], submission: { ...loans[1].submission, dealer_name: loans[0].submission.dealer_name } };
    const spelling = { ...loans[0], submission: { ...loans[0].submission, dealer_name: "Variant spelling" } };
    expect(loanDealers([loans[0], sameName, spelling])).toHaveLength(2);
    expect(filterLoans([loans[0], sameName], { ...EMPTY_FILTERS, dealerId: "PREVIEW-D2" })).toEqual([sameName]);
  });

  test("all 1,000 records are reachable in bounded, non-overlapping pages", () => {
    const ids: string[] = [];
    for (let i = 1; i <= 40; i++) {
      const page = loanPage(loans, i);
      expect(page.loans).toHaveLength(PAGE_SIZE);
      expect(page.pages).toBe(40);
      ids.push(...page.loans.map((loan) => loan.loan_id));
    }
    expect(ids).toEqual(loans.map((loan) => loan.loan_id));
    expect(loanPage([], 40)).toEqual({ loans: [], page: 1, pages: 1, start: 0 });
    expect(loanPage(loans.slice(0, 26), 40).loans.map((loan) => loan.loan_id)).toEqual(["L0026"]);
    expect(loanPage(loans, 0).page).toBe(1);
  });
});

describe("existing API adapter", () => {
  test("uses the same-origin seed endpoint, abort signal and fresh reads", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(Response.json([loans[0]]));
    const request = options();
    expect(await apiLoanSource.load(request)).toEqual([loans[0]]);
    expect(fetchSpy).toHaveBeenCalledWith("/api/loans?seed=13", { signal: request.signal, cache: "no-store" });
  });

  test("empty portfolios are valid, not replaced with preview records", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(Response.json([]));
    expect(await apiLoanSource.load(options())).toEqual([]);
  });

  test("404 supplies a recovery instruction without falling back", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: "private details" }, { status: 404 }));
    await expect(apiLoanSource.load(options())).rejects.toThrow("Generate this seed, then retry");
  });

  test("backend errors never expose the raw response body", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(Response.json({ error: "private details" }, { status: 502 }));
    await expect(apiLoanSource.load(options())).rejects.toThrow("The loan service could not load this portfolio (HTTP 502). Retry to reconnect.");
  });

  test("malformed records, unknown statuses and duplicate IDs are rejected", async () => {
    fetchSpy = spyOn(globalThis, "fetch");
    for (const value of [{ loans }, [{ ...loans[0], status: "Clear" }], [{ loan_id: "L0001" }], [loans[0], loans[0]]]) {
      fetchSpy.mockResolvedValue(Response.json(value));
      await expect(apiLoanSource.load(options())).rejects.toThrow("invalid loan records");
    }
  });

  test("network and abort failures propagate rather than using fixtures", async () => {
    fetchSpy = spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(apiLoanSource.load(options())).rejects.toThrow("Failed to fetch");
    const request = { seed: 13, signal: AbortSignal.abort() };
    await expect(previewLoanSource.load(request)).rejects.toThrow();
  });
});

describe("drawer rendering", () => {
  test("only 25 loan buttons render, with accessible selected state and exact status words", () => {
    const html = renderToStaticMarkup(<LoanList loans={loans} selectedLoanId="L0001" onSelectLoan={() => {}} />);
    expect(html.match(/aria-pressed=/g)).toHaveLength(25);
    expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
    expect(html).toContain("Page 1 of 40");
    for (const status of DISPOSITIONS) expect(html).toContain(status);
    expect(html).toContain("Review state");
    expect(html).toContain("no investigation disposition has been recorded");
    expect(html).not.toContain("000000000");
    expect(html).not.toContain("example.invalid");
  });

  test("empty portfolio has a distinct explanation", () => {
    const html = renderToStaticMarkup(<LoanList loans={[]} onSelectLoan={() => {}} />);
    expect(html).toContain("No loans filed yet");
    expect(html).not.toContain("No matching loans");
  });

  test("loading is announced and preview provenance is visible before data arrives", () => {
    const html = renderToStaticMarkup(<FilingDrawer source={previewLoanSource} onSelectLoan={() => {}} />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("Loading loan files");
    expect(html).toContain("PREVIEW · synthetic loans and example dispositions · not an investigation");
  });
});
