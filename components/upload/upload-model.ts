// The upload page's logic, kept out of React so it can be tested: what can be sent, how it's sent to
// POST /api/tapes, and what the intake report says in plain words. Only the report's type comes from lib/ingest
// (intake itself is server code).
import type { IntakeReport } from "@/lib/ingest/intake";

/** Same limit as the route (app/api/tapes/route.ts): checked here so a too-large file isn't sent at all. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const TEMPLATE_URL = "/templates/loan-tape-template.csv";
/** A whole portfolio as JSON: the 1,000 generated seed 13 loans with their pay stubs and applications (synthetic; no
 * generator truth in it). Investigating it shows the ring, an injected pay stub and the innocent lookalikes. */
export const JSON_SAMPLE_URL = "/templates/sample-tape-1000-loans.json";

/** What the sample and every generated tape have planted in them: the development spec's cases, the same counts for any
 * seed and size (tests/judge-sample-tape.test.ts checks them against the answer key). */
export const PLANTED = "a 6-loan fraud ring, 47 innocent loans that only look connected to others, 3 risky but real borrowers, 3 cases a person has to decide, and one pay stub with instructions hidden in it";

export type UploadState =
  | { kind: "idle" }
  | { kind: "sending"; name: string }
  | { kind: "done"; name: string; report: IntakeReport; saved: boolean } // saved: false when no loan was accepted
  | { kind: "failed"; name: string | null; message: string };

/** A reason the file can't be sent, or null. Content is the server's job; this only catches the obvious. */
export function checkFile(file: { name: string; size: number }): string | null {
  if (file.size === 0) return "That file is empty.";
  if (file.size > MAX_UPLOAD_BYTES) return `That file is over the ${MAX_UPLOAD_BYTES / 1024 / 1024} MB limit (${(file.size / 1024 / 1024).toFixed(1)} MB).`;
  return null;
}

/** Sends one tape and turns every answer (including a broken one) into a state the page can show. */
export async function sendTape(file: Blob, name: string, fetchImpl: typeof fetch = fetch): Promise<UploadState> {
  const problem = checkFile({ name, size: file.size });
  if (problem) return { kind: "failed", name, message: problem };
  const body = new FormData();
  body.append("tape", file, name);
  let res: Response;
  try {
    res = await fetchImpl("/api/tapes", { method: "POST", body });
  } catch {
    return { kind: "failed", name, message: "The upload didn't reach the server. Check that the app is running and try again." };
  }
  const data = (await res.json().catch(() => null)) as { report?: IntakeReport; error?: string } | null;
  if ((res.status === 201 || res.status === 422) && data?.report) return { kind: "done", name, report: data.report, saved: res.status === 201 };
  return { kind: "failed", name, message: data?.error ? sentence(data.error) : `The server answered ${res.status} without a report.` };
}

const sentence = (s: string) => s.charAt(0).toUpperCase() + s.slice(1) + (/[.!?]$/.test(s) ? "" : ".");

export type Fact = { label: string; value: string; tone?: "good" | "warn" | "alert" };

/** The report's headline numbers, in order, for the result cards. */
export function reportFacts(r: IntakeReport): Fact[] {
  const n = (x: number) => x.toLocaleString("en-US");
  return [
    { label: "Loans accepted", value: `${n(r.accepted)} of ${n(r.received)}`, tone: r.accepted === r.received ? "good" : r.accepted ? "warn" : "alert" },
    { label: "Rows rejected", value: n(r.rejected.length), tone: r.rejected.length ? "warn" : "good" },
    { label: "Dealers", value: n(r.dealers) },
    { label: "Submitted", value: r.submitted ? dateRange(r.submitted.first, r.submitted.last) : "none" },
    { label: "CRS sandbox identities", value: n(r.sandbox_identities) },
    { label: "Documents", value: r.format === "csv" ? "none (CSV)" : n(r.documents) },
    { label: "Instruction-like documents", value: n(r.flagged_documents.length), tone: r.flagged_documents.length ? "alert" : undefined },
  ];
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
export const dateRange = (first: string, last: string) => (day(first) === day(last) ? day(first) : `${day(first)} – ${day(last)}`);

/** Rejections shown at once; the rest are counted, not dropped silently. */
export const REJECTED_SHOWN = 25;
