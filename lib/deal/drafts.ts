// Drafted outputs (ticket 10): a buyback demand per dealer for Exclude loans, a document request per Review loan. Templates in
// code, no model: every line comes from the report, each loan cites the audit-log events behind it, and the wording states
// findings for a person to review, never a conclusion about anyone. Nothing is sent: the CRO and legal decide.
import type { DealReport, LoanRow } from "./report";

export type BuybackDemand = {
  dealer_id: string;
  dealer_name: string;
  loans: { loan_id: string; balance: number; basis: string; request_ids: string[]; event_seqs: number[] }[];
  total_balance: number;
  text: string;
};
export type DocumentRequest = {
  loan_id: string;
  dealer_id: string;
  dealer_name: string;
  balance: number;
  reason: string;
  documents: string[];
  event_seqs: number[];
  text: string;
};

const money = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const events = (seqs: number[]) => seqs.map((s) => `#${s}`).join(", ");
const DRAFT_LINE = "DRAFT for review by the CRO and legal. Not sent.";

export function buybackDemands(report: DealReport): BuybackDemand[] {
  const byDealer = new Map<string, LoanRow[]>();
  for (const r of report.loans.filter((l) => l.verdict === "Exclude")) byDealer.set(r.dealer_id, [...(byDealer.get(r.dealer_id) ?? []), r]);
  return [...byDealer].map(([dealer_id, rows]) => {
    const loans = rows.map((r) => ({ loan_id: r.loan_id, balance: r.balance, basis: r.reason ?? "flagged by the run", request_ids: r.request_ids, event_seqs: r.event_seqs }));
    const total_balance = Math.round(loans.reduce((s, l) => s + l.balance, 0) * 100) / 100;
    const dealer_name = rows[0].dealer_name;
    const text = [
      DRAFT_LINE,
      "",
      `To: ${dealer_name} (dealer ${dealer_id})`,
      `Re: Request to repurchase ${loans.length} loan${loans.length === 1 ? "" : "s"}, outstanding balance ${money(total_balance)}`,
      "",
      "Our diligence on the portfolio flagged the loans below. They are findings for review, not conclusions about any borrower.",
      "Please repurchase them under the terms of the purchase agreement, or send a written explanation for each.",
      "",
      ...loans.flatMap((l) => [
        `- ${l.loan_id}, balance ${money(l.balance)}`,
        `  Basis: ${l.basis}`,
        `  Evidence: audit log events ${events(l.event_seqs)}${l.request_ids.length ? `; CRS RequestID ${l.request_ids.join(", ")}` : ""}`,
      ]),
      "",
      `Run ${report.run_id}. Every figure above is traceable to the audit log events cited.`,
    ].join("\n");
    return { dealer_id, dealer_name, loans, total_balance, text };
  }).sort((x, y) => y.total_balance - x.total_balance);
}

const BASE_DOCUMENTS = ["Signed credit application", "Two most recent pay stubs, with employer verification", "Proof of residence", "Copy of the government-issued photo ID collected at funding"];
const EXTRA: Partial<Record<LoanRow["reason_kind"], string>> = {
  fraud_alert: "How the fraud alert on the borrower's file was handled at funding",
  soft_link: "An explanation of any relationship between this borrower and the loans linked to it",
  open_question: "Anything the dealer holds that bears on the open question",
};

export function documentRequests(report: DealReport): DocumentRequest[] {
  return report.loans.filter((l) => l.verdict === "Review").map((r) => {
    const reason = r.reason ?? "needs a person's review";
    const documents = [...BASE_DOCUMENTS, ...(EXTRA[r.reason_kind] ? [EXTRA[r.reason_kind]!] : [])];
    const text = [
      DRAFT_LINE,
      "",
      `To: ${r.dealer_name} (dealer ${r.dealer_id})`,
      `Re: Documents needed for loan ${r.loan_id}, balance ${money(r.balance)}`,
      "",
      `We are completing diligence on the portfolio and one point on this loan is open: ${reason}.`,
      "Until it is resolved the loan stays out of our bid. Please send:",
      ...documents.map((d) => `- ${d}`),
      "",
      `Evidence: audit log events ${events(r.event_seqs)} in run ${report.run_id}.`,
    ].join("\n");
    return { loan_id: r.loan_id, dealer_id: r.dealer_id, dealer_name: r.dealer_name, balance: r.balance, reason, documents, event_seqs: r.event_seqs, text };
  });
}
