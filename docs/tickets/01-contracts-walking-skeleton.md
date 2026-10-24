# 01: Contracts and walking skeleton

**Owner:** C (Board)
**Target:** H3, Sat 12:00

**What to build:** Any teammate can start the Next.js app with one command against a shared Supabase project. Inserting a hand-written sample run into the `events` table makes loan cards plus one yarn thread appear on a bare corkboard through Supabase Realtime. The Zod schemas for a loan record, a tool result and an event (SKELETON §5.1, §7, §8) live in `lib/contracts/` and are imported by both server and client, so everyone else codes against them from noon.

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `bun install && bun run dev` starts the Next.js app (TypeScript, Tailwind, shadcn/ui initialised) locally.
- [ ] Supabase project created; migrations in `supabase/migrations/` for `runs`, `events` (insert-only), `rules`, `questions`, `dispositions`; RLS on, browser uses the anon key, server code uses the service-role key.
- [ ] Starting a run in replay mode inserts the sample events in order and the board receives them over Realtime.
- [ ] The corkboard draws a card for each loan in `lead_opened` / `link_found` events and a thread for each `link_found`, thickness `1 + 8 × weight`.
- [ ] Zod schemas (and inferred TS types) exist for loan record, tool result and event; the sample run contains at least one event of every type in SKELETON §8 and validates against the schema.
- [ ] `.env` and generated data are gitignored from the first commit; an example env file lists every needed key without values.
- [ ] README stub explains how to run it; `bun test` runs (even if it has few tests yet).
- [ ] Contracts announced to the team as frozen at 12:00; later changes are posted in the team chat first.

**Notes:** This is the integration spine: keep it boring. No styling beyond what's needed to see cards and threads.

Spec: `docs/SKELETON.md` (contracts, rules and the 24-hour plan). Where code goes: `docs/ARCHITECTURE.md`.
