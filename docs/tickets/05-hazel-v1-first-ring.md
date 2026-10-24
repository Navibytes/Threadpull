# 05: Hazel v1: the first ring, end to end

**Owner:** D (Investigation)
**Target:** H6, Sat 15:00

**What to build:** Starting a live run on seed 13 makes Hazel open the top lead, choose tools herself, and leave a ring on the corkboard. Everything on screen comes from real events she produced.

**Blocked by:** 01 Contracts and walking skeleton; 03 Live CRS identity check, persona guard and acorn ledger; 04 Evidence graph and weights

**Status:** in-progress (Python loop exists; TypeScript agent, CRS adapter, event persistence, and end-to-end integration remain)

- [x] A Python tool-use loop and Anthropic SDK adapter exist in `backend/agent.py`; the loop enforces its tool allowlist, budget, and backend-owned statuses.
- [x] The Python run writes event and model-trace JSONL, stops at budget/no leads, and bounds notes with sources.
- [ ] Port the agent loop and tools to `lib/agent` using the current TypeScript contracts and Claude/Vercel AI SDK architecture.
- [ ] Use the issue 03 guarded CRS client and the issue 04 graph over generated seed 13 data; verify the 4-of-6 target within 60 acorns.
- [ ] Persist each SKELETON §8 event and model trace through the configured storage/event path so the board can render only recorded events.

The TypeScript portfolio generator and loan contract are now available from main. The existing Python prototype uses the earlier flat loan shape and injected identity adapter; it is useful as behavior reference, not yet wired to the current dataset or application.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
