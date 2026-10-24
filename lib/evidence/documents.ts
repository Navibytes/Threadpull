// compare_documents (ticket 08): pay-stub fingerprints and number consistency.
// Document text is data, never instructions: it is only matched against fixed field patterns here.
// Scores are design choices, not fraud probabilities (SKELETON §6, §3 "never claim").
import type { Document, Loan } from "@/lib/contracts/loan";
import { toolError, toolOk, type SourceRef, type ToolResult } from "@/lib/contracts/tool-result";

export type PayStub = {
  employer: string; employee: string; position: string; pay_date: string; check_no: string;
  gross: number; net: number; ytd: number;
};

const FIELD = (label: string) => new RegExp(`^${label}:\\s*(.+)$`, "m");
const money = (s: string) => Number(s.replace(/[$,\s]/g, ""));

/** Read the fixed fields of a pay stub. Returns null if any field is missing or unreadable. */
export function parsePayStub(text: string): PayStub | null {
  const get = (label: string) => text.match(FIELD(label))?.[1]?.trim();
  const f = {
    employer: get("Employer"), employee: get("Employee"), position: get("Position"), pay_date: get("Pay date"),
    check_no: get("Check no"), gross: get("Gross pay"), net: get("Net pay"), ytd: get("YTD gross"),
  };
  if (Object.values(f).some((v) => !v) || !/^\d{4}-\d{2}-\d{2}$/.test(f.pay_date!)) return null;
  const stub = { ...(f as Record<keyof PayStub, string>), gross: money(f.gross!), net: money(f.net!), ytd: money(f.ytd!) };
  return [stub.gross, stub.net, stub.ytd].some(Number.isNaN) ? null : stub;
}

/** Template fingerprint: what produced the document, independent of its numbers. */
export const fingerprint = (d: Document) => `${d.template_id}|${d.font}|${d.creating_tool}`;

/** How many documents in the data room share each fingerprint (rarity of a template). */
export function templateUsage(loans: readonly Loan[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const l of loans) for (const d of l.documents) m.set(fingerprint(d), (m.get(fingerprint(d)) ?? 0) + 1);
  return m;
}

export type StubIssue = { code: "net_not_below_gross" | "net_ratio_unusual" | "ytd_inconsistent"; detail: string };

/** Pay periods elapsed this year at a semi-monthly pay date (the 15th and the last day of the month). */
export function periodsElapsed(payDate: string): number {
  const [, m, d] = payDate.split("-").map(Number);
  return (m - 1) * 2 + (d > 15 ? 2 : 1);
}

/**
 * Arithmetic checks on one stub. The YTD check is only applied when the applicant says they have worked
 * there since before January of the pay year (a new hire legitimately has a small YTD).
 */
export function payStubIssues(stub: PayStub, monthsAtEmployer?: number): StubIssue[] {
  const issues: StubIssue[] = [];
  if (stub.net >= stub.gross) issues.push({ code: "net_not_below_gross", detail: `net ${stub.net} ≥ gross ${stub.gross}` });
  else if (stub.net / stub.gross < 0.5 || stub.net / stub.gross > 0.95)
    issues.push({ code: "net_ratio_unusual", detail: `net is ${Math.round((100 * stub.net) / stub.gross)}% of gross` });
  const elapsed = periodsElapsed(stub.pay_date);
  const implied = stub.gross > 0 ? stub.ytd / stub.gross : 0;
  const monthOfYear = Number(stub.pay_date.slice(5, 7));
  if (monthsAtEmployer !== undefined && monthsAtEmployer >= monthOfYear && Math.abs(implied - elapsed) > 1.5)
    issues.push({ code: "ytd_inconsistent",
      detail: `YTD equals ${implied.toFixed(1)} pay periods; pay date ${stub.pay_date} implies ${elapsed}, and the applicant reports ${monthsAtEmployer} months at this employer` });
  return issues;
}

