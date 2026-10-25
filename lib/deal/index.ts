// lib/deal public API (ticket 10): pricing, verdicts, the CRO report, the drafted outputs and dispositions. Plain code, no model.
export { AssumptionsInputSchema, cents, DEFAULT_ASSUMPTIONS, pdFor, priceLoan, topTierMin, withInputs, type Assumptions, type Tier } from "./pricing";
export { FLAGGED_STATUSES, outOfBid, reasonKind, VERDICTS, VerdictSchema, verdictFor, type ReasonKind, type Verdict } from "./verdicts";
export { buildReport, CHECK_EVERYTHING_TOOLS, type DealerConcentration, type DealReport, type LoanRow, type Ring } from "./report";
export { buybackDemands, documentRequests, type BuybackDemand, type DocumentRequest } from "./drafts";
export { confirmedByLoan, DispositionInputSchema, dispositionRow, type Confirmed, type DispositionInput, type Proposal } from "./dispositions";
