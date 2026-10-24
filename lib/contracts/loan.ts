// Loan record contract (SKELETON §5.1). Shaped like the credit application a dealer sends the bank,
// plus the submission metadata and funding data the bank holds after funding.
import { z } from "zod";

// The tape is messy on purpose: money can arrive as "$41,500.00", APR as "6.9%".
const money = z.union([z.number(), z.string()]);

export const DocumentSchema = z.object({
  doc_id: z.string(),
  type: z.enum(["pay_stub", "application"]),
  template_id: z.string(),
  font: z.string(),
  creating_tool: z.string(),
  text: z.string(),
});

export const RawLoanSchema = z.object({
  loan_id: z.string().regex(/^L\d{4}$/),
  kind: z.enum(["case", "background"]),
  persona_id: z.string().nullable(), // never read by detection code
  submission: z.object({
    dealer_id: z.string(),
    dealer_name: z.string(),
    broker_id: z.string().nullable(),
    submitted_at: z.string(),
    channel: z.enum(["RouteOne", "DealerTrack"]),
    device_id: z.string(),
    ip_address: z.string(),
  }),
  applicant_info: z.object({
    first_name: z.string(),
    last_name: z.string(),
    date_of_birth: z.string(),
    ssn: z.string(),
    email: z.string(),
    phone: z.string(),
  }),
  co_applicant_info: z
    .object({ first_name: z.string(), last_name: z.string(), relationship: z.string() })
    .nullable(),
  residential_info: z.object({
    street_address: z.string(),
    city: z.string(),
    state: z.string(),
    zip_code: z.string(),
    housing_status: z.enum(["Rent", "Own", "Mortgage", "Live with family"]),
    monthly_housing_payment: z.number(),
    months_at_address: z.number().int(),
  }),
  employment_info: z.object({
    employer_name: z.string(),
    job_title: z.string(),
    time_at_employer_months: z.number().int(),
    gross_monthly_income: z.number(),
  }),
  vehicle_and_loan_details: z.object({
    vehicle_condition: z.enum(["New", "Used"]),
    year_make_model: z.string(),
    vin: z.string().length(17),
    purchase_price: money,
    down_payment: z.number(),
    requested_loan_amount: money,
  }),
  funding_info: z.object({
    amount_financed: money,
    apr: money,
    term_months: z.number().int(),
    monthly_payment: z.number(),
    first_payment_date: z.string(),
    current_balance: money,
    ach_bank_account: z.string(),
  }),
  documents: z.array(DocumentSchema),
});

export const LOAN_STATUSES = [
  "Not reviewed",
  "Investigate",
  "No material anomaly found",
  "Insufficient evidence",
  "Human-confirmed disposition",
] as const;

// After normalization: same blocks with clean values, numbers as numbers, plus derived fields.
export const LoanSchema = RawLoanSchema.extend({
  vehicle_and_loan_details: RawLoanSchema.shape.vehicle_and_loan_details.extend({
    purchase_price: z.number(),
    requested_loan_amount: z.number(),
  }),
  funding_info: RawLoanSchema.shape.funding_info.extend({
    amount_financed: z.number(),
    apr: z.number(),
    current_balance: z.number(),
  }),
  derived: z.object({
    address_key: z.string(), // street without unit + ZIP: links a shared building
    dealer_name_raw: z.string(),
    vehicle_year: z.number().int(),
    make: z.string(),
    model_trim: z.string(),
  }),
  status: z.enum(LOAN_STATUSES),
});

export type Document = z.infer<typeof DocumentSchema>;
export type RawLoan = z.infer<typeof RawLoanSchema>;
export type Loan = z.infer<typeof LoanSchema>;
export type LoanStatus = (typeof LOAN_STATUSES)[number];
