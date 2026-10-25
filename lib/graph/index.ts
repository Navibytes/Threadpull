// lib/graph public API: the typed, weighted evidence graph (SKELETON §6) and find_connections (§7).
export { buildGraph, EvidenceGraph, type Cluster, type Lead } from "./graph";
export { findConnections, type AttributeSummary, type EntityConnections, type LoanConnections, type Neighbor } from "./find-connections";
export {
  attributesOf, baseWeight, CLUSTER_MIN_SCORE, entityId, HOUSEHOLD_FADE, householdEvidence, LINK_MIN_WEIGHT,
  PERSONAL_FULL_UNTIL, PERSONAL_KINDS, yarnPx,
} from "./weights";
