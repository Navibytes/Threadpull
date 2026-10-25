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

/**
 * The number an uploaded tape's loans are kept under in the Supabase `loans` table (keyed by seed and loan id): negative,
 * so it never meets a generated seed, and derived from the tape id, so the same tape always lands in the same place.
 */
export const tapePortfolioSeed = (tapeId: string) => -(parseInt(tapeId.slice(2, 9), 16) + 1);

/** The slice of a Supabase client the tape store needs. */
export type LoansTable = {
  from(table: "loans"): {
    upsert(rows: object[], options: { onConflict: string }): PromiseLike<{ error: { message: string } | null }>;
    select(columns: string): { eq(col: string, v: number): { order(col: string): { range(a: number, b: number): PromiseLike<{ data: { record: unknown }[] | null; error: { message: string } | null }> } } };
  };
};

/** Keep a tape's accepted loans in Supabase, so any server of a deployment can read them. */
export async function storeTapeLoans(db: LoansTable, tapeId: string, loans: readonly Loan[]): Promise<string | null> {
  const seed = tapePortfolioSeed(tapeId);
  for (let i = 0; i < loans.length; i += 500) {
    const rows = loans.slice(i, i + 500).map((l) => ({ seed, loan_id: l.loan_id, kind: l.kind, dealer_id: l.submission.dealer_id, record: l }));
    const { error } = await db.from("loans").upsert(rows, { onConflict: "seed,loan_id" });
    if (error) return error.message;
  }
  return null;
}

/** A tape's loans from Supabase (pages of 1,000, the API's row cap), or null when none are there. */
export async function fetchTapeLoans(db: LoansTable, tapeId: string): Promise<Loan[] | null> {
  const seed = tapePortfolioSeed(tapeId), out: Loan[] = [];
  for (let from = 0; from < 10_000; from += 1000) {
    const { data, error } = await db.from("loans").select("record").eq("seed", seed).order("loan_id").range(from, from + 999);
    if (error || !data) return out.length ? out : null;
    out.push(...data.map((r) => LoanSchema.parse(r.record)));
    if (data.length < 1000) break;
  }
  return out.length ? out : null;
}
