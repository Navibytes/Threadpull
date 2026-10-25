// lib/evidence/withdraw.ts: explanation checks take strings down in the evidence graph. The most important property:
// running every explaining check an agent could call never takes down a ring link. Seeds 13, 7, 21; 99 is held out.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Loan } from "@/lib/contracts/loan";
import { EventSchema } from "@/lib/contracts/event";
import { toolError, toolOk, type ToolResult } from "@/lib/contracts/tool-result";
import { generate, type AnswerKey } from "@/data/generate";
import { buildGraph, type EvidenceGraph } from "@/lib/graph";
import { loadReference } from "@/lib/ingest/reference";
import {
  checkAddress, checkHousehold, dealerTimeline, withdrawAddress, withdrawBursts, withdrawHousehold,
  type AddressCheck, type ClueExplained,
} from "@/lib/evidence";

const SPEC = join(import.meta.dir, "..", "data", "patterns", "seed13.json");
const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
function portfolio(seed: number) {
  const spec = { ...JSON.parse(readFileSync(SPEC, "utf8")), seed };
  const specPath = join(tmp(), `seed${seed}.json`);
  writeFileSync(specPath, JSON.stringify(spec));
  const r = generate(specPath, tmp(), tmp());
  const key: AnswerKey = JSON.parse(readFileSync(join(r.keyDir, "answer_key.json"), "utf8"));
  return { loans: r.normalized, key, ref: loadReference(r.outDir) };
}

// The whole clue_explained row, as the agent loop will write it, checked by the team's EventSchema
// (lib/contracts/event.ts): the result's shape and "cite the check's event row or a rule" (hard rule 3).
function expectValidRow(c: ClueExplained, at: { run_id: string; seq: number }) {
  const row = { run_id: at.run_id, seq: at.seq + 1, ts: "2026-10-24T15:04:05Z", type: "clue_explained",
    loan_ids: c.loan_ids, tool: c.result.explained_by, result: c.result, sources: c.sources, note: c.result.reason,
    budget: { spent: 0, limit: 60 }, simulated: c.simulated };
  const parsed = EventSchema.safeParse(row);
  expect(parsed.success ? [] : parsed.error.issues).toEqual([]);
  expect(c.sources[0]).toEqual({ kind: "event", run_id: at.run_id, seq: at.seq }); // the check that proved it
  expect(c.loan_ids.length).toBeGreaterThan(0);
}

test("the contract refuses a clue_explained row that cites no check", () => {
  const row = { run_id: "r", seq: 2, ts: "2026-10-24T15:04:05Z", type: "clue_explained", loan_ids: ["L0001", "L0002"],
    tool: "check_address", result: { edge_ids: [], explained_by: "check_address", reason: "x" },
    sources: [{ kind: "row", loan_id: "L0001", field: "residential_info.street_address" }], note: "", budget: { spent: 0, limit: 60 },
    simulated: false };
  expect(EventSchema.safeParse(row).success).toBe(false);
});

const groupBy = <T>(xs: T[], f: (x: T) => string) => {
  const m = new Map<string, T[]>();
  for (const x of xs) m.set(f(x), [...(m.get(f(x)) ?? []), x]);
  return m;
};
const allEdges = (g: EvidenceGraph) => {
  const seen = new Map<string, ReturnType<EvidenceGraph["edgesOf"]>[number]>();
  for (const id of g.loanIds) for (const e of g.edgesOf(id)) seen.set(e.edge_id, e);
  return [...seen.values()];
};

/** Everything an agent could try: every shared address, every pair sharing a phone or an address, every dealer. */
function runEveryCheck(loans: Loan[], ref: ReturnType<typeof loadReference>, g: EvidenceGraph) {
  let seq = 0;
  const at = () => ({ run_id: "r-test", seq: ++seq });
  const clues: { at: { run_id: string; seq: number }; clue: ClueExplained }[] = [];
  const keep = (a: { run_id: string; seq: number }, c: ClueExplained | null) => { if (c) clues.push({ at: a, clue: c }); };
  const byAddress = groupBy(loans, (l) => l.derived.address_key), byPhone = groupBy(loans, (l) => l.applicant_info.phone);
  const checks = { address: 0, household: 0, dealer: 0 };
  for (const [k, ls] of byAddress) if (ls.length > 1) { const a = at(); checks.address++; keep(a, withdrawAddress(g, checkAddress(k, loans, ref), a)); }
  for (const ls of [...byPhone.values(), ...byAddress.values()])
    for (let i = 0; i < ls.length; i++)
      for (let j = i + 1; j < ls.length; j++) { const a = at(); checks.household++; keep(a, withdrawHousehold(g, checkHousehold(ls[i], ls[j]), a)); }
  for (const d of new Set(loans.map((l) => l.submission.dealer_id))) {
    const a = at(); checks.dealer++;
    for (const c of withdrawBursts(dealerTimeline(d, loans), a)) clues.push({ at: a, clue: c });
  }
  return { clues, checks };
}

