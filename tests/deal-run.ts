// Real Hazel runs on seed 13 for the deal tests and the local demo run. The model is a scripted stand-in (no API key, no network);
// the CRS answers are the real sandbox responses recorded on 2026-10-24 (tests/crs-replay.ts); everything else is the real loop.
// Not a test file.
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import { generate } from "@/data/generate";
import { HAZEL_MODEL, runHazel } from "@/lib/agent";
import type { Event } from "@/lib/contracts/event";
import type { Loan } from "@/lib/contracts/loan";
import { loadReference, type Reference } from "@/lib/ingest/reference";
import { MemoryRuleStore } from "@/lib/rules";
import { client as replayCrs } from "./crs-replay";

export const SPEC = join(import.meta.dir, "..", "data", "patterns", "seed13.json");
export const RUN_ID = "r13-sample";
type Call = { name: string; input: Record<string, unknown> };
type Turn = Call[] | string;

/** A fake Messages API: each request gets the next scripted turn (tool calls, or a final text). */
function scriptedClaude(turns: Turn[]) {
  let n = 0;
  const fetch = (async (_url: RequestInfo | URL, _init?: RequestInit) => {
    const turn = turns[Math.min(n++, turns.length - 1)];
    const content = typeof turn === "string" ? [{ type: "text", text: turn }]
      : turn.map((c, i) => ({ type: "tool_use", id: `toolu_${n}_${i}`, name: c.name, input: c.input }));
    return new Response(JSON.stringify({
      id: `msg_${n}`, type: "message", role: "assistant", model: HAZEL_MODEL, content,
      stop_reason: typeof turn === "string" ? "end_turn" : "tool_use", stop_sequence: null,
      usage: { input_tokens: 100, output_tokens: 20 },
    }), { status: 200, headers: { "content-type": "application/json", "request-id": `req_${n}` } });
  }) as typeof globalThis.fetch;
  return new Anthropic({ apiKey: "scripted", fetch, maxRetries: 0 });
}

type World = { loans: Loan[]; reference: Reference; idOf: (persona: string) => string };
let world: World | undefined;
function theWorld(): World {
  if (world) return world;
  const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
  const gen = generate(SPEC, tmp(), tmp());
  return (world = { loans: gen.normalized, reference: loadReference(gen.outDir), idOf: (p) => gen.normalized.find((l) => l.persona_id === p)!.loan_id });
}

export type DealRun = {
  run_id: string;
  loans: Loan[];
  events: readonly Event[];
  ids: { lead: string; p12: string; p14: string; background: string; fraudAlert: string; clean: string; p03: string; p15: string; p17: string };
};

async function play(turns: (ids: DealRun["ids"]) => Turn[]): Promise<DealRun> {
  const w = theWorld();
  const ids = { lead: "L0037", p12: "L0190", p14: "L0195", background: "L0445", fraudAlert: w.idOf("P16"), clean: w.idOf("P01"),
    p03: w.idOf("P03"), p15: w.idOf("P15"), p17: w.idOf("P17") };
  const out = await runHazel({ runId: RUN_ID, loans: w.loans, reference: w.reference, anthropic: scriptedClaude(turns(ids)), crs: replayCrs(),
    rules: new MemoryRuleStore(), now: () => new Date("2026-10-24T20:00:00Z") });
  return { run_id: RUN_ID, loans: w.loans, events: out.events, ids };
}

let basic: Promise<DealRun> | undefined;
/** The ring (P13 lead, P12, P14 and a background loan tied in by the shared phone), a fraud-alert loan (P16) and a clean one (P01): identity checks only. */
export const dealRun = () => (basic ??= play((i) => [
  [{ name: "crs_identity_check", input: { loan_id: i.lead, note: "Check the lead's identity first." } }],
  [{ name: "find_connections", input: { entity_id: i.lead } }],
  [{ name: "crs_identity_check", input: { loan_id: i.p12 } }, { name: "crs_identity_check", input: { loan_id: i.p14 } }],
  [{ name: "crs_identity_check", input: { loan_id: i.fraudAlert } }, { name: "crs_identity_check", input: { loan_id: i.clean } }],
  [i.lead, i.p12, i.p14, i.background, i.fraudAlert, i.clean].map((loan_id) => ({ name: "close_lead", input: { loan_id } })),
  "Ring around L0037 mapped; one fraud alert for the CRO; one clean identity.",
]));

let rich: Promise<DealRun> | undefined;
/** The same, plus credit reports: a clean borrower (790), a thin file (660), a frozen bureau (P15) and bureaus that disagree (P17). */
export const dealRunWithCredit = () => (rich ??= play((i) => [
  [{ name: "crs_identity_check", input: { loan_id: i.lead, note: "Check the lead's identity first." } }],
  [{ name: "find_connections", input: { entity_id: i.lead } }],
  [{ name: "crs_identity_check", input: { loan_id: i.p12 } }, { name: "crs_identity_check", input: { loan_id: i.p14 } }],
  [{ name: "crs_identity_check", input: { loan_id: i.fraudAlert } }, { name: "crs_identity_check", input: { loan_id: i.clean } }],
  [{ name: "crs_credit_report", input: { loan_id: i.clean } }, { name: "crs_credit_report", input: { loan_id: i.p03 } }],
  [{ name: "crs_credit_report", input: { loan_id: i.p15 } }, { name: "crs_credit_report", input: { loan_id: i.p17 } }],
  [i.lead, i.p12, i.p14, i.background, i.fraudAlert, i.clean, i.p03, i.p15, i.p17].map((loan_id) => ({ name: "close_lead", input: { loan_id } })),
  "Ring mapped; one fraud alert; a clean borrower, a thin file, a frozen bureau and a bureau disagreement checked on credit.",
]));
