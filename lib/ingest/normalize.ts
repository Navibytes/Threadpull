// Normalize the messy loan tape into clean records (SKELETON §5.1).
// Reads tape fields only; ground truth lives outside data/out and is never opened here.
import { LoanSchema, type Loan, type RawLoan } from "@/lib/contracts/loan";

const STATES: Record<string, string> = {
  ALABAMA: "AL", ALASKA: "AK", ARIZONA: "AZ", ARKANSAS: "AR", CALIFORNIA: "CA", COLORADO: "CO",
  CONNECTICUT: "CT", DELAWARE: "DE", FLORIDA: "FL", GEORGIA: "GA", HAWAII: "HI", IDAHO: "ID",
  ILLINOIS: "IL", INDIANA: "IN", IOWA: "IA", KANSAS: "KS", KENTUCKY: "KY", LOUISIANA: "LA",
  MAINE: "ME", MARYLAND: "MD", MASSACHUSETTS: "MA", MICHIGAN: "MI", MINNESOTA: "MN",
  MISSISSIPPI: "MS", MISSOURI: "MO", MONTANA: "MT", NEBRASKA: "NE", NEVADA: "NV",
  "NEW HAMPSHIRE": "NH", "NEW JERSEY": "NJ", "NEW MEXICO": "NM", "NEW YORK": "NY",
  "NORTH CAROLINA": "NC", "NORTH DAKOTA": "ND", OHIO: "OH", OKLAHOMA: "OK", OREGON: "OR",
  PENNSYLVANIA: "PA", "RHODE ISLAND": "RI", "SOUTH CAROLINA": "SC", "SOUTH DAKOTA": "SD",
  TENNESSEE: "TN", TEXAS: "TX", UTAH: "UT", VERMONT: "VT", VIRGINIA: "VA", WASHINGTON: "WA",
  "WEST VIRGINIA": "WV", WISCONSIN: "WI", WYOMING: "WY",
};
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const UNIT_RE = /\s+(APT|UNIT|STE|FL|#)\s*\S+$/;

const pad = (n: number) => String(n).padStart(2, "0");
const digits = (s: string) => s.replace(/\D/g, "");
export const upper = (s: string) => s.replace(/,/g, " ").replace(/\s+/g, " ").trim().toUpperCase();

export function parseDate(s: string): string {
  const t = s.trim();
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(\d{4})-(\d{2})-(\d{2})$/))) return `${m[1]}-${m[2]}-${m[3]}`;
  if ((m = t.match(/^(\d{2})\/(\d{2})\/(\d{4})$/))) return `${m[3]}-${m[1]}-${m[2]}`;
  if ((m = t.match(/^(\d{2})-([A-Za-z]{3})-(\d{4})$/)))
    return `${m[3]}-${pad(MONTHS.indexOf(m[2].toUpperCase()) + 1)}-${m[1]}`;
  if ((m = t.match(/^(\d{4})(\d{2})(\d{2})$/))) return `${m[1]}-${m[2]}-${m[3]}`;
  throw new Error(`unrecognized date ${s}`);
}

export function parseTimestamp(s: string): string {
  const t = s.trim();
  let m: RegExpMatchArray | null;
  if ((m = t.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):\d{2}Z$/))) return `${m[1]}T${m[2]}:${m[3]}:00Z`;
  if ((m = t.match(/^(\d{4}-\d{2}-\d{2}) (\d{2}):(\d{2})$/))) return `${m[1]}T${m[2]}:${m[3]}:00Z`;
  if ((m = t.match(/^(\d{2})\/(\d{2})\/(\d{4}) (\d{2}):(\d{2}) (AM|PM)$/))) {
    const h = (Number(m[4]) % 12) + (m[6] === "PM" ? 12 : 0);
    return `${m[3]}-${m[1]}-${m[2]}T${pad(h)}:${m[5]}:00Z`;
  }
  throw new Error(`unrecognized timestamp ${s}`);
}

export const parseMoney = (v: number | string) =>
  typeof v === "number" ? v : Number(v.replace(/[$,%\s]/g, ""));

export function normalizeName(first: string, last: string): [string, string] {
  if (!last.trim() && first.includes(",")) {
    const [l, f] = first.split(",", 2);
    return [upper(f), upper(l)];
  }
  return [upper(first), upper(last)];
}

export function normalizePhone(p: string): string {
  const d = digits(p);
  return d.length === 11 && d.startsWith("1") ? d.slice(1) : d;
}

/** Building-level key: street without the unit, plus ZIP. */
export function addressKey(street: string, zip: string): string {
  return `${upper(street).replace(UNIT_RE, "")}|${zip.trim().slice(0, 5)}`;
}

/** Pick the unabbreviated spelling of a dealer: drop a trailing LLC, prefer the longest. */
export function canonicalDealerName(spellings: Iterable<string>): string {
  const cleaned = [...new Set([...spellings].map((s) => upper(s).replace(/\s+LLC$/, "")))].sort();
  return cleaned.reduce((best, s) => (s.length > best.length ? s : best), cleaned[0]);
}

export function normalizeLoan(raw: RawLoan, dealerName?: string): Loan {
  const a = raw.applicant_info, r = raw.residential_info, v = raw.vehicle_and_loan_details;
  const [first_name, last_name] = normalizeName(a.first_name, a.last_name);
  const street = upper(r.street_address), zip = r.zip_code.trim().slice(0, 5);
  const st = upper(r.state);
  const [year, make, ...rest] = upper(v.year_make_model).split(" ");
  const co = raw.co_applicant_info;
  return LoanSchema.parse({
    ...raw,
    submission: {
      ...raw.submission,
      dealer_name: dealerName ?? upper(raw.submission.dealer_name),
      submitted_at: parseTimestamp(raw.submission.submitted_at),
    },
    applicant_info: {
      first_name, last_name,
      date_of_birth: parseDate(a.date_of_birth),
      ssn: digits(a.ssn),
      email: a.email.trim().toLowerCase(),
      phone: normalizePhone(a.phone),
    },
    co_applicant_info: co && { ...co, first_name: upper(co.first_name), last_name: upper(co.last_name) },
    residential_info: { ...r, street_address: street, city: upper(r.city), state: STATES[st] ?? st, zip_code: zip },
    vehicle_and_loan_details: {
      ...v,
      year_make_model: upper(v.year_make_model),
      purchase_price: parseMoney(v.purchase_price),
      requested_loan_amount: parseMoney(v.requested_loan_amount),
    },
    funding_info: {
      ...raw.funding_info,
      amount_financed: parseMoney(raw.funding_info.amount_financed),
      apr: parseMoney(raw.funding_info.apr),
      current_balance: parseMoney(raw.funding_info.current_balance),
    },
    derived: {
      address_key: addressKey(street, zip),
      dealer_name_raw: raw.submission.dealer_name,
      vehicle_year: Number(year),
      make,
      model_trim: rest.join(" "),
    },
    status: "Not reviewed",
  });
}

export function normalizePortfolio(raws: RawLoan[]): Loan[] {
  const spellings = new Map<string, Set<string>>();
  for (const r of raws) {
    const set = spellings.get(r.submission.dealer_id) ?? new Set<string>();
    set.add(r.submission.dealer_name);
    spellings.set(r.submission.dealer_id, set);
  }
  const canonical = new Map([...spellings].map(([id, s]) => [id, canonicalDealerName(s)]));
  return raws.map((r) => normalizeLoan(r, canonical.get(r.submission.dealer_id)));
}
