// One-off (tickets 03/06): log in to the CRS sandbox once, call the persona set live, and save every response
// under data/crs-recordings/. Tests and the simulated fallback read those files instead of the network.
//   bun run data/record-crs.ts [identity] [credit] [fraud] [reverse] [--dry]
// A failed login stops the script: repeated failures disable the shared account, so it is never retried.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import personas from "@/data/personas.json";
import { assertSandboxBody, bodyForLoan, bodyForPhone, type CrsProduct } from "@/lib/crs/persona-guard";

const BASE = "https://api-sandbox.stitchcredit.com/api";
const OUT = join(import.meta.dir, "crs-recordings");
const JSON_HEADERS = { "Content-Type": "application/json", Accept: "application/json" };

type Endpoint = { path: string; product: CrsProduct; group: string };
const ENDPOINTS: Record<string, Endpoint> = {
  identity: { path: "/transunion/identity-manager-verification/basic", product: "tu_identity", group: "identity" },
  credit_tu: { path: "/transunion/credit-report/standard/tu-prequal-fico9", product: "credit_report", group: "credit" },
  credit_efx: { path: "/equifax/credit-report/standard/efx-prequal-vantage4", product: "credit_report", group: "credit" },
  credit_exp: { path: "/experian/credit-report/standard/exp-prequal-vantage4", product: "credit_report", group: "credit" },
  fraud: { path: "/fraud-finder/fraud-finder", product: "fraud_finder", group: "fraud" },
  reverse: { path: "/accurate-append/reverse", product: "reverse_phone", group: "reverse" },
};
// Who each group records: the demo cases plus a clean baseline and the lookalikes' neighbours.
const WHO: Record<string, string[]> = {
  identity: ["P01", "P08", "P12", "P13", "P14", "P15", "P16", "P17"],
  credit: ["P01", "P03", "P12", "P13", "P14", "P15", "P17"],
  fraud: ["P01", "P02", "P08", "P10", "P12", "P13", "P14", "P16", "P18", "P19"],
  reverse: ["P01", "P12", "P13", "P14"],
};

const personaOf = (id: string) => personas.personas.find((p) => p.id === id)!;
const bodyFor = (e: Endpoint, id: string) =>
  e.product === "reverse_phone"
    ? bodyForPhone(personaOf(id).phone)
    : bodyForLoan(e.product, { loan_id: id, applicant_info: { ssn: personaOf(id).ssn } });

const args = process.argv.slice(2);
const groups = args.filter((a) => !a.startsWith("--"));
const plan = Object.entries(ENDPOINTS)
  .filter(([, e]) => !groups.length || groups.includes(e.group))
  .flatMap(([name, e]) => WHO[e.group].map((id) => ({ name, e, id, body: bodyFor(e, id) })));
console.log(`${plan.length} calls planned`);
if (args.includes("--dry")) {
  for (const c of plan) console.log(`  ${c.name} ${c.id}`);
  process.exit(0);
}

const { CRS_USERNAME: user, CRS_PASSWORD: pass } = process.env;
if (!user || !pass) {
  console.error("CRS_USERNAME and CRS_PASSWORD must be set in .env.local");
  process.exit(1);
}
const login = await fetch(`${BASE}/users/login`, { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ username: user, password: pass }) });
if (!login.ok) {
  console.error(`login failed (HTTP ${login.status}); not retrying. Ask the owner of the credentials to check them.`);
  process.exit(1);
}
const token: string | undefined = (await login.json().catch(() => null))?.token;
if (!token) {
  console.error("login response carried no token");
  process.exit(1);
}
console.log("logged in once");

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
async function post(path: string, body: unknown) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BASE + path, { method: "POST", headers: { ...JSON_HEADERS, Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
    if ((res.status !== 429 && res.status < 500) || attempt === 3) return res;
    await sleep(res.status === 429 ? Number(res.headers.get("Retry-After") ?? 5) * 1000 : 500 * 2 ** attempt);
  }
}

const get = (v: unknown, path: string): any => path.split(".").reduce((o: any, k) => o?.[k], v);
function finding(name: string, r: unknown): string {
  if (name === "identity") {
    const codes = (get(r, "addOnProducts") ?? []).flatMap((p: unknown) => get(p, "idManagerVerification.messages") ?? []).map((m: unknown) => get(m, "code"));
    return `codes: ${codes.join(" ") || "none"}`;
  }
  if (name.startsWith("credit")) {
    const scores = (get(r, "scores") ?? []).map((s: unknown) => get(s, "scoreValue") ?? get(s, "noScoreReasonType"));
    return `errors: ${get(r, "errorMessages")?.length ?? 0}; file: ${JSON.stringify(get(r, "creditFiles.0.creditFileDetail"))?.slice(0, 80)}; scores: ${scores.join(",")}`;
  }
  if (name === "fraud") return `risk.score ${get(r, "risk.score")}; address_type ${get(r, "risk.postal.address_type")}`;
  return `records: ${get(r, "data.records")?.length}`;
}

mkdirSync(OUT, { recursive: true });
for (const { name, e, id, body } of plan) {
  assertSandboxBody(e.product, body); // same check the client makes: nothing but a persona body is ever sent
  const res = await post(e.path, body);
  const text = await res.text();
  if ([user, pass, token].some((s) => text.includes(s))) throw new Error(`${name} ${id}: the response contains a credential, not saved`);
  let response: unknown;
  try {
    response = JSON.parse(text);
  } catch {
    response = text;
  }
  const request_id = res.headers.get("RequestID");
  const record = { endpoint: name, persona: id, path: e.path, status: res.status, request_id, request: body, response };
  writeFileSync(join(OUT, `${name}-${id}.json`), `${JSON.stringify(record, null, 2)}\n`);
  console.log(`${name.padEnd(10)} ${id}  HTTP ${res.status}  ${request_id ?? "no RequestID"}  ${finding(name, response)}`);
  await sleep(300);
}
console.log(`saved to ${OUT}`);
