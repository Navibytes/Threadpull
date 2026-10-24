# 08: Document fingerprints and injection guard

**Owner:** A (Evidence)  
**Target:** H12, Sat 21:00

**What to build:** `compare_documents` finds recycled pay-stub templates with edited numbers across ring loans. A pay stub with hidden instructions is caught and logged, and it changes nothing.

**Blocked by:** 02 Seeded portfolio and answer key; 05 Hazel v1: the first ring, end to end

**Status:** in progress (A). Evidence logic done (PR #2 fingerprints, PR #3 injection guard); `attack_detected` payload ready; waiting on 05 for the Hazel wiring.

- [x] Fingerprint from template id, font and creating tool, plus arithmetic checks (net below gross, net/gross ratio, year-to-date consistent with pay periods and time at employer). `lib/evidence/documents.ts`
- [x] Returns a match score and the specific differences as sources, at 1 acorn per pair.
- [x] Deterministic guard: `scanDocument` flags instruction-like text and off-form lines; `safeDocumentView` gives Hazel only the form fields and withholds any field carrying instructions. `lib/evidence/injection.ts`
- [ ] Claude Haiku extracts pay-stub fields into a fixed Zod schema only (AI SDK structured output), fed from `safeDocumentView`, never raw text. Needs `ANTHROPIC_API_KEY`.
- [x] `attackEvent(doc)` builds the `attack_detected` event payload (`doc_id`, `rules`, `lines`, `unexpected_lines`, `invisible_characters`, `withheld_fields`) and its sources. No document text: event rows are read later by a model (CRO memo), so the injected words never enter the log. Tool-result sources and `safeDocumentView().scan` are text-free too; only `scanDocument().matches` keeps excerpts, for local debugging.
- [ ] The agent loop writes that payload as an `attack_detected` row (needs 05 and C's event schema on `main`).
- [x] `bun test`: the recycled template links all 15 ring pairs; the injected stub is caught on seeds 13, 7 and 21 with zero false alarms on every other document.
- [ ] `bun test` at agent level: a run over the injected loan changes no status (needs 05).

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
