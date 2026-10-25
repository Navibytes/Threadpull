// GET /api/runs/{id}/questions: the questions this run asked (open and answered) and the rules in force (ticket 11).
// POST /api/runs/{id}/questions: a person's answer {question_id, decision, text, answered_by, min_group_size?}. A yes saves
// a rule version; either way a question_answered row is appended to the run's log and copied to Supabase (`mirror`).
import { questionsFor, recordAnswer } from "@/lib/deal/questions";

export const dynamic = "force-dynamic";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const out = await questionsFor(id);
    return out ? Response.json(out) : Response.json({ error: `no run ${id}` }, { status: 404 });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "could not read the questions" }, { status: 500 });
  }
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "send a JSON object" }, { status: 400 });
  try {
    const out = await recordAnswer({ ...body, run_id: id });
    return out.ok ? Response.json({ ok: true, event: out.event, rule: out.rule, mirror: out.mirror }, { status: 201 })
      : Response.json({ error: out.error }, { status: out.status });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : "could not record the answer" }, { status: 500 });
  }
}
