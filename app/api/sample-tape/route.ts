// GET /api/sample-tape?seed=4242&loans=500: a synthetic portfolio generated for the seed and size a visitor picks
// (data/sample-tape.ts), as a JSON tape to download or send to POST /api/tapes. Free: no model, no CRS, nothing saved.
// 200 the tape · 400 a seed or size it doesn't offer.
import { sampleTape } from "@/data/sample-tape";
import { sampleName, sampleProblem } from "@/lib/ingest/sample";

export const runtime = "nodejs";

export function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const seed = Number(q.get("seed")), loans = Number(q.get("loans"));
  const problem = sampleProblem(seed, loans);
  if (problem) return Response.json({ error: problem }, { status: 400 });
  return new Response(JSON.stringify(sampleTape({ seed, loans }), null, 1) + "\n", {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${sampleName({ seed, loans })}"`,
      // same request, same tape
      "cache-control": "public, max-age=86400, immutable",
    },
  });
}
