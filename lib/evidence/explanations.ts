// Explanation checks (ticket 07): look for a normal reason behind a suspicious link.
// When `explains` is true, the caller may take the string down (`clue_explained`) citing these sources.
// Checks only report; code elsewhere sets statuses. Thresholds are design choices, not fraud statistics.
import type { Loan } from "@/lib/contracts/loan";
import { toolError, toolOk, type SourceRef, type ToolResult } from "@/lib/contracts/tool-result";
import type { Reference } from "@/lib/ingest/reference";

const fullName = (first: string, last: string) => `${first} ${last}`.replace(/\s+/g, " ").trim().toUpperCase();

// ---------------------------------------------------------------- check_address

export type AddressCheck = {
  address_key: string; address_type: "single_family" | "multi_unit" | "commercial" | "unknown"; units: number | null;
  loans_at_address: number; explains: boolean; reason: string;
};

/** check_address: is a shared address a multi-unit building with room for everyone who names it? */
export function checkAddress(addressKey: string, loans: readonly Loan[], ref: Reference): ToolResult<AddressCheck> {
  const at = loans.filter((l) => l.derived.address_key === addressKey);
  const found = ref.addresses[addressKey];
  const type = found?.address_type ?? "unknown", units = found?.units ?? null;
  // there is only something to explain when the address is actually shared
  const explains = at.length >= 2 && type === "multi_unit" && units !== null && units >= at.length;
  const reason = at.length < 2 ? `only ${at.length} loan names this address: no shared address to explain`
    : explains ? `${units}-unit building; ${at.length} loans name it`
    : type === "multi_unit" ? `${units}-unit building but ${at.length} loans name it`
    : type === "commercial" ? "commercial address, not a home"
    : type === "single_family" ? "single-family home: sharing it needs another explanation (household)"
    : "address not found in the lookup";
  const sources: SourceRef[] = [
    { kind: "lookup", name: "address_type", key: addressKey, simulated: true },
    ...at.map((l) => ({ kind: "row" as const, loan_id: l.loan_id, field: "residential_info.street_address" })),
  ];
  return toolOk("check_address", { address_key: addressKey, address_type: type, units, loans_at_address: at.length, explains, reason },
    sources, true);
}

// ---------------------------------------------------------------- check_household

export type HouseholdCheck = {
  loan_a: string; loan_b: string; same_phone: boolean; same_address: boolean; same_last_name: boolean;
  co_applicant_listed: boolean; explains: boolean; reason: string;
};

/**
 * check_household: same phone + same address + (same last name or one lists the other as co-applicant)
 * means one household (SKELETON §6). A shared phone between different homes is never explained here.
 */
export function checkHousehold(a: Loan, b: Loan): ToolResult<HouseholdCheck | null> {
  if (a.loan_id === b.loan_id) return toolError("check_household", "cannot compare a loan with itself");
  const ai = a.applicant_info, bi = b.applicant_info;
  const lists = (x: Loan, y: Loan) => !!x.co_applicant_info
    && fullName(x.co_applicant_info.first_name, x.co_applicant_info.last_name) === fullName(y.applicant_info.first_name, y.applicant_info.last_name);
  const r = {
    same_phone: ai.phone === bi.phone,
    same_address: a.derived.address_key === b.derived.address_key,
    same_last_name: ai.last_name === bi.last_name,
    co_applicant_listed: lists(a, b) || lists(b, a),
  };
  const explains = r.same_phone && r.same_address && (r.same_last_name || r.co_applicant_listed);
  const reason = explains ? `same phone and home${r.co_applicant_listed ? "; listed as co-applicants" : "; same last name"}`
    : !r.same_address ? "different homes" : !r.same_phone ? "same home but different phones" : "same phone and home, but no family link";
  const field = (f: string) => [a, b].map((l) => ({ kind: "row" as const, loan_id: l.loan_id, field: f }));
  const sources: SourceRef[] = [...field("applicant_info.phone"), ...field("residential_info.street_address"),
    ...field("applicant_info.last_name"), ...(r.co_applicant_listed ? field("co_applicant_info") : [])];
  return toolOk("check_household", { loan_a: a.loan_id, loan_b: b.loan_id, ...r, explains, reason }, sources);
}

// ---------------------------------------------------------------- check_employer

export const LARGE_EMPLOYER_MIN_HEADCOUNT = 500; // matches R-001's min_group_size (SKELETON §9)

export type EmployerCheck = {
  employer: string; headcount: number | null; loans_in_pool: number; weight: number;
  verdict: "large_employer" | "small_employer" | "implausible" | "unknown";
  explains: false; reason: string;
};

/**
 * check_employer: facts only. It never takes a string down by itself: a large employer is the evidence that an
 * ask-once rule (R-001) or a human ruling uses (ticket 11). More borrowers than staff is a red flag.
 */
