// Evidence checks (ticket 07, 08). Import from "@/lib/evidence", not from the files inside.
export {
  compareDocuments, fingerprint, parsePayStub, payStubIssues, periodsElapsed, templateUsage,
  RARE_TEMPLATE_MAX_USES, RECYCLED_THRESHOLD,
  type DocumentComparison, type PayStub, type StubIssue,
} from "./documents";
export {
  attackEvent, DOCUMENT_FIELDS, safeDocumentView, scanDocument, WITHHELD,
  type AttackEventResult, type InjectionMatch, type InjectionScan, type SafeDocumentView, type ScanSummary,
} from "./injection";
export {
  BURST_MIN_LOANS, BURST_MIN_RATIO, BURST_WINDOW_DAYS, checkAddress, checkEmployer, checkHousehold, dealerTimeline,
  LARGE_EMPLOYER_MIN_HEADCOUNT, MONTH_END_DAYS,
  type AddressCheck, type Burst, type DealerTimeline, type EmployerCheck, type HouseholdCheck,
} from "./explanations";
export {
  withdrawAddress, withdrawBursts, withdrawHousehold,
  type CheckEventRef, type ClueExplained, type ClueExplainedResult,
} from "./withdraw";
