// The loan tape as CSV: one row per loan, one column per RawLoan field (SKELETON §5.1), named by its dotted path.
// The generator writes this shape and intake reads it back, so the column list lives here, once. Documents don't
// fit a row, so a CSV tape carries none (a JSON tape does).

/** Every CSV column, in order. Optional and nullable fields are always present, empty when missing. */
export const TAPE_COLUMNS = [
  "loan_id", "kind", "persona_id",
  "submission.dealer_id", "submission.dealer_name", "submission.broker_id", "submission.submitted_at",
  "submission.channel", "submission.device_id", "submission.ip_address",
  "applicant_info.first_name", "applicant_info.last_name", "applicant_info.date_of_birth", "applicant_info.ssn",
  "applicant_info.email", "applicant_info.phone",
  "co_applicant_info.first_name", "co_applicant_info.last_name", "co_applicant_info.relationship",
  "residential_info.street_address", "residential_info.city", "residential_info.state", "residential_info.zip_code",
  "residential_info.housing_status", "residential_info.monthly_housing_payment", "residential_info.months_at_address",
  "employment_info.employer_name", "employment_info.job_title", "employment_info.time_at_employer_months",
  "employment_info.gross_monthly_income",
  "vehicle_and_loan_details.vehicle_condition", "vehicle_and_loan_details.year_make_model", "vehicle_and_loan_details.vin",
  "vehicle_and_loan_details.purchase_price", "vehicle_and_loan_details.down_payment",
  "vehicle_and_loan_details.requested_loan_amount",
  "funding_info.amount_financed", "funding_info.apr", "funding_info.term_months", "funding_info.monthly_payment",
  "funding_info.first_payment_date", "funding_info.current_balance", "funding_info.ach_bank_account",
] as const;

// Columns the contract types as numbers. Money columns (price, APR, balance…) stay text: the tape may write
// "$41,500.00" and the normalizer parses it.
const NUMBER_COLUMNS = new Set<string>([
  "residential_info.monthly_housing_payment", "residential_info.months_at_address",
  "employment_info.time_at_employer_months", "employment_info.gross_monthly_income",
  "vehicle_and_loan_details.down_payment", "funding_info.term_months", "funding_info.monthly_payment",
]);
// Nullable fields: an empty cell means null.
const NULLABLE_COLUMNS = new Set<string>(["persona_id", "submission.broker_id"]);
const KNOWN = new Set<string>(TAPE_COLUMNS);
const CO_APPLICANT = "co_applicant_info.";

const cell = (v: unknown) => {
  const s = v == null ? "" : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
const pick = (o: unknown, path: string) => path.split(".").reduce<unknown>((x, k) => (x as Record<string, unknown> | null)?.[k], o);

/** Write raw loans as CSV with TAPE_COLUMNS (documents are left out). */
export function formatTapeCsv(loans: readonly object[]): string {
  return [TAPE_COLUMNS.join(","), ...loans.map((l) => TAPE_COLUMNS.map((c) => cell(pick(l, c))).join(","))].join("\n") + "\n";
}

/** RFC 4180 CSV: quoted cells may hold commas, quotes ("") and line breaks. Returns rows of cells. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false, i = 0;
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text; // a BOM from spreadsheet exports
  for (; i < s.length; i++) {
    const c = s[i];
    if (quoted) {
      if (c === '"' && s[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === "") quoted = true;
    else if (c === ",") { row.push(field); field = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && s[i + 1] === "\n") i++;
      row.push(field); rows.push(row); row = []; field = "";
    } else field += c;
  }
  if (quoted) throw new Error("the CSV ends inside a quoted cell");
  if (field !== "" || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ""));
}

/**
 * One CSV row back into the nested RawLoan shape (not validated yet: intake runs the schema). Number columns are
 * converted when they parse cleanly and left as text otherwise, so the schema reports the bad cell. The co-applicant
 * is null when all three of its cells are empty. Only TAPE_COLUMNS are read: any other header (including one like
 * "__proto__.x") is skipped, so a column name can never write outside the loan object.
 */
export function rowToRawLoan(header: readonly string[], cells: readonly string[]): Record<string, unknown> {
  const out: Record<string, unknown> = { documents: [] };
  const co: Record<string, string> = {};
  header.forEach((col, i) => {
    if (!KNOWN.has(col)) return;
    const raw = (cells[i] ?? "").trim();
    if (col.startsWith(CO_APPLICANT)) { co[col.slice(CO_APPLICANT.length)] = raw; return; }
    const value = NULLABLE_COLUMNS.has(col) && raw === "" ? null
      : NUMBER_COLUMNS.has(col) && raw !== "" && Number.isFinite(Number(raw)) ? Number(raw) : raw;
    const keys = col.split(".");
    let at = out;
    for (const k of keys.slice(0, -1)) at = (at[k] ??= {}) as Record<string, unknown>;
    at[keys.at(-1)!] = value;
  });
  out.co_applicant_info = Object.values(co).some((x) => x !== "") ? co : null;
  return out;
}
