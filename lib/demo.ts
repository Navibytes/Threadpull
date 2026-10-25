// The public deployment (PUBLIC_DEMO=1, e.g. on Vercel). Pages and recorded runs work for everyone. A live investigation
// spends Claude tokens and CRS calls, so it needs INVESTIGATE_PASSCODE (sent as the x-threadpull-passcode header); answers,
// decisions and memos stay in the local app. Server-side flags: no NEXT_PUBLIC_ variable, so nothing is switched from the
// browser.
import { timingSafeEqual } from "node:crypto";
import { join } from "node:path";

export const publicDemo = () => process.env.PUBLIC_DEMO === "1";

export const DEMO_READ_ONLY =
  "This is the public demo. Answers, decisions and memos write files the demo doesn't keep, so they run in the local app (bun run dev; see the README). The recorded runs here are real runs.";

export const demoRefusal = () => Response.json({ error: DEMO_READ_ONLY, demo: true }, { status: 403 });

export const PASSCODE_HEADER = "x-threadpull-passcode";

/** True when the request carries the configured passcode. No passcode configured: never. */
export function passcodeOk(given: string | null | undefined, want = process.env.INVESTIGATE_PASSCODE): boolean {
  if (!want || !given) return false;
  const a = Buffer.from(given), b = Buffer.from(want);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Where a deployment may write. Locally: the repo's own folders. On a serverless host (VERCEL is set) only /tmp is
 * writable; it belongs to one server instance and is wiped on a cold start, so what is written there is best effort.
 */
export const scratchRoot = (): string | null => process.env.THREADPULL_SCRATCH ?? (process.env.VERCEL ? "/tmp/threadpull" : null);
export const writableUploads = () => { const s = scratchRoot(); return s ? join(s, "uploads") : join(process.cwd(), "data", "out", "uploads"); };
export const writableRuns = () => { const s = scratchRoot(); return s ? join(s, "runs") : join(process.cwd(), "runs"); };
export const writableRules = () => process.env.THREADPULL_RULES ?? (scratchRoot() ? join(scratchRoot()!, "rules.json") : join(process.cwd(), "runs", "rules.json"));
/** Where an uploaded tape may be: the writable folder first, then the repo's. */
export const uploadRoots = () => [...new Set([writableUploads(), join(process.cwd(), "data", "out", "uploads")])];
