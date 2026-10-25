import { LOAN_STATUSES, type Loan, type LoanStatus } from "@/lib/contracts/loan";

export const DISPOSITIONS = LOAN_STATUSES.filter((status) => status !== "Not reviewed");
export const PAGE_SIZE = 25;
export type LoanFilters = { query: string; status: LoanStatus | "all"; dealerId: string };
export const EMPTY_FILTERS: LoanFilters = { query: "", status: "all", dealerId: "" };

export function filterLoans(loans: readonly Loan[], filters: LoanFilters): Loan[] {
  const query = filters.query.trim().toUpperCase();
  return loans.filter((loan) =>
    loan.loan_id.toUpperCase().includes(query) &&
    (filters.status === "all" || loan.status === filters.status) &&
    (!filters.dealerId || loan.submission.dealer_id === filters.dealerId));
}

export function loanDealers(loans: readonly Loan[]) {
  const dealers = new Map<string, string>();
  for (const loan of loans) {
    const { dealer_id, dealer_name } = loan.submission;
    if (!dealers.has(dealer_id)) dealers.set(dealer_id, dealer_name);
  }
  return [...dealers].map(([id, name]) => ({ id, name }))
    .sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
}

export function loanPage(loans: readonly Loan[], requestedPage: number) {
  const pages = Math.max(1, Math.ceil(loans.length / PAGE_SIZE));
  const page = Math.min(Math.max(1, requestedPage), pages);
  const start = (page - 1) * PAGE_SIZE;
  return { loans: loans.slice(start, start + PAGE_SIZE), page, pages, start };
}
