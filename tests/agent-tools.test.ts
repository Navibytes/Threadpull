// Ticket 05 prep: Hazel's non-CRS tools over seed 13, and their results feeding A's withdraw functions.
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { TOOL_NAMES, TOOL_SPECS, ToolResultSchema, type ToolResult } from "@/lib/contracts/tool-result";
import { EventSchema } from "@/lib/contracts/event";
import { createDataRoom, isHazelTool, runTool, TOOLS, type DataRoom } from "@/lib/agent";
import { WITHHELD, withdrawAddress, withdrawHousehold, type AddressCheck, type HouseholdCheck } from "@/lib/evidence";
import { loadReference } from "@/lib/ingest/reference";
import { generate, type AnswerKey } from "@/data/generate";

let room: DataRoom, key: AnswerKey;
beforeAll(() => {
  const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
  const r = generate(join(import.meta.dir, "..", "data", "patterns", "seed13.json"), tmp(), tmp());
  key = JSON.parse(readFileSync(join(r.keyDir, "answer_key.json"), "utf8"));
  room = createDataRoom(r.normalized, loadReference(r.outDir));
});
const lookalike = (prefix: string) => key.lookalikes.find((x) => x.explanation.startsWith(prefix))!.loan_ids;
const ringIds = () => key.rings[0].loan_ids;

describe("registry", () => {
  test("only known tool names, and no CRS tool before ticket 03", () => {
    for (const name of Object.keys(TOOLS)) expect(TOOL_NAMES).toContain(name as never);
    expect(Object.keys(TOOLS).filter((n) => n.startsWith("crs_"))).toEqual([]);
    expect([isHazelTool("find_connections"), isHazelTool("crs_identity_check"), isHazelTool("toString")]).toEqual([true, false, false]);
  });

  test("every tool returns the contract shape and charges its TOOL_SPECS cost", () => {
    const [a, b] = ringIds();
    const calls: [keyof typeof TOOLS, unknown][] = [
      ["inspect_loan", { loan_id: a }], ["find_connections", { entity_id: a }],
      ["compare_documents", { doc_a: `${a}-PS`, doc_b: `${b}-PS` }], ["dealer_timeline", { dealer_id: "D03" }],
      ["inspect_dealer_loans", { dealer_id: "D03" }], ["check_address", { address: room.byId.get(a)!.derived.address_key }],
      ["check_household", { loan_a: a, loan_b: b }], ["check_employer", { employer: room.byId.get(a)!.employment_info.employer_name }],
    ];
    expect(calls.map(([n]) => n as string).sort()).toEqual(Object.keys(TOOLS).sort());
    for (const [name, input] of calls) {
      const r = runTool(room, name, input);
      expect([name, r.ok, r.error]).toEqual([name, true, undefined]);
      expect(ToolResultSchema.parse(r).cost).toEqual({ ...TOOL_SPECS[name] });
      expect(r.sources.length).toBeGreaterThan(0);
    }
  });

  test("bad input is refused before running, and costs nothing", () => {
    for (const [name, input] of [["inspect_loan", { loan_id: "37" }], ["check_household", { loan_a: "L0001" }], ["find_connections", null]] as const) {
      const r = runTool(room, name, input);
      expect([r.ok, r.cost.acorns, r.error?.startsWith("invalid input")]).toEqual([false, 0, true]);
    }
    expect(runTool(room, "inspect_loan", { loan_id: "L9999" }).ok).toBe(false);
  });
});

