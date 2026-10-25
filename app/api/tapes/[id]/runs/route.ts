// POST /api/tapes/{id}/runs: investigate an uploaded tape (lib/runs/tape-run.ts). Starts Hazel on its accepted loans and
// answers at once with the run id; the board follows the run live at /board?run={run_id}, the CRO screen at /cro?run={run_id}.
// The body may carry the tape itself (the same file as the upload): a serverless host has no shared disk, so the instance
// that answers this may not have the upload. The run keeps the function alive until it ends (after(), up to maxDuration).
// On the public demo a live run needs the passcode (x-threadpull-passcode).
// 201 started · 400 not a tape id / the body is another tape · 401 passcode needed · 404 no such tape · 409 a run is in
// progress · 503 keys missing.
// GET /api/tapes/{id}/runs?run={run_id}: whether that run is still going.
import { after } from "next/server";
import { demoRefusal, PASSCODE_HEADER, passcodeOk, publicDemo } from "@/lib/demo";
import { IntakeError, intakeTape } from "@/lib/ingest/intake";
import { startTapeRun, tapeRun } from "@/lib/runs/tape-run";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (publicDemo()) {
    if (!process.env.INVESTIGATE_PASSCODE) return demoRefusal();
    if (!passcodeOk(req.headers.get(PASSCODE_HEADER)))
      return Response.json({ error: "A live investigation spends Claude tokens and CRS calls, so it needs the team's passcode.", passcode_required: true }, { status: 401 });
  }
  const text = Number(req.headers.get("content-length") ?? 0) > MAX_BYTES ? "" : await req.text().catch(() => "");
  let tape;
  if (text.trim()) {
    try {
      const intake = intakeTape(text);
      if (intake.report.tape_id !== id) return Response.json({ error: "the tape sent is not the one uploaded" }, { status: 400 });
      tape = { loans: intake.loans, reference: intake.reference };
    } catch (e) {
      if (e instanceof IntakeError) return Response.json({ error: e.message }, { status: 400 });
      throw e;
    }
  }
  const out = startTapeRun(id, { tape });
  if (!out.ok) return Response.json({ error: out.error }, { status: out.status });
  after(() => out.done); // serverless: keep running after the answer, until the run ends
  return Response.json(out.run, { status: 201 });
}

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = tapeRun(new URL(req.url).searchParams.get("run") ?? "");
  return run && run.tape_id === id ? Response.json(run) : Response.json({ error: "no such run on this server" }, { status: 404 });
}
