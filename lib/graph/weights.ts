// Weight rules (SKELETON §6). All numbers here are design choices shown in the UI, not fraud statistics.
import type { Loan } from "@/lib/contracts/loan";
import type { NodeKind } from "@/lib/contracts/graph";
import type { SourceRef } from "@/lib/contracts/tool-result";

/** Personal things: shared across strangers = strong link. */
export const PERSONAL_KINDS: ReadonlySet<NodeKind> = new Set(["phone", "email", "bank_account", "device", "ip_address"]);
/** A personal value shared by up to this many loans is a full-strength link; beyond it, it dilutes (a carrier NAT IP). */
export const PERSONAL_FULL_UNTIL = 3;
/** Same phone + same unit + same last name (or listed co-applicant): personal and address links fade to this share. */
export const HOUSEHOLD_FADE = 0.1;
/**
 * Two loans join a connected cluster when their pair score (independent origins, each counted once) reaches this.
 * One personal link does it (1.0); one shared employer or building alone (at most 0.5) does not.
 */
export const CLUSTER_MIN_SCORE = 0.75;
/** find_connections lists links at or above this weight; weaker ones are only counted. */
export const LINK_MIN_WEIGHT = 0.1;

/** Rarity weight of a value shared by n loans. Shared-by-nature things (employer, building, dealer…) get 1/n. */
export function baseWeight(kind: NodeKind, n: number): number {
  if (n < 2) return 0;
  return PERSONAL_KINDS.has(kind) ? Math.min(1, PERSONAL_FULL_UNTIL / n) : 1 / n;
}

/** Yarn thickness on the board (SKELETON §6). */
export const yarnPx = (weight: number) => 1 + 8 * weight;

export type Attribute = { kind: NodeKind; value: string; origin: string; source: SourceRef };

const slug = (s: string) => s.toUpperCase().replace(/[^A-Z0-9@.]+/g, "-").replace(/^-|-$/g, "");
export const entityId = (kind: NodeKind, value: string) => `${kind}:${slug(value)}`;
const employerKey = (s: string) => s.toUpperCase().replace(/[.,]/g, " ").replace(/\s+(LLC|INC|CORP|CO)$/, "").replace(/\s+/g, " ").trim();

/**
 * The attributes a loan can share with another. Origins: borrower-provided facts each stand alone;
 * device, IP, dealer and broker all come from one submission; each document is its own origin.
 * Never city, state or ZIP alone: location is not a fraud signal (fair-lending proxy risk).
 */
export function attributesOf(loan: Loan): Attribute[] {
  const id = loan.loan_id, a = loan.applicant_info, s = loan.submission;
  const row = (field: string): SourceRef => ({ kind: "row", loan_id: id, field });
  const attrs: Attribute[] = [
    { kind: "phone", value: a.phone, origin: "phone", source: row("applicant_info.phone") },
    { kind: "email", value: a.email, origin: "email", source: row("applicant_info.email") },
    { kind: "bank_account", value: loan.funding_info.ach_bank_account.replace(/\D/g, ""), origin: "bank_account", source: row("funding_info.ach_bank_account") },
    { kind: "address", value: loan.derived.address_key, origin: "address", source: row("residential_info.street_address") },
    { kind: "employer", value: employerKey(loan.employment_info.employer_name), origin: "employer", source: row("employment_info.employer_name") },
    { kind: "device", value: s.device_id, origin: "submission", source: row("submission.device_id") },
    { kind: "ip_address", value: s.ip_address, origin: "submission", source: row("submission.ip_address") },
    { kind: "dealer", value: s.dealer_id, origin: "submission", source: row("submission.dealer_id") },
    ...(s.broker_id ? [{ kind: "broker" as const, value: s.broker_id, origin: "submission", source: row("submission.broker_id") }] : []),
    ...loan.documents.map((d) => ({
      kind: "doc_template" as const, value: d.template_id, origin: `document:${d.type}`,
      source: { kind: "document" as const, doc_id: d.doc_id, detail: "template_id" },
    })),
  ];
  return attrs.filter((x) => x.value.trim() !== "");
}

/** Sources proving two loans look like one household, or null. */
export function householdEvidence(x: Loan, y: Loan): SourceRef[] | null {
  const row = (l: Loan, field: string): SourceRef => ({ kind: "row", loan_id: l.loan_id, field });
  const rx = x.residential_info, ry = y.residential_info;
  if (x.applicant_info.phone !== y.applicant_info.phone) return null;
  if (rx.street_address !== ry.street_address || rx.zip_code !== ry.zip_code) return null;
  const names = (l: Loan) => `${l.applicant_info.first_name} ${l.applicant_info.last_name}`;
  const coNames = (l: Loan) => (l.co_applicant_info ? `${l.co_applicant_info.first_name} ${l.co_applicant_info.last_name}` : null);
  const sameLast = x.applicant_info.last_name === y.applicant_info.last_name;
  const listed = coNames(x) === names(y) || coNames(y) === names(x);
  if (!sameLast && !listed) return null;
  const why = sameLast ? "applicant_info.last_name" : "co_applicant_info";
  return [x, y].flatMap((l) => [row(l, "applicant_info.phone"), row(l, "residential_info.street_address"), row(l, why)]);
}
