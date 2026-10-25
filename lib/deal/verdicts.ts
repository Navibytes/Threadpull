// Verdicts (ticket 10, TEAM_BRIEF section 6): what the CRO screen proposes once a loan's investigation ends.
//   Clear     no unexplained signals            in the bid at base price
//   Reprice   a real borrower, credit risk only in the bid at a lower price
//   Review    conflicting evidence, partial data, a fraud alert, an open question: out of the bid until one named person answers
//   Exclude   a hard fraud signal or confirmed ring membership: removed, and a buyback demand is drafted to the dealer
// Code decides these from Hazel's status and the reason the code gave for it (lib/agent/status.ts). A verdict is a proposal
// for a person, never an accusation.
import { z } from "zod";
import type { LoanStatus } from "@/lib/contracts/loan";

export const VERDICTS = ["Clear", "Reprice", "Review", "Exclude"] as const;
export type Verdict = (typeof VERDICTS)[number];
export const VerdictSchema = z.enum(VERDICTS);

export type ReasonKind = "hard_identity" | "ring_link" | "fraud_alert" | "open_question" | "soft_link" | "other";

// These match the reasons decideStatus writes in lib/agent/status.ts; tests/deal-verdicts.test.ts fails if that file is reworded.
export const REASON_PATTERNS: { kind: ReasonKind; pattern: RegExp }[] = [
  { kind: "hard_identity", pattern: /^TransUnion identity:/ },
  { kind: "fraud_alert", pattern: /^fraud alert on file/ },
  { kind: "ring_link", pattern: /^strong unexplained links? .*whose identity failed/ },
  { kind: "open_question", pattern: /^waiting on a question/ },
  { kind: "soft_link", pattern: /^strong unexplained link/ },
];

export function reasonKind(reason: string | null | undefined): ReasonKind {
  return REASON_PATTERNS.find((p) => p.pattern.test(reason ?? ""))?.kind ?? "other";
}

/** Statuses that put a loan's balance "under review" (SKELETON section 3). */
export const FLAGGED_STATUSES: readonly (LoanStatus | string)[] = ["Investigate", "Insufficient evidence"];

export function verdictFor(input: { status: LoanStatus; reason?: string | null; score?: number | null; topTierMin: number }): Verdict {
  switch (input.status) {
    case "Investigate": {
      const kind = reasonKind(input.reason);
      return kind === "hard_identity" || kind === "ring_link" ? "Exclude" : "Review";
    }
    case "Insufficient evidence":
      return "Review";
    default: // No material anomaly found, Not reviewed, Human-confirmed disposition (its verdict comes from the disposition)
      return input.score != null && input.score < input.topTierMin ? "Reprice" : "Clear";
  }
}

/** A verdict that keeps the loan out of the bid. */
export const outOfBid = (v: Verdict) => v === "Exclude" || v === "Review";
