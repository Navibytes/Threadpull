// Loan-tape intake (upload, Phase 1). A seller's tape, as JSON (the RawLoan array, with documents) or CSV
// (TAPE_COLUMNS, no documents), becomes normalized loans, a reference stand-in and an intake report.
//
// - Halt one loan, never the batch (CLAUDE.md rule 8): a bad row is rejected with its reasons, the rest go on.
// - Synthetic and sandbox data only (CLAUDE.md, Responsible design): a row whose SSN could belong to a real person
//   is refused. Only area numbers that are never issued pass: 000, 666 (the CRS sandbox personas) and 900–999 (the
//   generator's background borrowers).
// - Reasons never quote a value from the tape, so a report can be shown or logged without repeating anyone's data.
// - Uploaded tapes have no public-data lookups. The reference holds only what the tape's own street text says
//   (a unit or suite number), marked simulated; everything else is unknown, and the checks say so.
import { createHash } from "node:crypto";
import { z } from "zod";
import personas from "@/data/personas.json";
import { RawLoanSchema, type Loan, type RawLoan } from "@/lib/contracts/loan";
import { scanDocument } from "@/lib/evidence";
import { parseCsv, rowToRawLoan, TAPE_COLUMNS } from "./csv";
import { normalizeLoan, normalizePortfolio } from "./normalize";
import type { Reference } from "./reference";

export const MAX_TAPE_LOANS = 5000;
export const TAPE_ID = /^t-[0-9a-f]{12}$/;

/** A problem with the whole tape (nothing could be read). Row problems are rejections in the report instead. */
export class IntakeError extends Error {}

export type Rejected = { row: number; loan_id: string | null; reasons: string[] };

export type IntakeReport = {
  tape_id: string; // derived from the accepted loans: the same tape always gets the same id
  format: "json" | "csv";
  row_label: "CSV line" | "array position"; // what `row` in a rejection counts
  received: number;
  accepted: number;
  rejected: Rejected[];
  dealers: number;
  submitted: { first: string; last: string } | null; // earliest and latest submission timestamps
  sandbox_identities: number; // loans whose SSN is a CRS sandbox persona: the only ones a CRS check can run on
  documents: number;
  flagged_documents: string[]; // doc ids carrying instruction-like text (logged as attack_detected in a run)
  unknown_columns: string[]; // CSV headers that aren't tape columns (ignored)
  missing_columns: string[]; // tape columns the CSV doesn't have
  notes: string[];
};

export type Intake = { loans: Loan[]; reference: Reference; report: IntakeReport };

type Item = { row: number; value: unknown };

const SANDBOX_SSNS = new Set(personas.personas.map((p) => p.ssn));
const digits = (s: string) => s.replace(/\D/g, "");

/** True for SSNs that are never issued to a person (area 000, 666 or 900–999). */
export function isSyntheticSsn(ssn: string): boolean {
  const d = digits(ssn);
  if (d.length !== 9) return false;
  const area = Number(d.slice(0, 3));
  return area === 0 || area === 666 || area >= 900;
}

export function intakeTape(text: string): Intake {
  const trimmed = text.trim();
  if (!trimmed) throw new IntakeError("the file is empty");
  const format = trimmed[0] === "[" || trimmed[0] === "{" ? "json" : "csv";
  const parsed = format === "json" ? readJson(trimmed) : readCsv(trimmed);
  if (parsed.items.length > MAX_TAPE_LOANS) throw new IntakeError(`the tape has ${parsed.items.length} loans; the limit is ${MAX_TAPE_LOANS}`);

  const rejected: Rejected[] = [];
  const accepted: RawLoan[] = [];
  const firstRow = new Map<string, number>();
  for (const { row, value } of parsed.items) {
    const loanId = idOf(value);
    const reasons = checkRow(value);
    if (!reasons.length && loanId && firstRow.has(loanId)) reasons.push(`loan_id: already used at ${parsed.rowLabel} ${firstRow.get(loanId)}`);
    if (reasons.length) { rejected.push({ row, loan_id: loanId, reasons }); continue; }
    firstRow.set(loanId!, row);
    accepted.push(RawLoanSchema.parse(withDefaults(value)));
  }

  const loans = normalizePortfolio(accepted);
  const reference = referenceFromTape(loans);
  const times = loans.map((l) => l.submission.submitted_at).sort();
  const documents = loans.flatMap((l) => l.documents);
  const flagged = documents.filter((d) => scanDocument(d).attack_detected).map((d) => d.doc_id);
  const notes = [
    "Address and employer lookups are not available for uploaded tapes: check_address knows only what the street text says (a unit or suite number), and check_employer has no headcounts.",
  ];
  if (format === "csv") notes.push("A CSV tape carries no documents, so compare_documents and the injection guard have nothing to read. Upload JSON to include pay stubs.");
  const sandbox = loans.filter((l) => SANDBOX_SSNS.has(l.applicant_info.ssn)).length;
  if (sandbox < loans.length) notes.push(`${loans.length - sandbox} of ${loans.length} loans have no CRS sandbox identity: a CRS check on them is refused, costs nothing and is logged.`);

  const report: IntakeReport = {
    tape_id: tapeId(loans),
    format,
    row_label: parsed.rowLabel,
    received: parsed.items.length,
    accepted: loans.length,
    rejected,
    dealers: new Set(loans.map((l) => l.submission.dealer_id)).size,
    submitted: times.length ? { first: times[0], last: times.at(-1)! } : null,
    sandbox_identities: sandbox,
    documents: documents.length,
    flagged_documents: flagged,
    unknown_columns: parsed.unknown,
    missing_columns: parsed.missing,
    notes,
  };
  return { loans, reference, report };
}

