// GET /api/runs/{id}/report?lgd=0.55&margin=0.04: CRO screen data (SKELETON section 10): balances, concentration, spend, a verdict
// per investigated loan, and the drafted buyback demands and document requests. lgd and margin are the analyst's assumptions.
import { AssumptionsInputSchema } from "@/lib/deal";
import { loadReport } from "@/lib/deal/service";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  const num = (k: string) => (q.has(k) ? Number(q.get(k)) : undefined);
  const inputs = AssumptionsInputSchema.partial().safeParse({ lgd: num("lgd"), margin: num("margin") });
  if (!inputs.success) return Response.json({ error: "lgd and margin must be numbers between 0 and 1" }, { status: 400 });
  try {
    const bundle = await loadReport(id, inputs.data);
    return bundle ? Response.json(bundle) : Response.json({ error: `no run ${id}` }, { status: 404 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "could not build the report" }, { status: 500 });
  }
}
