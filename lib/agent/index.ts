// lib/agent public API: Hazel's tools, her run loop and the run's event log (ticket 05).
export { createDataRoom, isHazelTool, runTool, TOOLS, type DataRoom, type HazelToolName } from "./tools";
export { runHazel, type HazelOptions, type HazelRun, type TraceEntry } from "./hazel";
export { clampNote, EventLog, jsonlSink, memorySink, supabaseSink, type EventSink, type EventsTable, type NewEvent } from "./event-log";
export { decideStatus, FRAUD_ALERT, HARD_CODES, type RunEvidence, type StatusDecision } from "./status";
export { FALLBACK_BETA, HAZEL_EFFORT, HAZEL_MAX_ITERATIONS, HAZEL_MODEL } from "./models";
