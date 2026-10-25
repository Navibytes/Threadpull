// POST /api/tapes/{id}/runs: investigate an uploaded tape (lib/runs/tape-run.ts). Starts Hazel on its accepted loans and
// answers at once with the run id; the board follows the run live at /?run={run_id}, the CRO screen at /cro?run={run_id}.
// 201 started · 400 not a tape id · 404 no such tape · 409 a run is in progress · 503 keys missing.
// GET /api/tapes/{id}/runs?run={run_id}: whether that run is still going.
import { startTapeRun, tapeRun } from "@/lib/runs/tape-run";
import { demoRefusal, publicDemo } from "@/lib/demo";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (publicDemo()) return demoRefusal();
  const { id } = await params;
  const out = startTapeRun(id);
  return out.ok ? Response.json(out.run, { status: 201 }) : Response.json({ error: out.error }, { status: out.status });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = tapeRun(new URL(req.url).searchParams.get("run") ?? "");
  return run && run.tape_id === id ? Response.json(run) : Response.json({ error: "no such run on this server" }, { status: 404 });
}
