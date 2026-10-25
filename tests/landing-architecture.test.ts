// The landing page's architecture diagram must describe the real code: every module path exists, and the only parts
// marked as running a model are the ones that call Claude.
import { expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { PARTS } from "@/components/landing/architecture";

const ROOT = join(import.meta.dir, "..");

test("every path on the diagram exists in the repo", () => {
  for (const p of PARTS) for (const path of p.path.split(" · ")) expect(existsSync(join(ROOT, path)) ? "" : `${p.title}: ${path}`).toBe("");
});

test("Claude is marked exactly where a model is called: Hazel, the stub reader and the memo", () => {
  expect(PARTS.filter((p) => p.model).map((p) => p.id).sort()).toEqual(["cro", "hazel", "tools"]);
  const models = readFileSync(join(ROOT, "lib", "agent", "models.ts"), "utf8");
  expect(models).toContain('HAZEL_MODEL = "claude-sonnet-5-5"');
  expect(models).toContain("MEMO_MODEL = HAZEL_MODEL");
  expect(models).toContain("EXTRACT_MODEL");
});

test("the stack named on the diagram is what package.json depends on", () => {
  const pkg = readFileSync(join(ROOT, "package.json"), "utf8");
  for (const dep of ["graphology", "@xyflow/react", "@supabase/supabase-js", "@anthropic-ai/sdk", "zod", "@faker-js/faker", "next"]) expect(pkg).toContain(`"${dep}"`);
});
