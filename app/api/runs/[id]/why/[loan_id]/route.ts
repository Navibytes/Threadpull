// GET /api/runs/{id}/why/{loan_id}: why a loan has its verdict (SKELETON section 10), answered from the run's own events only,
// each step with its event number. 404 when the run has no event for the loan. No model is involved.
import { whyFor } from "@/lib/deal/service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; loan_id: string }> }) {
  const { id, loan_id } = await params;
  try {
    const out = await whyFor(id, loan_id);
    return out.ok ? Response.json(out.why) : Response.json({ error: out.error }, { status: out.status });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "could not answer" }, { status: 500 });
  }
}
