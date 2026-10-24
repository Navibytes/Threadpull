# Person B: Verification

**Good fit:** Backend

**Your stack:** TypeScript server code in Next.js route handlers (`lib/crs/`, `lib/ledger.ts`, `lib/deal/`), Zod for CRS request/response bodies, Supabase (`crs_cache`, `dispositions`), shadcn/ui for the CRO screen, Claude Sonnet 5.5 via the Vercel AI SDK for the memo, `bun test`.

**Your tickets, in order:**

| Ticket | Title | Target | Blocked by |
| --- | --- | --- | --- |
| 03 | Live CRS identity check, persona guard and acorn ledger | Sat 12:00 | None |
| 06 | More CRS tools and recovery cases | Sat 15:00 | 03 |
| 10 | CRO screen and deal engine | Sun 00:00 | 05 |
| 14 | CRO memo and "why" answers | Sun 03:00 | 10 |

**Who waits on you:** D's Hazel loop (05) needs 03. A's explanation checks (07) need 06. C's demo command (15) needs 10.

**First 30 minutes:**

1. Get the CRS sandbox credentials (calhacks.crscreditapi.com or the CRS booth) and put them in `.env.local` only (no `NEXT_PUBLIC_` prefix).
1. Log in once by hand and keep the token; never loop on a failed login.
1. Done by A (2026-10-24): login works and the P13 identity call returns 2201 + 2202 + 2101. Verified codes: P12 = P13; P14 2301 + 2101; P16 2401; P01, P15 none. The SSN-issuance, `riskIndicator` and KMSG07 fields are identical for every persona, so ignore them.
1. Wrap that call in `lib/crs/` first, then build on it. Build bodies from `data/personas.json` matched by SSN.

**While you're blocked:** Between 15:00 and 21:00, once 06 is done: start the deal engine math (10) against the generated portfolio so the CRO screen only needs wiring when 05 lands.

**Team checkpoints:** Sat 12:00 contracts frozen · Sat 21:00 one full rough run · Sun 04:00 feature freeze · Sun 08:00 submit (hard deadline 08:50).

Tickets live in `../tickets/`; the full spec is `../SKELETON.md`; the folder map is `../ARCHITECTURE.md`.
