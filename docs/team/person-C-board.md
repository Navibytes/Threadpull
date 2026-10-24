# Person C: Board

**Good fit:** Frontend

**Your stack:** Next.js + React + TypeScript, Tailwind + shadcn/ui + Motion, React Flow (corkboard), Supabase (project, migrations, RLS, Realtime subscription), Zod contracts in `lib/contracts/`, Bun.

**Your tickets, in order:**

| Ticket | Title | Target | Blocked by |
| --- | --- | --- | --- |
| 01 | Contracts and walking skeleton | Sat 12:00 | None |
| 09 | Investigator UI: filing drawer, corkboard and notebook | Sat 18:00 | 01, 05 |
| 12 | Detector freeze and held-out set | Sun 02:00 | 07, 08, 11 |
| 15 | bun run demo, replay and judge seed | Sun 04:00 | 09, 10 |

**Who waits on you:** Everyone codes against your contracts (01) from noon, so freeze them on time. You write no detection code: that's why you own the held-out set (12).

**First 30 minutes:**

1. `bunx create-next-app` (TypeScript, Tailwind, App Router), `bunx shadcn init`, and the Supabase project; share the URL and anon key, keep the service-role key server-only. `.env*` and data outputs gitignored.
1. Write the Zod schemas for loan record, tool result and event (SKELETON §5.1, §7, §8) in `lib/contracts/` and post them to the team. A has a draft loan schema.
1. Hand-write a sample run with every event type, insert it into `events`, and render it over Realtime so you can build the board before Hazel exists.

**While you're blocked:** Build 09 against the sample log while waiting for 05; switch to the live stream when it lands. Help A with the falling-string animation (07).

**Heads-up:** the repo already has `data/` (A) at the root; create the Next.js app at the repo root too, so `lib/` and `data/` sit side by side.

**Team checkpoints:** Sat 12:00 contracts frozen · Sat 21:00 one full rough run · Sun 04:00 feature freeze · Sun 08:00 submit (hard deadline 08:50).

Tickets live in `../tickets/`; the full spec is `../SKELETON.md`; the folder map is `../ARCHITECTURE.md`.
