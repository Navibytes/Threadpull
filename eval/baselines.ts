// The two baselines Hazel is measured against (ticket 13, TEAM_BRIEF "Baselines"). Both use the same data room, the same
// CRS tools and the same acorn prices as Hazel, through the same ledger; neither uses a model or the answer key.
//
// - Check everything: every CRS product on every loan, no budget. A loan without a sandbox file is refused for free, so
//   in practice it is every case loan. Statuses come from the CRS answers alone, by the same signal rules Hazel's code
//   uses (hard identity codes, fraud alert, deceased file; frozen or disagreeing bureaus are Insufficient evidence).
// - Fixed rules: the classic rules engine, at Hazel's budget. Flag every loan that shares a phone, email, bank account,
//   device, IP address or street address with another loan (no rarity, no innocent explanations), then spend the budget
//   on identity checks, flagged loans first, and flag any hard identity code.
import type { Loan, LoanStatus } from "@/lib/contracts/loan";
import { FRAUD_ALERT, HARD_CODES } from "@/lib/agent";
import { crsCreditReport, crsFraudFinder, crsIdentityCheck, crsReversePhone, type CrsClient } from "@/lib/crs";
import { buildGraph } from "@/lib/graph";
import { DEFAULT_BUDGET, Ledger } from "@/lib/ledger";

export type AgentResult = {
  agent: string;
  statuses: Map<string, LoanStatus>; // loans the agent gave a status; any other loan stays Not reviewed
  acorns: number;
  crs_calls: number; // charged CRS calls (a refused call costs nothing and isn't counted)
  simulated_calls: number; // charged calls answered by a simulated stand-in (CRS unreachable)
  questions: number;
  runtime_ms: number;
};

/** Identifiers a rules engine flags when two loans share them (the graph's kinds, minus employer, dealer, documents). */
export const RULE_KINDS = ["phone", "email", "bank_account", "device", "ip_address", "address"] as const;

const isHard = (codes: string[]) => codes.some((c) => HARD_CODES.has(c) || c === FRAUD_ALERT);

export async function checkEverything(loans: readonly Loan[], crs: CrsClient, now = Date.now()): Promise<AgentResult> {
  const started = performance.now();
  const ledger = new Ledger(Number.POSITIVE_INFINITY);
  let calls = 0, simulated = 0;
  const count = (r: { ok: boolean; cost: { acorns: number }; simulated: boolean }) => {
    if (r.ok && r.cost.acorns > 0) { calls++; if (r.simulated) simulated++; }
  };
  const statuses = new Map<string, LoanStatus>();
  for (const loan of loans) {
    const identity = await crsIdentityCheck(loan, ledger, crs); count(identity);
    const credit = await crsCreditReport(loan, ledger, crs, now); count(credit);
    const fraud = await crsFraudFinder(loan, ledger, crs, now); count(fraud);
    const phone = await crsReversePhone(loan.applicant_info.phone, ledger, crs); count(phone);
    if (![identity, credit, fraud, phone].some((r) => r.ok)) continue; // no sandbox file: nothing was checked
    const codes = identity.ok && identity.result ? identity.result.messages.map((m) => m.code) : [];
    const report = credit.ok ? credit.result : null;
    statuses.set(loan.loan_id, isHard(codes) || report?.deceased ? "Investigate"
      : report?.status_hint ?? "No material anomaly found");
  }
  return { agent: "Check everything", statuses, acorns: ledger.spent, crs_calls: calls, simulated_calls: simulated, questions: 0,
    runtime_ms: Math.round(performance.now() - started) };
}

export async function fixedRules(loans: readonly Loan[], crs: CrsClient, budget = DEFAULT_BUDGET): Promise<AgentResult> {
  const started = performance.now();
  const graph = buildGraph(loans);
  const shared = new Map<string, number>(); // loan -> identifiers it shares
  for (const id of graph.loanIds)
    for (const e of graph.entitiesOf(id))
      if ((RULE_KINDS as readonly string[]).includes(graph.kind(e)) && graph.sharedBy(e) >= 2) shared.set(id, (shared.get(id) ?? 0) + 1);

  const statuses = new Map<string, LoanStatus>(loans.map((l) => [l.loan_id, shared.has(l.loan_id) ? "Investigate" : "No material anomaly found"]));
  const ledger = new Ledger(budget);
  let calls = 0, simulated = 0;
  const order = [...loans].sort((a, b) => (shared.get(b.loan_id) ?? 0) - (shared.get(a.loan_id) ?? 0) || a.loan_id.localeCompare(b.loan_id));
  for (const loan of order) {
    if (ledger.remaining < 3) break; // an identity check costs 3; refused ones are free, so keep going while one fits
    const r = await crsIdentityCheck(loan, ledger, crs);
    if (!r.ok) continue;
    calls++; if (r.simulated) simulated++;
    if (r.result && isHard(r.result.messages.map((m) => m.code))) statuses.set(loan.loan_id, "Investigate");
  }
  return { agent: "Fixed rules", statuses, acorns: ledger.spent, crs_calls: calls, simulated_calls: simulated, questions: 0,
    runtime_ms: Math.round(performance.now() - started) };
}
