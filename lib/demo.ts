// The public read-only deployment (PUBLIC_DEMO=1, e.g. on Vercel). Pages and recorded runs work; anything that spends
// Claude tokens or CRS calls, or writes a file, runs only in the local app. Server-side flag: no NEXT_PUBLIC_ variable, so
// nobody can switch it from the browser.
export const publicDemo = () => process.env.PUBLIC_DEMO === "1";

export const DEMO_READ_ONLY =
  "This is the public read-only demo. Investigations, answers, decisions and memos spend Claude tokens and CRS calls or write files, so they run in the local app (bun run dev; see the README). The recorded runs here are real runs.";

export const demoRefusal = () => Response.json({ error: DEMO_READ_ONLY, demo: true }, { status: 403 });
