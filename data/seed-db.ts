// Load normalized loans into the Supabase `loans` table (PostgREST upsert, service-role key, server-only).
// Skips with a message when SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are not set.
import type { Loan } from "@/lib/contracts/loan";

export async function seedSupabase(seed: number, loans: Loan[]) {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.log("Supabase not configured (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY): skipped the database load.");
    return;
  }
  const rows = loans.map((l) => ({ seed, loan_id: l.loan_id, kind: l.kind, dealer_id: l.submission.dealer_id,
    status: l.status, record: l }));
  for (let i = 0; i < rows.length; i += 250) {
    const res = await fetch(`${url}/rest/v1/loans?on_conflict=seed,loan_id`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(rows.slice(i, i + 250)),
    });
    if (!res.ok) throw new Error(`Supabase upsert failed: ${res.status} ${await res.text()}`);
  }
  console.log(`Supabase: upserted ${rows.length} loans for seed ${seed}.`);
}
