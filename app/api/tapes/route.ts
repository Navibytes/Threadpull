// POST /api/tapes: upload a loan tape (JSON or CSV), as a multipart field "tape" or as the raw request body.
// Returns the intake report; accepted loans are kept under data/out/uploads/<tape_id>/ for a run to use (on a serverless
// host, its /tmp: best effort, so Investigate also sends the tape again).
// 201 saved · 400 unreadable tape · 413 too large · 422 no loan could be accepted (nothing saved).
import { IntakeError, intakeTape } from "@/lib/ingest/intake";
import { saveTape } from "@/lib/ingest/tapes";
import { publicDemo, writableUploads } from "@/lib/demo";

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
    saveTape(writableUploads(), intake);
    return Response.json({ report: intake.report, ...(publicDemo() ? { demo: true } : {}) }, { status: 201 });
  } catch (e) {
    if (e instanceof IntakeError) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }
}

const tooLarge = () => Response.json({ error: `the tape is larger than ${MAX_BYTES / 1024 / 1024} MB` }, { status: 413 });