describe("inspect_loan shows the model only what it may see", () => {
  test("masked SSN, no ground-truth field, documents as form fields only", () => {
    const l = room.byId.get(ringIds()[0])!;
    const view = runTool(room, "inspect_loan", { loan_id: l.loan_id }).result as Record<string, any>;
    expect(view.applicant_info.ssn).toBe(`***-**-${l.applicant_info.ssn.slice(-4)}`);
    expect(Object.keys(view)).not.toContain("kind");
    expect(JSON.stringify(view)).not.toContain(l.applicant_info.ssn);
    for (const d of view.documents) expect(d).not.toHaveProperty("text");
  });

  test("the injected pay stub reaches Hazel withheld and flagged", () => {
    const [docId] = key.injected_docs;
    const view = runTool(room, "inspect_loan", { loan_id: docId.replace(/-PS$/, "") }).result as Record<string, any>;
    const stub = view.documents.find((d: { doc_id: string }) => d.doc_id === docId);
    expect(stub.scan.attack_detected).toBe(true);
    expect(JSON.stringify(view)).not.toContain("ignore all prior instructions");
    expect(Object.values(stub.fields).includes(WITHHELD) || stub.scan.unexpected_lines.length > 0).toBe(true);
  });
});

describe("the ring's threads", () => {
  test("the dealer's strongest leads are the ring", () => {
    const r = runTool(room, "inspect_dealer_loans", { dealer_id: room.byId.get(ringIds()[0])!.submission.dealer_id });
    const top = (r.result as { loans: { loan_id: string }[] }).loans.slice(0, 6).map((l) => l.loan_id).sort();
    expect(top).toEqual([...ringIds()].sort());
  });

  test("two ring pay stubs compare as one recycled template", () => {
    const [a, b] = ringIds();
    expect((runTool(room, "compare_documents", { doc_a: `${a}-PS`, doc_b: `${b}-PS` }).result as { verdict: string }).verdict)
      .toBe("recycled_template");
  });

  test("an employer entity id from the graph resolves to the name the check expects", () => {
    const hospital = room.byId.get(key.lookalikes.find((x) => x.loan_ids.length === 40)!.loan_ids[0])!;
    const entity = room.graph.entitiesOf(hospital.loan_id).find((e) => room.graph.kind(e) === "employer")!;
    const r = runTool(room, "check_employer", { employer: entity }).result as { loans_in_pool: number; verdict: string };
    expect([r.loans_in_pool, r.verdict]).toEqual([40, "large_employer"]);
  });
});

describe("tool results plug into A's withdraw functions", () => {
  const at = { run_id: "r13-test", seq: 7 };

  test("check_address called with a graph entity id takes the building's link down", () => {
    const [a, b] = key.lookalikes.find((x) => x.proving_check === "check_address")!.loan_ids;
    const entity = room.graph.entitiesOf(a).find((e) => room.graph.kind(e) === "address")!;
    const before = room.graph.pairScore(a, b);
    const down = withdrawAddress(room.graph, runTool(room, "check_address", { address: entity }) as ToolResult<AddressCheck>, at)!;
    expect(down.result.edge_ids).toEqual([room.graph.edgeId(entity, a, b)]);
    expect(down.sources[0]).toEqual({ kind: "event", ...at });
    expect(room.graph.pairScore(a, b)).toBeLessThan(before);
  });

  test("check_household on the spouses takes their phone link down; the ring pair stays up", () => {
    const [a, b] = lookalike("spouses");
    const down = withdrawHousehold(room.graph, runTool(room, "check_household", { loan_a: a, loan_b: b }) as ToolResult<HouseholdCheck>, at)!;
    expect(down.result.edge_ids.some((id) => id.startsWith("e-phone-"))).toBe(true);
    const [x, y] = ringIds();
    expect(withdrawHousehold(room.graph, runTool(room, "check_household", { loan_a: x, loan_b: y }) as ToolResult<HouseholdCheck>, at)).toBeNull();
  });
});

test("C's event contract accepts a link_found row built from a graph edge", () => {
  const e = room.graph.edgesOf(ringIds()[0])[0];
  expect(EventSchema.safeParse({
    run_id: "r13-test", seq: 1, ts: "2026-10-24T15:04:05Z", type: "link_found", loan_ids: [e.a, e.b], tool: "find_connections",
    result: { edge_id: e.edge_id, kind: e.kind, weight: e.weight }, sources: e.sources,
    note: "Same value as the lead, and almost nobody else in the pool shares it.", budget: { spent: 0, limit: 60 }, simulated: false,
  }).success).toBe(true);
});
