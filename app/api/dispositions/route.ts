// POST /api/dispositions: the CRO approves a proposed verdict or overrides it (an override needs a reason).
// Appends a disposition_recorded row to the run's event log; the loan then reads Human-confirmed disposition.
import { recordDisposition } from "@/lib/deal/service";

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  try {
    const out = await recordDisposition(body);
    return out.ok ? Response.json({ ok: true, event: out.event }, { status: 201 }) : Response.json({ error: out.error }, { status: out.status });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "could not record the decision" }, { status: 500 });
  }
}
