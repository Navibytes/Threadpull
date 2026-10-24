// Shared by the recorded-response tests: the real sandbox responses saved by data/record-crs.ts, served back by a fake fetch.
// No network, no login. Not a test file itself.
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import personas from "@/data/personas.json";
import { createCrsClient, memoryCache } from "@/lib/crs";

export type Recording = { endpoint: string; persona: string; status: number; request_id: string; request: Record<string, unknown>; response: unknown };

const DIR = join(import.meta.dir, "..", "data", "crs-recordings");
/** Recordings by endpoint name, then persona id. An endpoint nobody recorded yet is simply absent. */
export const rec: Record<string, Record<string, Recording>> = {};
for (const f of readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
  const r = JSON.parse(readFileSync(join(DIR, f), "utf8")) as Recording;
  (rec[r.endpoint] ??= {})[r.persona] = r;
}

const personaBySsn = new Map(personas.personas.map((p) => [p.ssn, p.id]));
const personaByPhone = new Map(personas.personas.map((p) => [p.phone, p.id]));
export const persona = (id: string) => personas.personas.find((p) => p.id === id)!;
export const loanOf = (id: string) => ({ loan_id: `L-${id}`, applicant_info: { ssn: persona(id).ssn, date_of_birth: persona(id).dob } });

const endpointOf = (url: string) =>
  url.includes("identity-manager") ? "identity" : url.includes("/transunion/credit") ? "credit_tu" : url.includes("/equifax/") ? "credit_efx"
  : url.includes("/experian/") ? "credit_exp" : url.includes("/fraud-finder/") ? "fraud" : "reverse";

// The sandbox answers each persona with the response CRS really returned for it.
const replay = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.endsWith("/users/login")) return new Response(JSON.stringify({ token: "t" }), { status: 200 });
  const body = JSON.parse(String(init?.body));
  const id = body.ssn ? personaBySsn.get(body.ssn) : personaByPhone.get(body.phoneNumber);
  const r = rec[endpointOf(url)][id!];
  return new Response(JSON.stringify(r.response), { status: r.status, headers: { "Content-Type": "application/json", RequestID: r.request_id } });
}) as typeof fetch;

export const client = () => createCrsClient({ fetch: replay, cache: memoryCache(), username: "user", password: "pass" });

/** The day the responses were pulled (responseDetail.dateRequested), so counts do not drift with today's date. */
export const PULLED = Date.parse("2026-10-24T23:11:57Z");
