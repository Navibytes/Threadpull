// GET /api/loans?seed=13 — filing drawer: normalized loans with their current status (SKELETON §10).
// Reads Supabase when configured; otherwise the generated file, so the drawer works before the DB exists.
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export async function GET(req: Request) {
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
