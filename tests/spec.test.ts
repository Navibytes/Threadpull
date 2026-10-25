// Ticket 12: the pattern spec a held-out set is written in. A mistake fails with a message naming it, a spec may repeat
// a pattern type and still get a correct answer key, and data:check passes a good spec end to end. Variants here are
// built from seed 13 in code: syntax and generator coverage only, not a held-out set.
import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { checkSpec } from "@/data/check";
import { generate, type AnswerKey } from "@/data/generate";
import { parseSpec, type Spec } from "@/data/spec";

const SEED13 = join(import.meta.dir, "..", "data", "patterns", "seed13.json");
const base = (): Spec => JSON.parse(readFileSync(SEED13, "utf8"));
const problems = (spec: unknown) => { try { parseSpec(spec); return ""; } catch (e) { return (e as Error).message; } };
const write = (spec: unknown) => { const p = join(mkdtempSync(join(tmpdir(), "tp-spec-")), "spec.json"); writeFileSync(p, JSON.stringify(spec)); return p; };
const ring = (s: Spec) => s.patterns.find((p) => p.type === "ring")! as Extract<Spec["patterns"][number], { type: "ring" }>;

describe("a spec mistake fails with a message naming it", () => {
  test("seed 13 is valid", () => expect(problems(base())).toBe(""));

  test("a persona planted twice", () => {
    const s = base();
    s.patterns.push({ type: "review", persona: "P13", expected_status: "Investigate", reason: "again" });
    expect(problems(s)).toContain("P13 is already planted by patterns[0]");
  });

  test("a ring member that doesn't exist, and a kind rings can't share", () => {
    const s = base();
    ring(s).shared.push({ kind: "phone", members: ["P13", "bg4"] });
    (ring(s).shared as { kind: string; members: string[] }[]).push({ kind: "email", members: ["P12", "bg1"] });
    const msg = problems(s);
    expect(msg).toContain("shared.7.kind: Invalid option: expected one of \"phone\"|\"bank_account\"|\"device_id\"|\"ip_address\"");
    s.patterns[0] = { ...ring(s), shared: ring(s).shared.filter((x) => x.kind !== ("email" as string)) };
    expect(problems(s)).toContain("shared phone names bg4, not a member");
  });

  test("a dealer outside n_dealers, a misspelled field, an injection before its ring", () => {
    const s = base();
    ring(s).dealer = "D30";
    expect(problems(s)).toContain("dealer D30 is outside D01…D24");
    const typo = base() as unknown as { patterns: Record<string, unknown>[] };
    typo.patterns[0].shard = [];
    expect(problems(typo)).toContain("Unrecognized key");
    const early = base();
    early.patterns.unshift(early.patterns.pop()!); // the injection, now listed before the ring it targets
    expect(problems(early)).toContain("target RING-1:bg1 is not a ring member planted above");
    const both = base();
    both.patterns[both.patterns.length - 1] = { type: "injection", target: "RING-1:bg1", persona: "P01" };
    expect(problems(both)).toContain("exactly one of target");
  });

  test("more planted loans than n_loans", () => {
    expect(problems({ ...base(), n_loans: 100 })).toContain("more than n_loans (100)");
  });
});

describe("variations a held-out spec may use", () => {
  // ring tied by bank accounts only (no shared phone), a ring persona without a ring employer, two apartment
  // buildings, two households and two dealer bursts
  const variant = (): Spec => {
    const s = base();
    const r = ring(s);
    r.shared = r.shared.filter((x) => x.kind !== "phone");
    r.employers = r.employers.map((e) => ({ ...e, members: e.members.filter((m) => m !== "P14") })).filter((e) => e.members.length);
    s.patterns.splice(2, 0,
      { type: "shared_building", persona: "P03", background_members: 2, units: 96, proving_check: "check_address" },
      { type: "household", persona: "P09", spouse: { first_name: "MARA", last_name: "QUILL" }, proving_check: "household check" },
      { type: "dealer_burst", dealer: "D05", month: "2026-05", count: 12, history_month_end_share: 0.4, proving_check: "dealer_timeline" });
    return s;
  };

  test("each repeated pattern gets its own loans in the answer key", () => {
    const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
    const r = generate(write(variant()), tmp(), tmp());
    const key: AnswerKey = JSON.parse(readFileSync(join(r.keyDir, "answer_key.json"), "utf8"));
    const byId = new Map(r.normalized.map((l) => [l.loan_id, l]));
    const buildings = key.lookalikes.filter((x) => x.proving_check === "check_address");
    expect(buildings.map((b) => b.loan_ids.length)).toEqual([2, 3]);
    for (const b of buildings) expect(new Set(b.loan_ids.map((id) => byId.get(id)!.derived.address_key)).size).toBe(1);
    expect(new Set(buildings.flatMap((b) => b.loan_ids)).size).toBe(5);
    const households = key.lookalikes.filter((x) => x.proving_check.startsWith("household"));
    expect(households).toHaveLength(2);
    for (const h of households) expect(new Set(h.loan_ids.map((id) => byId.get(id)!.applicant_info.phone)).size).toBe(1);
    expect(key.dealer_bursts.map((b) => [b.dealer_id, b.loan_ids.length])).toEqual([["D05", 12], ["D01", 40]]);
    const p14 = byId.get(key.rings[0].loan_ids[2])!;
    expect(p14.employment_info.employer_name).toBe("Retired"); // its own, not undefined
  });

  test("data:check passes it end to end and prints no loan id", async () => {
    const checks = await checkSpec(write(variant()));
    expect(checks.filter((c) => !c.ok)).toEqual([]);
    expect(checks.map((c) => c.line).join("\n")).not.toMatch(/L\d{4}/);
  });

  test("data:check reports an invalid spec instead of throwing", async () => {
    const checks = await checkSpec(write({ ...base(), n_dealers: 0 }));
    expect(checks).toHaveLength(1);
    expect(checks[0]).toMatchObject({ ok: false });
    expect(checks[0].line).toContain("n_dealers");
  });
});
