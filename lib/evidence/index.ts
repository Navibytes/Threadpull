// Evidence checks (ticket 07, 08). Import from "@/lib/evidence", not from the files inside.
export {
  compareDocuments, fingerprint, parsePayStub, payStubIssues, periodsElapsed, templateUsage,
  RARE_TEMPLATE_MAX_USES, RECYCLED_THRESHOLD,
  type DocumentComparison, type PayStub, type StubIssue,
} from "./documents";
export {
  DOCUMENT_FIELDS, safeDocumentView, scanDocument, WITHHELD,
  type InjectionMatch, type InjectionScan, type SafeDocumentView,
} from "./injection";
