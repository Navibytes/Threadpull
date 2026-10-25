// crs_credit_report (ticket 06): the three bureau reports for one case loan, merged into the facts behind "thick file, thin life".
// A frozen bureau (partial) or bureaus that disagree (divergent) are reported as such; code elsewhere maps them to a status.
import { toolError, toolOk, type SourceRef, type ToolResult } from "@/lib/contracts/tool-result";
import type { Ledger } from "@/lib/ledger";
import { CrsError, defaultCrsClient, type CrsClient, type CrsEndpoint } from "./client";
import { BUREAUS, bureauView, CreditResponseSchema, mergeBureaus, type Bureau, type CreditSummary } from "./credit-features";
import { bodyForLoan, GuardRefused } from "./persona-guard";

const TOOL = "crs_credit_report";
const ENDPOINT: Record<Bureau, CrsEndpoint> = { transunion: "credit_tu", equifax: "credit_efx", experian: "credit_exp" };

export type CreditReport = CreditSummary & { loan_id: string; status_hint: "Insufficient evidence" | null };
type LoanRef = Parameters<typeof bodyForLoan>[1] & { applicant_info: { date_of_birth?: string } };

/**
 * crs_credit_report: three bureau pulls under one 6-acorn charge. A loan with no sandbox persona is refused before any request.
 * One bureau failing does not hide the other two: it shows up as an `error` bureau and the report is partial.
 */
export function crsCreditReport(
  loan: LoanRef, // a Loan fits: the SSN picks the persona, the date of birth only gives the borrower's age
  ledger: Ledger,
  client: CrsClient = defaultCrsClient(),
  now = Date.now(),
): Promise<ToolResult<CreditReport | null>> {
  return ledger.run(TOOL, async (): Promise<ToolResult<CreditReport | null>> => {
    let body: ReturnType<typeof bodyForLoan>;
    try {
      body = bodyForLoan("credit_report", loan);
    } catch (e) {
      if (e instanceof GuardRefused) return toolError(TOOL, `refused, nothing sent: ${e.message}`);
      throw e;
    }
    const pulls = await Promise.all(
      BUREAUS.map(async (bureau) => {
        try {
          return { bureau, ...(await client.call(ENDPOINT[bureau], body, CreditResponseSchema)) };
        } catch (e) {
          if (e instanceof CrsError) return { bureau, error: e.message };
          throw e;
        }
      }),
    );
    if (pulls.every((p) => "error" in p)) return toolError(TOOL, pulls.map((p) => ("error" in p ? p.error : "")).join("; "));

    // Inquiries are counted back from the day the report was pulled, so a cached pull gives the same answer on a later day.
    const pulledAt = pulls
      .flatMap((p) => ("body" in p ? [Date.parse(p.body.responseDetail?.dateRequested ?? p.body.responseDetail?.dateOrdered ?? "")] : []))
      .find((t) => !Number.isNaN(t));
    const asOf = pulledAt ?? now;
    const views = pulls.map((p) =>
      "body" in p ? bureauView(p.bureau, p.body, asOf) : { ...bureauView(p.bureau, CreditResponseSchema.parse({}), asOf), errors: [p.error] },
    );
    const summary = mergeBureaus(views, { asOf, dateOfBirth: loan.applicant_info.date_of_birth });
    const report: CreditReport = { loan_id: loan.loan_id, ...summary, status_hint: summary.partial || summary.divergent ? "Insufficient evidence" : null };
    const sources = pulls.flatMap((p): SourceRef[] => ("request_id" in p ? [{ kind: "crs", product: ENDPOINT[p.bureau], request_id: p.request_id }] : []));
    return toolOk(TOOL, report, sources);
  });
}
