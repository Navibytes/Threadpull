// POST /api/tapes: upload a loan tape (JSON or CSV), as a multipart field "tape" or as the raw request body.
// Returns the intake report; accepted loans are kept under data/out/uploads/<tape_id>/ for a run to use.
// 201 saved · 400 unreadable tape · 413 too large · 422 no loan could be accepted (nothing saved).
import { join } from "node:path";
import { IntakeError, intakeTape } from "@/lib/ingest/intake";
import { saveTape } from "@/lib/ingest/tapes";
import { publicDemo } from "@/lib/demo";

export const runtime = "nodejs";

const MAX_BYTES = 10 * 1024 * 1024;

export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BYTES) return tooLarge();
  let text: string;
  if ((req.headers.get("content-type") ?? "").startsWith("multipart/form-data")) {
    const file = (await req.formData()).get("tape");
    if (!(file instanceof File)) return Response.json({ error: "send the tape as a file in the \"tape\" field" }, { status: 400 });
    if (file.size > MAX_BYTES) return tooLarge();
    text = await file.text();
  } else {
    text = await req.text();
  }
  if (text.length > MAX_BYTES) return tooLarge();

  try {
    const intake = intakeTape(text);
    if (!intake.report.accepted) return Response.json({ error: "no loan in the tape could be accepted", report: intake.report }, { status: 422 });
    // the public demo reads the tape and reports on it, but keeps nothing (its disk is read-only and shared by no one)
    if (publicDemo()) return Response.json({ report: intake.report, demo: true }, { status: 201 });
    saveTape(join(process.cwd(), "data", "out", "uploads"), intake); // literal segments: keeps the build from tracing the whole repo
    return Response.json({ report: intake.report }, { status: 201 });
  } catch (e) {
    if (e instanceof IntakeError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

const tooLarge = () => Response.json({ error: `the tape is larger than ${MAX_BYTES / 1024 / 1024} MB` }, { status: 413 });
