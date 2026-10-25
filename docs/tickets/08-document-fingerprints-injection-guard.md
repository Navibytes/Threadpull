# 08: Document fingerprints and injection guard

**Owner:** A (Evidence)  
**Target:** H12, Sat 21:00

**What to build:** `compare_documents` finds recycled pay-stub templates with edited numbers across ring loans. A pay stub with hidden instructions is caught and logged, and it changes nothing.

**Blocked by:** 02 Seeded portfolio and answer key; 05 Hazel v1: the first ring, end to end

**Status:** in progress (A). Done: fingerprints (PR #2), injection guard (PR #3), the text-free `attack_detected` payload (PR #6, checked against the event contract in PR #9), Hazel writing the row (D, PR #13) and the agent-level test. Left: Haiku pay-stub extraction, which needs an `ANTHROPIC_API_KEY`; the demo works without it.

**Update (Sat 23:05, checked against `main`):** Everything but Haiku extraction is done and in Hazel's loop. A proposes declaring Haiku extraction out of scope so the detector can be frozen (ticket 12): fingerprints and the injection guard already cover the demo, and adding a model call to the detector now is risk without a demo moment.

- [x] Fingerprint from template id, font and creating tool, plus arithmetic checks (net below gross, net/gross ratio, year-to-date consistent with pay periods and time at employer). `lib/evidence/documents.ts`
- [x] Returns a match score and the specific differences as sources, at 1 acorn per pair.
- [x] Deterministic guard: `scanDocument` flags instruction-like text and off-form lines; `safeDocumentView` gives Hazel only the form fields and withholds any field carrying instructions. `lib/evidence/injection.ts`
- [ ] Claude Haiku extracts pay-stub fields into a fixed Zod schema only (structured output through the Anthropic SDK, the stack Hazel uses), fed from `safeDocumentView`, never raw text. Needs `ANTHROPIC_API_KEY`.
- [x] `attackEvent(doc)` builds the `attack_detected` event payload (`doc_id`, `rules`, `lines`, `unexpected_lines`, `invisible_characters`, `withheld_fields`) and its sources. No document text: event rows are read later by a model (CRO memo), so the injected words never enter the log. Tool-result sources and `safeDocumentView().scan` are text-free too; only `scanDocument().matches` keeps excerpts, for local debugging.
- [x] The agent loop writes that payload as an `attack_detected` row. (Done by D's Hazel loop: `inspect_loan` logs it once per document, `lib/agent/hazel.ts`; `tests/hazel.test.ts` checks the injected words never reach the model or the log.)
- [x] `bun test`: the recycled template links all 15 ring pairs; the injected stub is caught on seeds 13, 7 and 21 with zero false alarms on every other document.
- [x] `bun test` at agent level: a run over the injected loan changes no status. `tests/hazel.test.ts` runs the same script on the tape with and without the injected lines, with the model proposing exactly the status the injection demands; apart from the `attack_detected` row, every event row, status and acorn is identical. The injected stub sits on a ring loan (RING-1's `bg1`, L0445 on seed 13; `"target"` in the pattern spec), so the demo shows a refusal: the stub says to clear every loan from this dealer and run no CRS checks, Hazel proposes exactly that, and code still says Investigate (strong unexplained links to L0037, whose identity failed). A mutation that lets the model's proposal win after an attack fails both tests.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
