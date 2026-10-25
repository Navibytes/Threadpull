"use client";

import { useId, useMemo, useRef, useState } from "react";
import type { Loan, LoanStatus } from "@/lib/contracts/loan";
import { DISPOSITIONS, EMPTY_FILTERS, filterLoans, loanDealers, loanPage, type LoanFilters } from "./loan-list-model";
import styles from "./drawer.module.css";

export type LoanListProps = {
  loans: readonly Loan[];
  selectedLoanId?: string | null;
  onSelectLoan: (loan: Loan) => void;
};

const statusTone: Record<LoanStatus, string> = {
  "Not reviewed": styles.unreviewed,
  Investigate: styles.investigate,
  "No material anomaly found": styles.resolved,
  "Insufficient evidence": styles.insufficient,
  "Human-confirmed disposition": styles.confirmed,
};

export function LoanList({ loans, selectedLoanId, onSelectLoan }: LoanListProps) {
  const id = useId();
  const [filters, setFilters] = useState<LoanFilters>(EMPTY_FILTERS);
  const [requestedPage, setPage] = useState(1);
  const list = useRef<HTMLUListElement>(null);
  const dealers = useMemo(() => loanDealers(loans), [loans]);
  const filtered = useMemo(() => filterLoans(loans, filters), [loans, filters]);
  const page = loanPage(filtered, requestedPage);
  const hasFilters = filters.query !== "" || filters.status !== "all" || filters.dealerId !== "";

  function changeFilters(next: LoanFilters) {
    setFilters(next);
    setPage(1);
    list.current?.scrollTo({ top: 0 });
  }

  function changePage(next: number) {
    setPage(next);
    list.current?.scrollTo({ top: 0 });
  }

  return (
    <>
      <div className={styles.filters}>
        <label htmlFor={`${id}-search`}>Search loan ID</label>
        <input id={`${id}-search`} type="search" placeholder="e.g. L0037" value={filters.query}
          onChange={(event) => changeFilters({ ...filters, query: event.target.value })} />
        <label htmlFor={`${id}-status`}>Status</label>
        <select id={`${id}-status`} value={filters.status}
          onChange={(event) => changeFilters({ ...filters, status: event.target.value as LoanFilters["status"] })}>
          <option value="all">All statuses</option>
          <optgroup label="Review state"><option value="Not reviewed">Not reviewed</option></optgroup>
          <optgroup label="Investigation disposition">
            {DISPOSITIONS.map((status) => <option key={status} value={status}>{status}</option>)}
          </optgroup>
        </select>
        <label htmlFor={`${id}-dealer`}>Dealer</label>
        <select id={`${id}-dealer`} value={filters.dealerId}
          onChange={(event) => changeFilters({ ...filters, dealerId: event.target.value })}>
          <option value="">All dealers</option>
          {dealers.map(({ id, name }) => <option key={id} value={id}>{name} ({id})</option>)}
        </select>
        <button type="button" className={styles.textButton} disabled={!hasFilters}
          onClick={() => changeFilters(EMPTY_FILTERS)}>Clear filters</button>
      </div>
      <p className={styles.reviewNote}>Not reviewed means no investigation disposition has been recorded.</p>
      <p role="status" className={styles.count}>
        {filtered.length.toLocaleString("en-US")} of {loans.length.toLocaleString("en-US")} loans
        {filtered.length > 0 && ` · Showing ${page.start + 1}–${page.start + page.loans.length}`}
      </p>
      {filtered.length === 0 ? (
        <div className={styles.empty}>
          <h3>{loans.length === 0 ? "No loans filed yet" : "No matching loans"}</h3>
          <p>{loans.length === 0 ? "This portfolio has no loan records. Refresh after loans are loaded."
            : "Try another loan ID or clear the filters to see the portfolio."}</p>
        </div>
      ) : (
        <ul ref={list} className={styles.list} aria-label="Loans">
          {page.loans.map((loan) => (
            <li key={loan.loan_id}>
              <button type="button" className={styles.loan} aria-pressed={selectedLoanId === loan.loan_id}
                onClick={() => onSelectLoan(loan)}>
                <span className={styles.loanHeading}>
                  <span className={styles.loanId}>{loan.loan_id}</span>
                  {selectedLoanId === loan.loan_id && <span className={styles.selectedLabel}>Selected</span>}
                </span>
                <span className={styles.borrower}>{loan.applicant_info.first_name} {loan.applicant_info.last_name}</span>
                <span className={styles.dealer}>{loan.submission.dealer_name} · {loan.submission.dealer_id}</span>
                <span className={`${styles.chip} ${statusTone[loan.status]}`}>{loan.status}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <nav className={styles.pagination} aria-label="Loan pages">
        <button type="button" disabled={page.page === 1} onClick={() => changePage(page.page - 1)}>Previous</button>
        <span>Page {page.page} of {page.pages}</span>
        <button type="button" disabled={page.page === page.pages} onClick={() => changePage(page.page + 1)}>Next</button>
      </nav>
    </>
  );
}
