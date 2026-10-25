// GET /api/runs/{id}/memo: the memo last written for the run, with `stale` once the run's log has moved on (404 if none yet).
// POST /api/runs/{id}/memo?lgd=0.55&margin=0.04: Claude writes a new memo from the report under those assumptions (needs
// ANTHROPIC_API_KEY); sentences without a checkable event reference are dropped and listed. Saved beside the run's events.
import { AssumptionsInputSchema } from "@/lib/deal";
import { makeMemo, readMemo } from "@/lib/deal/service";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const stored = readMemo(id);
  return stored ? Response.json(stored) : Response.json({ error: `no memo for run ${id} yet` }, { status: 404 });
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = new URL(req.url).searchParams;
  const num = (k: string) => (q.has(k) ? Number(q.get(k)) : undefined);
  const inputs = AssumptionsInputSchema.partial().safeParse({ lgd: num("lgd"), margin: num("margin") });
  if (!inputs.success) return Response.json({ error: "lgd and margin must be numbers between 0 and 1" }, { status: 400 });
  const out = await makeMemo(id, inputs.data);
  return out.ok ? Response.json({ memo: out.memo, stale: out.stale }) : Response.json({ error: out.error }, { status: out.status });
}
