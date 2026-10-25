// GET /api/loans?seed=13 — filing drawer: normalized loans with their current status (SKELETON §10).
// Reads Supabase when configured; otherwise the generated file, so the drawer works before the DB exists.
// GET /api/loans?tape=t-… — the accepted loans of an uploaded tape (data/out/uploads/<tape_id>/).
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { TAPE_ID } from "@/lib/ingest/intake";

export async function GET(req: Request) {
  const tape = new URL(req.url).searchParams.get("tape");
  if (tape !== null) {
    if (!TAPE_ID.test(tape)) return Response.json({ error: "not a tape id" }, { status: 400 });
    try {
      return Response.json(JSON.parse(await readFile(join(process.cwd(), "data", "out", "uploads", tape, "loans.normalized.json"), "utf8")));
    } catch {
      return Response.json({ error: `no uploaded tape ${tape}` }, { status: 404 });
    }
  }
  const seed = Number(new URL(req.url).searchParams.get("seed") ?? 13);
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const res = await fetch(`${url}/rest/v1/loans?seed=eq.${seed}&select=record&order=loan_id`, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Range: "0-1999" },
    });
    if (!res.ok) return Response.json({ error: await res.text() }, { status: 502 });
    return Response.json((await res.json()).map((r: { record: unknown }) => r.record));
  }
  const file = join(process.cwd(), "data", "out", `seed${seed}`, "loans.normalized.json");
  try {
    return Response.json(JSON.parse(await readFile(file, "utf8")));
  } catch {
    return Response.json({ error: `seed ${seed} not generated: run bun run data` }, { status: 404 });
  }
}