describe.each([13, 7, 21])("seed %i: every explaining check, run over the whole pool", (seed) => {
  const { loans, key, ref } = portfolio(seed);
  const g = buildGraph(loans);
  const before = g.clusters();
  const { clues, checks } = runEveryCheck(loans, ref, g);
  const ring = new Set(key.rings[0].loan_ids);
  const look = (prefix: string) => key.lookalikes.find((x) => x.explanation.startsWith(prefix))!.loan_ids;
  const explained = allEdges(g).filter((e) => e.explained);

  test("the checks really ran", () => {
    expect(checks.dealer).toBe(new Set(loans.map((l) => l.submission.dealer_id)).size);
    expect(checks.address).toBe([...groupBy(loans, (l) => l.derived.address_key).values()].filter((ls) => ls.length > 1).length);
    expect(checks.address).toBeGreaterThanOrEqual(2); // at least the building and the household's home
    expect(checks.household).toBeGreaterThanOrEqual(2); // at least the household and the ring's shared phone
  });

  test("no ring link comes down", () => {
    expect(explained.filter((e) => ring.has(e.a) || ring.has(e.b)).map((e) => e.edge_id)).toEqual([]);
    expect(clues.filter(({ clue }) => clue.loan_ids.some((id) => ring.has(id))).map(({ clue }) => clue.result)).toEqual([]);
  });

  test("the ring is still the strongest cluster, and nothing else became one", () => {
    const after = g.clusters();
    expect(new Set(after[0].loan_ids)).toEqual(ring);
    expect(after.length).toBeLessThanOrEqual(before.length);
  });

  test("only the planted innocents come down: building, household, dealer burst", () => {
    const building = look("same "), household = look("spouses");
    expect(new Set(explained.flatMap((e) => [e.a, e.b]))).toEqual(new Set([...building, ...household]));
    expect(clues.map(({ clue }) => clue.result.explained_by).sort()).toEqual(["check_address", "check_household", "dealer_timeline"]);
  });

  test("the building: its address link drops, citing check_address", () => {
    const [a, b] = look("same ").sort();
    const { clue } = clues.find(({ clue }) => clue.result.explained_by === "check_address")!;
    expect(clue.loan_ids).toEqual([a, b]);
    expect(clue.result.edge_ids).toHaveLength(1);
    const e = g.edgeById(clue.result.edge_ids[0])!;
    expect([e.kind, e.weight, e.explained, e.explanation_ref?.check]).toEqual(["address", 0, true, "check_address"]);
    expect(clue.simulated).toBe(true); // the address lookup is a simulated stand-in, and the row says so
  });

  test("the household: phone and address links between the spouses drop, nothing else they share", () => {
    const [a, b] = look("spouses").sort();
    const { clue } = clues.find(({ clue }) => clue.result.explained_by === "check_household")!;
    expect(clue.loan_ids).toEqual([a, b]);
    const dropped = clue.result.edge_ids.map((id) => g.edgeById(id)!);
    expect(dropped.map((e) => e.kind).sort()).toEqual(["address", "phone"]);
    const pair = g.edgesOf(a).filter((e) => e.a === b || e.b === b);
    for (const e of pair) expect([e.kind, e.explained]).toEqual([e.kind, e.kind === "phone" || e.kind === "address"]);
  });

  test("the dealer burst: no thread drops, the row names the burst's loans and cites only them", () => {
    const { clue } = clues.find(({ clue }) => clue.result.explained_by === "dealer_timeline")!;
    expect(clue.result.edge_ids).toEqual([]);
    for (const id of key.dealer_bursts[0].loan_ids) expect(clue.loan_ids).toContain(id);
    const inBurst = new Set(clue.loan_ids);
    for (const s of clue.sources.slice(1)) expect(s.kind === "row" && inBurst.has(s.loan_id)).toBe(true);
  });

  test("every row is a valid clue_explained event and cites the check's event row", () => {
    for (const { at, clue } of clues) expectValidRow(clue, at);
  });

  test("every dropped link keeps its proof in the graph, including the event row", () => {
    for (const e of explained) {
      expect(e.weight).toBe(0);
      expect(e.explanation_ref!.sources.some((s) => s.kind === "event")).toBe(true);
      expect(e.explanation_ref!.sources.length).toBeGreaterThan(1);
    }
  });
});

