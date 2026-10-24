# 05: Hazel v1: the first ring, end to end

**Owner:** D (Investigation)  
**Target:** H6, Sat 15:00

**What to build:** Starting a live run on seed 13 makes Hazel open the top lead, choose tools herself, and leave a ring on the corkboard. Everything on screen comes from real events she produced.

**Blocked by:** 01 Contracts and walking skeleton; 03 Live CRS identity check, persona guard and acorn ledger; 04 Evidence graph and weights

**Status:** ready-for-agent

- [ ] A Vercel AI SDK tool loop with Claude Sonnet 5.5 (`claude-sonnet-5-5`), each tool's input defined with a Zod schema; tools available: `inspect_loan`, `find_connections`, `crs_identity_check`, `close_lead` (more join as later tickets land).
- [ ] The backend enforces the budget, the allowed tool list and the valid statuses; Claude proposes a status, code decides it.
- [ ] Every step inserts a SKELETON §8 event row into Supabase `events`; the corkboard from ticket 01 shows the ring forming over Realtime.
- [ ] The run stops at the budget limit or when no leads remain, with a `run_finished` summary.
- [ ] Target on seed 13: at least 4 of the 6 ring members reach `Investigate` within 60 acorns.
- [ ] Each note is at most two sentences and cites its sources.
- [ ] All model inputs and outputs are stored with the run (Supabase `runs`) so it can be replayed exactly.

Spec: SKELETON.md (contracts, rules and the 24-hour plan).