// ---------------------------------------------------------------- reading the file

function readJson(text: string): { items: Item[]; rowLabel: "array position"; unknown: string[]; missing: string[] } {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new IntakeError("the file starts like JSON but isn't valid JSON"); }
  const list = Array.isArray(data) ? data : (data as { loans?: unknown })?.loans;
  if (!Array.isArray(list)) throw new IntakeError("a JSON tape must be an array of loans, or an object with a \"loans\" array");
  if (!list.length) throw new IntakeError("the tape has no loans");
  return { items: list.map((value, i) => ({ row: i + 1, value })), rowLabel: "array position", unknown: [], missing: [] };
}

function readCsv(text: string): { items: Item[]; rowLabel: "CSV line"; unknown: string[]; missing: string[] } {
  let rows: string[][];
  try { rows = parseCsv(text); } catch (e) { throw new IntakeError((e as Error).message); }
  const [header = [], ...body] = rows;
  const cols = header.map((h) => h.trim());
  const known = new Set<string>(TAPE_COLUMNS);
  if (!cols.some((c) => known.has(c))) throw new IntakeError("none of the tape's columns were found; start from the template");
  if (!body.length) throw new IntakeError("the tape has no loans");
  const have = new Set(cols);
  // kind, persona_id and the co-applicant are optional in an upload (they default to background / none)
  const optional = new Set(["kind", "persona_id", "co_applicant_info.first_name", "co_applicant_info.last_name", "co_applicant_info.relationship"]);
  return {
    // CSV line numbers count the header as line 1 (what a spreadsheet shows); quoted line breaks aside
    items: body.map((cells, i) => ({ row: i + 2, value: rowToRawLoan(cols, cells) })),
    rowLabel: "CSV line",
    unknown: cols.filter((c) => c && !known.has(c)),
    missing: TAPE_COLUMNS.filter((c) => !have.has(c) && !optional.has(c)),
  };
}

// ---------------------------------------------------------------- one row

/** kind and persona_id are the generator's own fields; a seller's tape won't have them. */
function withDefaults(value: unknown): unknown {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const v = value as Record<string, unknown>;
  return { ...v, kind: v.kind || "background", persona_id: v.persona_id ?? null, documents: v.documents ?? [] };
}

function idOf(value: unknown): string | null {
  const id = (value as { loan_id?: unknown } | null)?.loan_id;
  return typeof id === "string" && id.trim() ? id.trim() : null;
}

/** Reasons a row can't be accepted, empty when it can. Never includes a value from the row. */
function checkRow(value: unknown): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return ["not a loan record"];
  const ssn = (value as { applicant_info?: { ssn?: unknown } }).applicant_info?.ssn;
  if (typeof ssn === "string" && ssn.trim() && !isSyntheticSsn(ssn)) {
    // checked first, and on its own: a possibly real SSN stops the row before anything else reads it
    return ["applicant_info.ssn: not a synthetic or sandbox SSN. Threadpull accepts only never-issued area numbers (000, 666, 900–999)"];
  }
  const parsed = RawLoanSchema.safeParse(withDefaults(value));
  if (!parsed.success) return parsed.error.issues.map(issueReason);
  try {
    normalizeLoan(parsed.data);
  } catch (e) {
    return [normalizeReason(e)];
  }
  return [];
}

const issueReason = (i: z.core.$ZodIssue) => `${i.path.length ? i.path.join(".") : "loan"}: ${i.message}`;

// normalizeLoan's own errors quote the bad value ("unrecognized date …"); keep only what kind of value it was
function normalizeReason(e: unknown): string {
  if (e instanceof z.ZodError) return e.issues.map(issueReason).join("; ");
  const m = String((e as Error)?.message ?? e).match(/^unrecognized (date|timestamp)/);
  return m ? `${m[1] === "date" ? "a date (date_of_birth or first_payment_date)" : "submission.submitted_at"}: unrecognized ${m[1]} format`
    : "the record could not be normalized";
}

// ---------------------------------------------------------------- what the tape itself tells us

const UNIT = /\s(APT|UNIT|FL|#)\s*\S+$/;
const SUITE = /\sSTE\s*\S+$/;

/** Address types read off the street text only; units and employer headcounts stay unknown. Always simulated. */
export function referenceFromTape(loans: readonly Loan[]): Reference {
  const addresses: Reference["addresses"] = {};
  for (const l of loans) {
    const street = ` ${l.residential_info.street_address}`;
    const type = SUITE.test(street) ? "commercial" : UNIT.test(street) ? "multi_unit" : null;
    if (type && !addresses[l.derived.address_key]) addresses[l.derived.address_key] = { address_type: type, units: null };
  }
  return {
    simulated: true,
    note: "Uploaded tape: address types are read from the street text (unit or suite numbers); unit counts and employer headcounts are unknown.",
    employers: {},
    addresses,
  };
}

/** Same accepted loans, same id: a re-upload never makes a second copy. */
function tapeId(loans: readonly Loan[]): string {
  return `t-${createHash("sha256").update(JSON.stringify(loans)).digest("hex").slice(0, 12)}`;
}

