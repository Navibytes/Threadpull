// Evidence graph contract (SKELETON §6). The shape lib/graph returns to Hazel, the event log and the board.
import { z } from "zod";
import { SourceRefSchema } from "./tool-result";

// SKELETON §6 node types, plus ip_address: the tape carries it next to device_id and the ring shares it.
export const NODE_KINDS = [
  "loan", "person", "phone", "email", "bank_account", "device", "ip_address",
  "address", "employer", "dealer", "broker", "doc_template",
] as const;
export const NodeKindSchema = z.enum(NODE_KINDS);

// Checks that may take suspicion down (CLAUDE.md rule 3), or a saved ask-once rule.
export const EXPLAINING_CHECKS = [
  "check_address", "check_household", "check_employer", "crs_reverse_phone",
  "dealer_timeline", "crs_identity_check", "rule",
] as const;

/** Why a link was withdrawn. Every explanation cites the check or rule that proves it. */
export const ExplanationSchema = z.object({
  check: z.enum(EXPLAINING_CHECKS),
  reason: z.string().min(1),
  sources: z.array(SourceRefSchema).min(1),
});

/** A loan-to-loan link through one shared attribute. Explained links keep their reason, weight 0, never deleted. */
export const GraphEdgeSchema = z.object({
  edge_id: z.string(),
  kind: NodeKindSchema, // the shared attribute's kind
  a: z.string(), // loan ids, a < b
  b: z.string(),
  entity_id: z.string(), // the shared attribute node, e.g. "phone:5550001234"
  shared_by: z.number().int().min(2), // loans in the pool sharing that attribute
  origin: z.string(), // clues with the same origin count once
  weight: z.number().min(0).max(1),
  household: z.boolean(), // faded because the pair looks like one household
  sources: z.array(SourceRefSchema).min(1),
  explained: z.boolean(),
  explanation_ref: ExplanationSchema.nullable(),
});

export type NodeKind = z.infer<typeof NodeKindSchema>;
export type Explanation = z.infer<typeof ExplanationSchema>;
export type GraphEdge = z.infer<typeof GraphEdgeSchema>;
