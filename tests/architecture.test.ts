// Import rules from docs/ARCHITECTURE.md §4 (the ones marked 🔒).
import { describe, expect, test } from "bun:test";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = join(import.meta.dir, "..");
const walk = (d: string): string[] =>
  !existsSync(d) ? [] : readdirSync(d).flatMap((f) => {
    const p = join(d, f);
    return statSync(p).isDirectory() ? walk(p) : /\.(ts|tsx)$/.test(f) ? [p] : [];
  });
const src = (...dirs: string[]) => dirs.flatMap((d) => walk(join(ROOT, d)));
const imports = (file: string) =>
  [...readFileSync(file, "utf8").matchAll(/(?:import|export)[^"']*?from\s+["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g)]
    .map((m) => m[1] ?? m[2]);
const rel = (f: string) => relative(ROOT, f);

describe("architecture rules", () => {
  test("lib/contracts imports nothing but zod", () => {
    for (const f of src("lib/contracts"))
      for (const i of imports(f)) expect(i === "zod" || i.startsWith("./") ? "" : `${rel(f)} -> ${i}`).toBe("");
  });

  test("lib never imports React, app/ or components/", () => {
    for (const f of src("lib"))
      for (const i of imports(f))
        expect(/^(react|react-dom|next\/)|@\/(app|components)\//.test(i) ? `${rel(f)} -> ${i}` : "").toBe("");
  });

  test("only eval/ reads the answer keys", () => {
    for (const f of src("lib", "app", "components", "data"))
      expect(/answer_key|data\/keys/.test(readFileSync(f, "utf8")) && !rel(f).startsWith("data/generate")
        ? rel(f) : "").toBe("");
  });

  test("detection code never reads persona_id", () => {
    for (const f of src("lib/graph", "lib/evidence", "lib/agent", "lib/rules"))
      expect(readFileSync(f, "utf8").includes("persona_id") ? rel(f) : "").toBe("");
  });

  test("components never import server-only modules", () => {
    for (const f of src("components"))
      for (const i of imports(f))
        expect(/@\/lib\/(crs|agent|ledger|db\/server)/.test(i) ? `${rel(f)} -> ${i}` : "").toBe("");
  });
});
