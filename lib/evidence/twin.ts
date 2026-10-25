// Twin Compare (ticket 07): two lookalike loans side by side. Which identifying facts they share, which differ,
// and what split them: the check or saved rule that explained their link, or nothing yet. Pure, so the board can
// render it and tests can check it. Values are display strings; SSNs and bank accounts show only their last four.
// Rarity weights connections (CLAUDE.md rule 4): given the pool, a fact shared by many loans (a payroll template, a
// 40-loan employer) is "common", not shared, by the same weight rule the graph uses.
import type { NodeKind } from "@/lib/contracts/graph";
import type { Loan } from "@/lib/contracts/loan";
import { baseWeight, LINK_MIN_WEIGHT } from "@/lib/graph";
import { fingerprint } from "./documents";

export type TwinRow = {
  label: string;
  kind: NodeKind | null; // the graph's link kind for this fact, when it can be a thread
  a: string;
  b: string;
  same: boolean; // the two loans have the same value
  shared_by: number | null; // loans in the pool with this value (when same and the pool was given)
  weight: number | null; // the graph's rarity weight for that count; null for facts that aren't links
  strong: boolean; // same, and rare enough to count as a link (weight >= LINK_MIN_WEIGHT, or not a link kind)
};

/** What took the pair's suspicion down, copied from the board's explained thread. */
export type TwinSplit = { explainedBy: string; ruleId: string | null; reason: string; seq: number };

export type TwinComparison = {
  a: string;
  b: string;
  rows: TwinRow[];
  shared: string[]; // labels of the strong shared facts, in row order
  split: TwinSplit | null;
};

const last4 = (s: string) => (s.length > 4 ? `•••${s.slice(-4)}` : s);
const stub = (l: Loan) => l.documents.find((d) => d.type === "pay_stub");

// [label, link kind, shown value, compared value]. Compared values are the normalized fields, so formatting never
// makes two equal facts look different.
const FACTS: [string, NodeKind | null, (l: Loan) => string, (l: Loan) => string][] = [
  ["Applicant", null, (l) => `${l.applicant_info.first_name} ${l.applicant_info.last_name}`, (l) => `${l.applicant_info.first_name} ${l.applicant_info.last_name}`],
  ["Date of birth", null, (l) => l.applicant_info.date_of_birth, (l) => l.applicant_info.date_of_birth],
  ["SSN", null, (l) => last4(l.applicant_info.ssn), (l) => l.applicant_info.ssn],
  ["Phone", "phone", (l) => l.applicant_info.phone, (l) => l.applicant_info.phone],
  ["Email", "email", (l) => l.applicant_info.email, (l) => l.applicant_info.email],
  ["Address", "address", (l) => `${l.residential_info.street_address}, ${l.residential_info.zip_code}`, (l) => l.derived.address_key],
  ["Employer", "employer", (l) => l.employment_info.employer_name, (l) => l.employment_info.employer_name.toUpperCase()],
  ["Bank account", "bank_account", (l) => last4(l.funding_info.ach_bank_account), (l) => l.funding_info.ach_bank_account],
  ["Device", "device", (l) => l.submission.device_id, (l) => l.submission.device_id],
  ["IP address", "ip_address", (l) => l.submission.ip_address, (l) => l.submission.ip_address],
  ["Dealer", "dealer", (l) => l.submission.dealer_name, (l) => l.submission.dealer_id],
  ["Pay-stub template", "doc_template", (l) => stub(l)?.template_id ?? "none", (l) => (stub(l) ? fingerprint(stub(l)!) : "")],
];

export function compareTwins(a: Loan, b: Loan, split: TwinSplit | null = null, pool?: Iterable<Loan>): TwinComparison {
  const loans = pool ? [...pool] : null;
  const rows: TwinRow[] = FACTS.map(([label, kind, show, key]) => {
    const ka = key(a), same = ka !== "" && ka === key(b);
    const n = same && loans ? loans.filter((l) => key(l) === ka).length : null;
    const weight = kind && n !== null ? baseWeight(kind, n) : null;
    return { label, kind, a: show(a), b: show(b), same, shared_by: n, weight, strong: same && (weight === null || weight >= LINK_MIN_WEIGHT) };
  });
  return { a: a.loan_id, b: b.loan_id, rows, shared: rows.filter((r) => r.strong).map((r) => r.label), split };
}
