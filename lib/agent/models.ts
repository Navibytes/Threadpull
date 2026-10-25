// Which Claude model does what (CLAUDE.md stack). Change models here only.
export const HAZEL_MODEL = "claude-sonnet-5-5";
/** Multistep tool use starts at medium on Claude Sonnet 5.5 (levels recalibrated; re-measure before changing). */
export const HAZEL_EFFORT = "medium" as const;
export const HAZEL_MAX_TOKENS = 16_000;
/** The CRO memo (ticket 14) is written by the same model; a one-page structured answer needs no more than medium effort. */
export const MEMO_MODEL = HAZEL_MODEL;
export const MEMO_EFFORT = "medium" as const;
export const MEMO_MAX_TOKENS = 4_000;
/** A run stops after this many model requests even if Hazel still has calls to make. */
export const HAZEL_MAX_ITERATIONS = 40;
/** Server-side refusal fallback ("default" routing), Claude API only. */
export const FALLBACK_BETA = "server-side-fallback-2026-07-01";