export function checkEmployer(employer: string, loans: readonly Loan[], ref: Reference): ToolResult<EmployerCheck> {
  const named = loans.filter((l) => l.employment_info.employer_name === employer);
  const headcount = ref.employers[employer]?.headcount ?? null;
  const verdict: EmployerCheck["verdict"] = headcount === null ? "unknown" : named.length > headcount ? "implausible"
    : headcount >= LARGE_EMPLOYER_MIN_HEADCOUNT ? "large_employer" : "small_employer";
  const reason = {
    large_employer: `${headcount?.toLocaleString("en-US")} staff; ${named.length} loans name it. Needs a saved rule or a human ruling to clear`,
    small_employer: `only ${headcount} staff; ${named.length} loans name it`
      + (headcount && named.length / headcount >= 0.25 ? ` (${Math.round((100 * named.length) / headcount)}% of its staff)` : ""),
    implausible: `${named.length} loans name an employer with ${headcount} staff`,
    unknown: "employer not found in the lookup",
  }[verdict];
  const sources: SourceRef[] = [
    { kind: "lookup", name: "employer_headcount", key: employer, simulated: true },
    ...named.slice(0, 50).map((l) => ({ kind: "row" as const, loan_id: l.loan_id, field: "employment_info.employer_name" })),
  ];
  return toolOk("check_employer", { employer, headcount, loans_in_pool: named.length,
    weight: named.length ? 1 / named.length : 0, verdict, explains: false, reason }, sources, true);
}

// ---------------------------------------------------------------- dealer_timeline

export const BURST_WINDOW_DAYS = 10;
export const BURST_MIN_LOANS = 5;
export const BURST_MIN_RATIO = 4; // times the dealer's own expected volume for the window
export const MONTH_END_DAYS = 3;

export type Burst = {
  start: string; end: string; loan_ids: string[]; count: number; expected: number;
  month_end_share: number; explains: boolean; reason: string;
};
export type DealerTimeline = {
  dealer_id: string; months: { month: string; count: number; month_end: number }[]; median_monthly: number;
  history_month_end_share: number; month_end_heavy_months: number; bursts: Burst[];
};

const DAY = 86_400_000;
const isMonthEnd = (iso: string) => {
  const d = new Date(iso);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  return d.getUTCDate() > last - MONTH_END_DAYS;
};
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0; };

/**
 * dealer_timeline: bursts in a dealer's volume, compared with the dealer's own history. A burst is explained only
 * when it sits at month-end AND the dealer's other months show the same month-end push. Volume alone is weak
 * evidence: ordinary dealers reach 5-6 loans in 10 days by chance, so an unexplained burst is context, not proof.
 */
export function dealerTimeline(dealerId: string, loans: readonly Loan[]): ToolResult<DealerTimeline | null> {
  const own = loans.filter((l) => l.submission.dealer_id === dealerId)
    .sort((x, y) => x.submission.submitted_at.localeCompare(y.submission.submitted_at));
  if (!own.length) return toolError("dealer_timeline", `no loans for dealer ${dealerId}`);
  const monthsMap = new Map<string, { count: number; month_end: number }>();
  for (const l of own) {
    const m = l.submission.submitted_at.slice(0, 7), e = monthsMap.get(m) ?? { count: 0, month_end: 0 };
    e.count++; if (isMonthEnd(l.submission.submitted_at)) e.month_end++;
    monthsMap.set(m, e);
  }
  const months = [...monthsMap].map(([month, v]) => ({ month, ...v }));
  const med = median(months.map((m) => m.count));
  const expected = (med * BURST_WINDOW_DAYS) / 30.4;

  // sliding windows, merged into maximal bursts
  const t = own.map((l) => Date.parse(l.submission.submitted_at));
  const hot: [number, number][] = [];
  for (let i = 0, j = 0; i < t.length; i++) {
    while (t[i] - t[j] > BURST_WINDOW_DAYS * DAY) j++;
    const n = i - j + 1;
    if (n >= BURST_MIN_LOANS && n >= BURST_MIN_RATIO * expected) {
      const last = hot[hot.length - 1];
      if (last && j <= last[1]) last[1] = i; else hot.push([j, i]);
    }
  }
  const burstIds = new Set(hot.flatMap(([j, i]) => own.slice(j, i + 1).map((l) => l.loan_id)));
  const history = own.filter((l) => !burstIds.has(l.loan_id));
  const historyShare = history.length ? history.filter((l) => isMonthEnd(l.submission.submitted_at)).length / history.length : 0;
  // months (outside bursts) where at least 2 loans and 30% of the month landed in the last days
  const heavyMonths = months.filter((m) => {
    const ls = history.filter((l) => l.submission.submitted_at.startsWith(m.month));
    const me = ls.filter((l) => isMonthEnd(l.submission.submitted_at)).length;
    return me >= 2 && me / Math.max(1, ls.length) >= 0.3;
  }).length;

  const bursts: Burst[] = hot.map(([j, i]) => {
    const ls = own.slice(j, i + 1);
    const share = ls.filter((l) => isMonthEnd(l.submission.submitted_at)).length / ls.length;
    const explains = share >= 0.6 && historyShare >= 0.25 && heavyMonths >= 3;
    return {
      start: ls[0].submission.submitted_at, end: ls[ls.length - 1].submission.submitted_at,
      loan_ids: ls.map((l) => l.loan_id), count: ls.length, expected: Math.round(expected * 10) / 10,
      month_end_share: Math.round(share * 100) / 100, explains,
      reason: explains ? `month-end push: the dealer did the same in ${heavyMonths} other months`
        : share >= 0.6 ? "at month-end, but the dealer has no history of month-end pushes"
        : `${ls.length} loans in ${BURST_WINDOW_DAYS} days vs about ${Math.round(expected * 10) / 10} expected; not a month-end pattern`,
    };
  });
  const sources: SourceRef[] = own.map((l) => ({ kind: "row" as const, loan_id: l.loan_id, field: "submission.submitted_at" }));
  return toolOk("dealer_timeline", { dealer_id: dealerId, months, median_monthly: med,
    history_month_end_share: Math.round(historyShare * 100) / 100, month_end_heavy_months: heavyMonths, bursts }, sources);
}
