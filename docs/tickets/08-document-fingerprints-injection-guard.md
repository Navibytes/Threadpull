# 08: Document fingerprints and injection guard

**Owner:** A (Evidence)  
**Target:** H12, Sat 21:00

**What to build:** `compare_documents` finds recycled pay-stub templates with edited numbers across ring loans. A pay stub with hidden instructions is caught and logged, and it changes nothing.

**Blocked by:** 02 Seeded portfolio and answer key; 05 Hazel v1: the first ring, end to end

**Status:** ready-for-agent

- [ ] Fingerprint from template id, font, creating tool, layout and text features, plus arithmetic checks (gross minus deductions equals net; year-to-date consistent with pay periods).
- [ ] Returns a match score and the specific differences as sources, at 1 acorn per pair.
- [ ] Claude Haiku extracts pay-stub fields into a fixed Zod schema only (AI SDK structured output); instruction-like text produces an `attack_detected` event.
- [ ] `bun test`: the injected pay stub does not change any status; the recycled template links the ring loans.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
