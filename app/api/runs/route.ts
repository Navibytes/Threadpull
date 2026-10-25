// GET /api/runs: the runs on this machine (runs/<run_id>/events.jsonl), newest first. Feeds the CRO screen's run picker.
import { listRuns } from "@/lib/deal/service";

export const dynamic = "force-dynamic"; // the list changes whenever a run is written

export async function GET() {
  return Response.json(listRuns());
}
