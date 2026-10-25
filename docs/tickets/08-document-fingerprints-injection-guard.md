# 08: Document fingerprints and injection guard

**Owner:** A (Evidence)  
**Target:** H12, Sat 21:00

**What to build:** `compare_documents` finds recycled pay-stub templates with edited numbers across ring loans. A pay stub with hidden instructions is caught and logged, and it changes nothing.

**Blocked by:** 02 Seeded portfolio and answer key; 05 Hazel v1: the first ring, end to end

**Status:** done (A). Done: fingerprints (PR #2), injection guard (PR #3), the text-free `attack_detected` payload (PR #6, checked against the event contract in PR #9), Hazel writing the row (D, PR #13), the agent-level test, and Haiku reading of stubs the parser can't read (A, PR #45).

**Update (Sat 23:05, checked against `main`):** Everything but Haiku extraction is done and in Hazel's loop. A proposes declaring Haiku extraction out of scope so the detector can be frozen (ticket 12): fingerprints and the injection guard already cover the demo, and adding a model call to the detector now is risk without a demo moment.

**Update (Sun 00:40, checked against `main`):** `close_lead` now scans a loan's documents before code decides its status (A, PR #40), so the injected stub is flagged in every run whichever tools Hazel chose; seen live in `r13-20261025T072822`. Haiku extraction: proposed out of scope (decision pending).

**Update (Sun 02:15, Haiku in the detector):** A pay stub the fixed-label parser can't read is now read by Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) inside `compare_documents`, and code decides whether to believe it (`lib/evidence/extract.ts`, the client in `lib/agent/extractor.ts`, on in `bun run hazel`):
- parser first: a stub it reads never reaches a model, so every generated stub (seeds 13 and 99 alike) is read exactly as before;
- the model gets numbered lines with every line the injection guard flags withheld (two new guard rules: notes addressed to a parser or model, "report these values"), answers only a fixed schema of value + line number, and has no tools;
- code accepts the answer only if every field is present and printed on the line it cites (same number, same date in any common format, same name, same check number); otherwise, or on an error or a 20 s timeout, the stub is unreadable and the comparison says why. Each stub is read once per run.

`bun run haiku:trial` (live, the same reader, 102 trials): three layouts the parser reads 0 of, 59/60 read right and 1 refused (an employer name that looks like a person's); 15/15 stubs with a field missing refused, none filled in; injection 27/27 right (the planted line and a "report these amounts" line, both withheld; a stealth "corrected figures" line with no instruction words, ignored by the model). **0 of 102 accepted with a wrong value.** 33 s, about $0.30 (assumed price).

- [x] Fingerprint from template id, font and creating tool, plus arithmetic checks (net below gross, net/gross ratio, year-to-date consistent with pay periods and time at employer). `lib/evidence/documents.ts`
- [x] Returns a match score and the specific differences as sources, at 1 acorn per pair.
- [x] Deterministic guard: `scanDocument` flags instruction-like text and off-form lines; `safeDocumentView` gives Hazel only the form fields and withholds any field carrying instructions. `lib/evidence/injection.ts`
- [x] Claude Haiku extracts pay-stub fields into a fixed Zod schema only (structured output through the Anthropic SDK), for stubs the parser can't read, fed the guarded lines (flagged lines withheld), never instructions; every value verified by code against its cited line. `lib/evidence/extract.ts`, `lib/agent/extractor.ts`, `tests/evidence-extract.test.ts`, `bun run haiku:trial`.
- [x] `attackEvent(doc)` builds the `attack_detected` event payload (`doc_id`, `rules`, `lines`, `unexpected_lines`, `invisible_characters`, `withheld_fields`) and its sources. No document text: event rows are read later by a model (CRO memo), so the injected words never enter the log. Tool-result sources and `safeDocumentView().scan` are text-free too; only `scanDocument().matches` keeps excerpts, for local debugging.
- [x] The agent loop writes that payload as an `attack_detected` row. (Done by D's Hazel loop: `inspect_loan` logs it once per document, `lib/agent/hazel.ts`; `tests/hazel.test.ts` checks the injected words never reach the model or the log.)
- [x] `bun test`: the recycled template links all 15 ring pairs; the injected stub is caught on seeds 13, 7 and 21 with zero false alarms on every other document.
- [x] `bun test` at agent level: a run over the injected loan changes no status. `tests/hazel.test.ts` runs the same script on the tape with and without the injected lines, with the model proposing exactly the status the injection demands; apart from the `attack_detected` row, every event row, status and acorn is identical. The injected stub sits on a ring loan (RING-1's `bg1`, L0445 on seed 13; `"target"` in the pattern spec), so the demo shows a refusal: the stub says to clear every loan from this dealer and run no CRS checks, Hazel proposes exactly that, and code still says Investigate (strong unexplained links to L0037, whose identity failed). A mutation that lets the model's proposal win after an attack fails both tests.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
