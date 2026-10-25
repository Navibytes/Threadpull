// Ticket 10: verdicts follow the brief's table, and the reasons they read are the ones lib/agent/status.ts writes.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { LoanStatus } from "@/lib/contracts/loan";
import { reasonKind, verdictFor } from "@/lib/deal";
import { REASON_PATTERNS } from "@/lib/deal/verdicts";

describe("reasons, as decideStatus writes them", () => {
  test("each known reason is recognised", () => {
    expect(reasonKind("TransUnion identity: 2201 + 2202 + 2101")).toBe("hard_identity");
    expect(reasonKind("TransUnion identity: 2301")).toBe("hard_identity");
    expect(reasonKind("fraud alert on file: needs the CRO")).toBe("fraud_alert");
    expect(reasonKind("strong unexplained links (phone, employer) to L0037, whose identity failed")).toBe("ring_link");
    expect(reasonKind("strong unexplained link to L0037, whose identity failed")).toBe("ring_link");
    expect(reasonKind("waiting on a question to a person")).toBe("open_question");
    expect(reasonKind("strong unexplained link to L0412 (pair score 0.8)")).toBe("soft_link");
    expect(reasonKind("identity verified; no strong unexplained link")).toBe("other");
    expect(reasonKind(null)).toBe("other");
  });

  test("a failed-identity link is not mistaken for a plain strong link, and a plain strong link is still found", () => {
    expect(reasonKind("strong unexplained link to L0001 (pair score 0.5)")).toBe("soft_link");
    expect(reasonKind("strong unexplained links (phone) to L0001, whose identity failed")).toBe("ring_link");
  });

  test("drift guard: every phrase the verdicts rely on is still in lib/agent/status.ts", () => {
    const source = readFileSync(join(import.meta.dir, "..", "lib", "agent", "status.ts"), "utf8");
    for (const phrase of ["TransUnion identity:", "fraud alert on file", "whose identity failed", "waiting on a question", "strong unexplained link"])
      expect(source).toContain(phrase);
    expect(REASON_PATTERNS.map((p) => p.kind).sort()).toEqual(["fraud_alert", "hard_identity", "open_question", "ring_link", "soft_link"]);
  });
});

describe("verdicts", () => {
  const v = (status: LoanStatus, reason?: string, score?: number | null) => verdictFor({ status, reason, score, topTierMin: 720 });

  test("a hard identity failure or a link to one: Exclude", () => {
    expect(v("Investigate", "TransUnion identity: 2201 + 2202")).toBe("Exclude");
    expect(v("Investigate", "strong unexplained links (phone) to L0037, whose identity failed")).toBe("Exclude");
  });
  test("a fraud alert, an open question or an unconfirmed link: Review, not Exclude", () => {
    expect(v("Investigate", "fraud alert on file: needs the CRO")).toBe("Review");
    expect(v("Investigate", "waiting on a question to a person")).toBe("Review");
    expect(v("Investigate", "strong unexplained link to L0412 (pair score 0.8)")).toBe("Review");
  });
  test("partial or conflicting data: Review", () => {
    expect(v("Insufficient evidence", "frozen bureau")).toBe("Review");
  });
  test("no anomaly: Clear, or Reprice when the score is below the best tier", () => {
    expect(v("No material anomaly found")).toBe("Clear");
    expect(v("No material anomaly found", "x", 790)).toBe("Clear");
    expect(v("No material anomaly found", "x", 720)).toBe("Clear");
    expect(v("No material anomaly found", "x", 719)).toBe("Reprice");
    expect(v("No material anomaly found", "x", 540)).toBe("Reprice");
  });
  test("a loan nobody investigated is Clear at base price, never Exclude", () => {
    expect(v("Not reviewed")).toBe("Clear");
  });
  test("a risky score never excludes by itself", () => {
    expect(v("No material anomaly found", "x", 300)).toBe("Reprice");
  });
});
