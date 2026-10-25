// A real Hazel run on seed 13 for the deal tests and the local demo run. Claude is a scripted stand-in (no API key, no network);
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
import { loadReference } from "@/lib/ingest/reference";
import { MemoryRuleStore } from "@/lib/rules";
import { client as replayCrs } from "./crs-replay";

export const SPEC = join(import.meta.dir, "..", "data", "patterns", "seed13.json");
export const RUN_ID = "r13-sample";
type Call = { name: string; input: Record<string, unknown> };

/** A fake Messages API: each request gets the next scripted turn (tool calls, or a final text). */
function scriptedClaude(turns: (Call[] | string)[]) {
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

export type DealRun = {
  run_id: string;
  loans: Loan[];
  events: readonly Event[];
  ids: { lead: string; p12: string; p14: string; background: string; fraudAlert: string; clean: string; p03: string };
};

let cached: Promise<DealRun> | undefined;
/** The ring (P13 lead, P12, P14 and a background loan tied in by the shared phone), a fraud-alert loan (P16) and a clean one (P01). */
export function dealRun(): Promise<DealRun> {
  return (cached ??= (async () => {
    const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
    const gen = generate(SPEC, tmp(), tmp());
    const loans = gen.normalized;
    const idOf = (persona: string) => loans.find((l) => l.persona_id === persona)!.loan_id;
    const ids = { lead: "L0037", p12: "L0190", p14: "L0195", background: "L0445", fraudAlert: idOf("P16"), clean: idOf("P01"), p03: idOf("P03") };
    const anthropic = scriptedClaude([
      [{ name: "crs_identity_check", input: { loan_id: ids.lead, note: "Check the lead's identity first." } }],
      [{ name: "find_connections", input: { entity_id: ids.lead } }],
      [{ name: "crs_identity_check", input: { loan_id: ids.p12 } }, { name: "crs_identity_check", input: { loan_id: ids.p14 } }],
      [{ name: "crs_identity_check", input: { loan_id: ids.fraudAlert } }, { name: "crs_identity_check", input: { loan_id: ids.clean } }],
      [{ name: "close_lead", input: { loan_id: ids.lead } }, { name: "close_lead", input: { loan_id: ids.p12 } },
        { name: "close_lead", input: { loan_id: ids.p14 } }, { name: "close_lead", input: { loan_id: ids.background } },
        { name: "close_lead", input: { loan_id: ids.fraudAlert } }, { name: "close_lead", input: { loan_id: ids.clean } }],
      "Ring around L0037 mapped; one fraud alert for the CRO; one clean identity.",
    ]);
    const out = await runHazel({ runId: RUN_ID, loans, reference: loadReference(gen.outDir), anthropic, crs: replayCrs(),
      rules: new MemoryRuleStore(), now: () => new Date("2026-10-24T20:00:00Z") });
    return { run_id: RUN_ID, loans, events: out.events, ids };
  })());
}
