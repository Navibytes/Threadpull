// Where an accepted tape is kept until a run uses it: data/out/uploads/<tape_id>/ (gitignored, like every
// generated output). The layout matches a generated seed's, so loadReference(dir) and the loan readers work on it.
// A Supabase `tapes` table can replace this later without changing callers.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { LoanSchema, type Loan } from "@/lib/contracts/loan";
import { TAPE_ID, type Intake, type IntakeReport } from "./intake";
import { loadReference, type Reference } from "./reference";

/** The folder for a tape id. Throws on anything that isn't an id, so a request can never point outside uploads. */
export function tapeDir(root: string, tapeId: string): string {
  if (!TAPE_ID.test(tapeId)) throw new Error("not a tape id");
  return join(root, tapeId);
}

/** Saves the accepted loans, the reference stand-in and the report. Saving the same tape again overwrites it. */
export function saveTape(root: string, { loans, reference, report }: Intake): string {
  const dir = tapeDir(root, report.tape_id);
  mkdirSync(join(dir, "reference"), { recursive: true });
  writeFileSync(join(dir, "loans.normalized.json"), JSON.stringify(loans, null, 1) + "\n");
  writeFileSync(join(dir, "reference", "public_lookups.json"), JSON.stringify(reference, null, 1) + "\n");
  writeFileSync(join(dir, "report.json"), JSON.stringify(report, null, 1) + "\n");
  return dir;
}

export function loadTape(root: string, tapeId: string): { loans: Loan[]; reference: Reference; report: IntakeReport } {
  const dir = tapeDir(root, tapeId);
  return {
    loans: LoanSchema.array().parse(JSON.parse(readFileSync(join(dir, "loans.normalized.json"), "utf8"))),
    reference: loadReference(dir),
    report: JSON.parse(readFileSync(join(dir, "report.json"), "utf8")) as IntakeReport,
  };
}