describe("safety: nothing changes unless the check explains", () => {
  const { loans, key, ref } = portfolio(13);
  const at = { run_id: "r-unit", seq: 7 };
  const byId = new Map(loans.map((l) => [l.loan_id, l]));
  const explainedCount = (g: EvidenceGraph) => allEdges(g).filter((e) => e.explained).length;

  test("a check that does not explain changes nothing", () => {
    const g = buildGraph(loans);
    const [p13, mate] = loans.filter((l) => l.applicant_info.phone === byId.get("L0037")!.applicant_info.phone);
    expect(checkHousehold(p13, mate).result!.explains).toBe(false);
    expect(withdrawHousehold(g, checkHousehold(p13, mate), at)).toBeNull();
    const ringAddr = byId.get("L0037")!.derived.address_key;
    expect(withdrawAddress(g, checkAddress(ringAddr, loans, ref), at)).toBeNull();
    expect(explainedCount(g)).toBe(0);
  });

  test("a failed check changes nothing", () => {
    const g = buildGraph(loans);
    expect(withdrawHousehold(g, toolError("check_household", "refused"), at)).toBeNull();
    expect(withdrawBursts(toolError("dealer_timeline", "no loans"), at)).toEqual([]);
    expect(explainedCount(g)).toBe(0);
  });

  test("an address the graph doesn't know changes nothing", () => {
    const g = buildGraph(loans);
    const fake: ToolResult<AddressCheck> = toolOk("check_address", { address_key: "1 NOWHERE ST|00000", address_type: "multi_unit",
      units: 300, loans_at_address: 2, explains: true, reason: "300-unit building; 2 loans name it" },
      [{ kind: "lookup", name: "address_type", key: "1 NOWHERE ST|00000", simulated: true }], true);
    expect(withdrawAddress(g, fake, at)).toBeNull();
    expect(explainedCount(g)).toBe(0);
  });

  test("the same explanation twice yields one row", () => {
    const g = buildGraph(loans);
    const [a, b] = key.lookalikes.find((x) => x.explanation.startsWith("spouses"))!.loan_ids.map((id) => byId.get(id)!);
    expect(withdrawHousehold(g, checkHousehold(a, b), at)).not.toBeNull();
    expect(withdrawHousehold(g, checkHousehold(a, b), { ...at, seq: 8 })).toBeNull();
  });

  test("a household explains only phone and home: a device the spouses also share stays up", () => {
    // the planted spouses share nothing else, so give them one more shared identifier the check never looked at
    const [x, y] = key.lookalikes.find((l) => l.explanation.startsWith("spouses"))!.loan_ids.map((id) => byId.get(id)!);
    const y2: Loan = { ...y, submission: { ...y.submission, device_id: x.submission.device_id } };
    const pool = loans.map((l) => (l.loan_id === y.loan_id ? y2 : l));
    const g = buildGraph(pool);
    const clue = withdrawHousehold(g, checkHousehold(x, y2), at)!;
    expect(clue.result.edge_ids.map((id) => g.edgeById(id)!.kind).sort()).toEqual(["address", "phone"]);
    const device = g.edgesOf(x.loan_id).find((e) => e.kind === "device" && (e.a === y.loan_id || e.b === y.loan_id))!;
    expect([device.explained, device.weight > 0]).toEqual([false, true]);
  });

  test("a building explains only the building: a phone the same loans share stays up", () => {
    // two strangers at one large building who also share a phone: the building is innocent, the phone is not
    const [x, y] = key.lookalikes.find((l) => l.explanation.startsWith("same "))!.loan_ids.map((id) => byId.get(id)!);
    const y2: Loan = { ...y, applicant_info: { ...y.applicant_info, phone: x.applicant_info.phone } };
    const pool = loans.map((l) => (l.loan_id === y.loan_id ? y2 : l));
    const g = buildGraph(pool);
    const clue = withdrawAddress(g, checkAddress(x.derived.address_key, pool, ref), at)!;
    expect(clue.result.edge_ids.every((id) => g.edgeById(id)!.kind === "address")).toBe(true);
    const phone = g.edgesOf(x.loan_id).find((e) => e.kind === "phone" && (e.a === y.loan_id || e.b === y.loan_id))!;
    expect([phone.explained, phone.weight > 0]).toEqual([false, true]);
  });
});