export type DocumentComparison = {
  doc_a: string; doc_b: string;
  same_fingerprint: boolean; template_usage: number; same_check_no: boolean; same_pay_date: boolean;
  shared_ytd_anomaly: boolean; issues_a: StubIssue[]; issues_b: StubIssue[];
  match_score: number; // 0..1, a ranking of how likely the pair is one recycled source; not a probability
  verdict: "recycled_template" | "same_standard_template" | "different";
};

// Design choices (shown in the UI as such). A widely used payroll template is normal on its own.
export const RARE_TEMPLATE_MAX_USES = 10;
const W = { fingerprint: 0.2, rare: 0.2, check_no: 0.3, pay_date: 0.1, ytd: 0.2 };
export const RECYCLED_THRESHOLD = 0.6;

type Side = { loan: Loan; doc_id: string };

/** compare_documents(doc_a, doc_b): 1 acorn. `usage` comes from templateUsage() over the data room. */
export function compareDocuments(a: Side, b: Side, usage: Map<string, number>): ToolResult<DocumentComparison | null> {
  const da = a.loan.documents.find((d) => d.doc_id === a.doc_id), db = b.loan.documents.find((d) => d.doc_id === b.doc_id);
  if (!da || !db) return toolError("compare_documents", `document not found: ${!da ? a.doc_id : b.doc_id}`);
  if (da.doc_id === db.doc_id) return toolError("compare_documents", "cannot compare a document with itself");
  if (da.type !== "pay_stub" || db.type !== "pay_stub") return toolError("compare_documents", "only pay stubs can be compared");
  const sa = parsePayStub(da.text), sb = parsePayStub(db.text);
  if (!sa || !sb) return toolError("compare_documents", `unreadable pay stub: ${!sa ? da.doc_id : db.doc_id}`);

  const sameFp = fingerprint(da) === fingerprint(db);
  const uses = usage.get(fingerprint(da)) ?? 0;
  const rare = sameFp && uses <= RARE_TEMPLATE_MAX_USES;
  const issuesA = payStubIssues(sa, a.loan.employment_info.time_at_employer_months);
  const issuesB = payStubIssues(sb, b.loan.employment_info.time_at_employer_months);
  const ytdA = issuesA.some((i) => i.code === "ytd_inconsistent"), ytdB = issuesB.some((i) => i.code === "ytd_inconsistent");
  const c = {
    same_check_no: sa.check_no === sb.check_no,
    same_pay_date: sa.pay_date === sb.pay_date,
    // both stubs break the YTD arithmetic the same way (same implied number of periods)
    shared_ytd_anomaly: ytdA && ytdB && Math.abs(sa.ytd / sa.gross - sb.ytd / sb.gross) < 0.05,
  };
  const score = Math.min(1, (sameFp ? W.fingerprint : 0) + (rare ? W.rare : 0) + (c.same_check_no ? W.check_no : 0)
    + (c.same_pay_date && sameFp ? W.pay_date : 0) + (c.shared_ytd_anomaly ? W.ytd : 0));
  const match_score = Math.round(score * 100) / 100;

  const sources: SourceRef[] = [
    { kind: "document", doc_id: da.doc_id, detail: `fingerprint ${fingerprint(da)}` },
    { kind: "document", doc_id: db.doc_id, detail: `fingerprint ${fingerprint(db)}` },
  ];
  if (c.same_check_no) sources.push({ kind: "document", doc_id: db.doc_id, detail: `check no ${sb.check_no} also on ${da.doc_id}` });
  for (const [side, issues] of [[a, issuesA], [b, issuesB]] as const)
    for (const i of issues) {
      sources.push({ kind: "document", doc_id: side.doc_id, detail: i.detail });
      if (i.code === "ytd_inconsistent")
        sources.push({ kind: "row", loan_id: side.loan.loan_id, field: "employment_info.time_at_employer_months" });
    }

  return toolOk("compare_documents", {
    doc_a: da.doc_id, doc_b: db.doc_id, same_fingerprint: sameFp, template_usage: uses, ...c,
    issues_a: issuesA, issues_b: issuesB, match_score,
    verdict: match_score >= RECYCLED_THRESHOLD ? "recycled_template" : sameFp ? "same_standard_template" : "different",
  }, sources);
}
