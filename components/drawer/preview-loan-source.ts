import type { Loan } from "@/lib/contracts/loan";
import type { LoanSource } from "./loan-source";

// Deliberately separate from the API adapter. These are UI fixtures, not a seeded investigation.
// Only existing Loan fields are used; fake dispositions demonstrate chip/filter presentation.
export function createPreviewLoans(): Loan[] {
  return Array.from({ length: 1_000 }, (_, index): Loan => {
    const number = index + 1;
    const dealer = (index % 24) + 1;
    return {
      loan_id: `L${String(number).padStart(4, "0")}`,
      kind: "background",
      persona_id: null,
      submission: {
        dealer_id: `PREVIEW-D${dealer}`, dealer_name: `Preview Motors ${dealer}`,
        broker_id: null, submitted_at: "2026-10-24T12:00:00Z", channel: "RouteOne",
        device_id: `preview-device-${number}`, ip_address: "192.0.2.1",
      },
      applicant_info: {
        first_name: "Synthetic", last_name: `Borrower ${number}`, date_of_birth: "1990-01-01",
        ssn: "000000000", email: `preview-${number}@example.invalid`, phone: "2025550100",
      },
      co_applicant_info: null,
      residential_info: {
        street_address: "1 Preview Street", city: "Example", state: "CA", zip_code: "00000",
        housing_status: "Rent", monthly_housing_payment: 1000, months_at_address: 24,
      },
      employment_info: {
        employer_name: "Synthetic Employer", job_title: "Preview role",
        time_at_employer_months: 24, gross_monthly_income: 5000,
      },
      vehicle_and_loan_details: {
        vehicle_condition: "Used", year_make_model: "2023 Preview Sedan", vin: "PREVIEW".padEnd(17, "0"),
        purchase_price: 24000, down_payment: 4000, requested_loan_amount: 20000,
      },
      funding_info: {
        amount_financed: 20000, apr: 0.06, term_months: 60, monthly_payment: 386.66,
        first_payment_date: "2026-11-24", current_balance: 20000, ach_bank_account: "preview-only",
      },
      documents: [],
      derived: {
        address_key: "preview-address", dealer_name_raw: `Preview Motors ${dealer}`,
        vehicle_year: 2023, make: "Preview", model_trim: "Sedan",
      },
      status: number % 10 === 1 ? "Investigate"
        : number % 10 === 2 ? "No material anomaly found"
        : number % 10 === 3 ? "Insufficient evidence"
        : number % 10 === 4 ? "Human-confirmed disposition" : "Not reviewed",
    };
  });
}

export const previewLoanSource: LoanSource = {
  kind: "preview",
  async load({ signal }) {
    signal.throwIfAborted();
    return createPreviewLoans();
  },
};
