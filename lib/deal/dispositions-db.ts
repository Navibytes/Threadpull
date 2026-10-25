// The Supabase copy of a decision (ticket 10, migration 20261025000000_dispositions.sql). The run's event log is the record
// of truth and is written first; this copy is best effort and its failure is reported, never swallowed and never fatal.
import type { Event } from "@/lib/contracts/event";
import { serverClient } from "@/lib/db/server";
import { confirmedByLoan } from "./dispositions";

export type DispositionRow = {
  run_id: string; loan_id: string; decision: "approve" | "override"; proposed_verdict: string; final_verdict: string;
  reason: string | null; decided_by: string; event_seq: number;
};
/** The slice of a Supabase client this needs, so tests can pass a fake. */
export type DispositionsTable = {
  from(table: "dispositions"): {
    upsert(rows: DispositionRow[], options: { onConflict: string; ignoreDuplicates: boolean }): PromiseLike<{ error: { message: string } | null }>;
  };
};

/** What happened to the Supabase copy: saved, not configured (skipped), or failed with the reason. */
export type Mirror = { status: "saved" } | { status: "skipped"; why: string } | { status: "failed"; error: string };

/**
 * The hosted client, or null when Supabase is not configured. Under `bun test` it is always null: tests load the developer's
 * real keys, so they must pass a fake explicitly and can never write to the hosted project by accident.
 */
export function defaultDispositionsDb(): DispositionsTable | null {
  if (process.env.NODE_ENV === "test") return null;
  return serverClient() as unknown as DispositionsTable | null;
}

/** One row per loan the disposition_recorded event covers. */
export function dispositionRows(event: Event): DispositionRow[] {
  const decided = confirmedByLoan([event]);
  return event.loan_ids.flatMap((loan_id) => {
    const d = decided.get(loan_id);
    return d ? [{ run_id: event.run_id, loan_id, decision: d.decision, proposed_verdict: d.proposed_verdict, final_verdict: d.final_verdict,
      reason: d.reason, decided_by: d.decided_by, event_seq: event.seq }] : [];
  });
}

export async function mirrorDisposition(event: Event, db: DispositionsTable | null): Promise<Mirror> {
  if (!db) return { status: "skipped", why: "Supabase is not configured here" };
  const rows = dispositionRows(event);
  if (!rows.length) return { status: "failed", error: "the event row carried no decision to copy" };
  try {
    const { error } = await db.from("dispositions").upsert(rows, { onConflict: "run_id,event_seq,loan_id", ignoreDuplicates: true });
    return error ? { status: "failed", error: error.message } : { status: "saved" };
  } catch (e) {
    return { status: "failed", error: e instanceof Error ? e.message : String(e) };
  }
}
