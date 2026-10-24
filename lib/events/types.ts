// The board reads the shared event contract (lib/contracts/event.ts); these are the names it uses.
export { EVENT_TYPES, EventSchema, type EventType, type SourceRef } from "@/lib/contracts/event";
export type { Event as RunEvent } from "@/lib/contracts/event";
export type { LoanStatus } from "@/lib/contracts/loan";
export { LOAN_STATUSES } from "@/lib/contracts/loan";
