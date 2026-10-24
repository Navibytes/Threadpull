// lib/contracts/tool-result.ts: shape, helpers, and staying in sync with the docs.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  SourceRefSchema, TOOL_NAMES, TOOL_SPECS, ToolResultSchema, toolError, toolOk, toolResultSchema,
} from "@/lib/contracts/tool-result";
import { z } from "zod";

const doc = (f: string) => readFileSync(join(import.meta.dir, "..", "docs", f), "utf8");
/** `| \`name(args)\` | acorns | …` rows of a markdown table → { name: acorns } */
function acornTable(md: string, acornCol: number): Record<string, number> {
  const rows = [...md.matchAll(/^\| `([a-z_]+)\([^`]*\)` \|(.*)$/gm)];
  return Object.fromEntries(rows.map((r) => [r[1], Number(r[2].split("|")[acornCol].trim().split(/[ ,]/)[0])]));
}

describe("docs and code agree on tools and costs", () => {
  test("SKELETON §7 table matches TOOL_SPECS", () => {
    const s = doc("SKELETON.md");
    const table = acornTable(s.slice(s.indexOf("## 7. Hazel's tools"), s.indexOf("## 8.")), 0);
    expect(table).toEqual(Object.fromEntries(TOOL_NAMES.map((n) => [n, TOOL_SPECS[n].acorns])));
  });
  test("TEAM_BRIEF tool table matches TOOL_SPECS", () => {
    const s = doc("TEAM_BRIEF.md");
    const table = acornTable(s.slice(s.indexOf("## 4. Hazel's tools"), s.indexOf("## 5.")), 2);
    expect(Object.keys(table).length).toBe(14); // every tool except close_lead is described there
    for (const [name, acorns] of Object.entries(table)) expect([name, acorns]).toEqual([name, TOOL_SPECS[name as keyof typeof TOOL_SPECS].acorns]);
  });
});

describe("source refs", () => {
  test("the SKELETON §8 example sources are valid", () => {
    for (const s of [{ kind: "crs", product: "tu_identity_verification", request_id: "3f955b9d" },
      { kind: "row", loan_id: "L0412", field: "applicant_info.phone" }])
      expect(SourceRefSchema.safeParse(s).success).toBe(true);
  });
  test("unknown kinds and missing fields are rejected", () => {
    expect(SourceRefSchema.safeParse({ kind: "vibes" }).success).toBe(false);
    expect(SourceRefSchema.safeParse({ kind: "row", loan_id: "L0001" }).success).toBe(false);
    expect(SourceRefSchema.safeParse({ kind: "lookup", name: "address_type", key: "x" }).success).toBe(false); // must say simulated or not
  });
});

describe("toolOk / toolError", () => {
  const src = [{ kind: "row" as const, loan_id: "L0037", field: "applicant_info.phone" }];
  test("cost always comes from TOOL_SPECS", () => {
    const r = toolOk("crs_identity_check", { codes: ["2201"] }, src);
    expect(r.cost).toEqual({ acorns: 3, unit: "1 CRS call" });
    expect(ToolResultSchema.parse(r)).toEqual(r);
  });
  test("a result without sources is refused", () => {
    expect(() => toolOk("check_address", {}, [])).toThrow("at least one source");
  });
  test("errors cost nothing and validate", () => {
    const r = toolError("crs_credit_report", "over budget");
    expect(r.ok).toBe(false);
    expect(r.cost.acorns).toBe(0);
    expect(ToolResultSchema.parse(r).error).toBe("over budget");
  });
  test("typed result schemas validate the payload", () => {
    const S = toolResultSchema(z.object({ units: z.number() }));
    expect(S.safeParse(toolOk("check_address", { units: 212 }, src, true)).success).toBe(true);
    expect(S.safeParse(toolOk("check_address", { units: "many" }, src, true)).success).toBe(false);
  });
});
