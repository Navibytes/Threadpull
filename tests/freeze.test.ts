// Ticket 12: the detector freeze. A held-out run needs detection code identical to the detector-frozen tag; any
// detection file changed after it (committed, uncommitted or new) is reported, and other files don't count.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { freezeStatus } from "@/data/freeze";

function repo() {
  const dir = mkdtempSync(join(tmpdir(), "tp-freeze-"));
  const git = (...args: string[]) => spawnSync("git", args, { cwd: dir, encoding: "utf8" });
  const put = (f: string, text: string) => { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), text); };
  git("init", "-q");
  git("config", "user.email", "test@example.invalid");
  git("config", "user.name", "test");
  put("lib/graph/weights.ts", "export const W = 1;\n");
  put("lib/agent/prompt.ts", "export const P = 'a';\n");
  put("components/card.tsx", "export {};\n");
  git("add", "-A");
  git("commit", "-qm", "detector");
  return { dir, git, put };
}

describe("detector freeze", () => {
  test("no tag: not frozen, and says why", () => {
    const { dir } = repo();
    const s = freezeStatus(dir);
    expect(s.frozen).toBe(false);
    if (!s.frozen) expect(s.reason).toContain("no detector-frozen tag");
  });

  test("tagged and untouched: frozen with nothing changed; UI changes after the tag don't count", () => {
    const { dir, git, put } = repo();
    git("tag", "detector-frozen");
    put("components/card.tsx", "export const changed = true;\n");
    git("commit", "-qam", "ui");
    expect(freezeStatus(dir)).toMatchObject({ frozen: true, changed: [] });
  });

  test("a detection file changed after the tag is reported: committed, uncommitted or new", () => {
    const { dir, git, put } = repo();
    git("tag", "detector-frozen");
    put("lib/graph/weights.ts", "export const W = 2;\n");
    git("commit", "-qam", "tune");
    put("lib/agent/prompt.ts", "export const P = 'b';\n"); // uncommitted
    put("lib/evidence/new-check.ts", "export {};\n"); // untracked
    expect(freezeStatus(dir)).toMatchObject({ frozen: true,
      changed: ["lib/agent/prompt.ts", "lib/evidence/new-check.ts", "lib/graph/weights.ts"] });
  });
});
