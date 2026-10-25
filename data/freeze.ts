// The detector freeze (ticket 12): detection code is tagged `detector-frozen` before anyone runs on the held-out
// seed, and must not change after. `bun run freeze:check` says whether the tag exists and whether any detection file
// differs from it (committed or not); eval/hazel-run.ts refuses a held-out run unless it passes.
import { spawnSync } from "node:child_process";

export const FREEZE_TAG = "detector-frozen";
/** Everything that decides what Hazel finds: graph, checks, agent (prompt and tools), rules, CRS reading, budget, contracts. */
export const DETECTOR_PATHS = ["lib/graph", "lib/evidence", "lib/agent", "lib/rules", "lib/crs", "lib/ledger.ts", "lib/contracts"];

export type FreezeStatus =
  | { frozen: true; commit: string; changed: string[] } // changed: detection files that differ from the tag
  | { frozen: false; reason: string };

const git = (cwd: string, args: string[]) => {
  const r = spawnSync("git", args, { cwd, encoding: "utf8" });
  return { ok: r.status === 0, out: (r.stdout ?? "").trim() };
};

export function freezeStatus(cwd = process.cwd()): FreezeStatus {
  const tag = git(cwd, ["rev-parse", "--verify", "--quiet", `${FREEZE_TAG}^{commit}`]);
  if (!tag.ok) return { frozen: false, reason: `no ${FREEZE_TAG} tag in this checkout (git fetch --tags, or it hasn't been created yet)` };
  const committed = git(cwd, ["diff", "--name-only", FREEZE_TAG, "--", ...DETECTOR_PATHS]).out; // the tag vs the working tree
  const untracked = git(cwd, ["ls-files", "--others", "--exclude-standard", "--", ...DETECTOR_PATHS]).out;
  const changed = [...new Set([...committed.split("\n"), ...untracked.split("\n")].filter(Boolean))].sort();
  return { frozen: true, commit: tag.out.slice(0, 10), changed };
}

if (import.meta.main) {
  const s = freezeStatus();
  if (!s.frozen) {
    console.log(`✗ ${s.reason}.`);
    process.exit(1);
  }
  if (s.changed.length) {
    console.log(`✗ detection code differs from ${FREEZE_TAG} (${s.commit}):\n${s.changed.map((f) => `  - ${f}`).join("\n")}`);
    process.exit(1);
  }
  console.log(`✓ detection code matches ${FREEZE_TAG} (${s.commit}): ${DETECTOR_PATHS.join(", ")}`);
}
