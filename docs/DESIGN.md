# Threadpull: design handoff for the landing page

Written for: a teammate (and their Claude Code) building Threadpull's landing page, who has not seen the app.
Read this first, then `CLAUDE.md` (hard rules) and `docs/TEAM_BRIEF.md` (the why). If they disagree, `docs/SKELETON.md` wins on contracts and this file wins on look and feel.

## 1. What Threadpull is

An AI fraud investigator for banks that buy auto-loan portfolios. The agent, **Hazel** (a detective squirrel), pulls threads through an evidence graph of 1,000 loans, spends a small verification budget on the CRS Credit API, **takes suspicion back down when she finds an innocent explanation**, and ends with a finished acquisition decision for the Chief Risk Officer: exclusions, buyback demands, a revised bid.

- Tagline: **Find the ring. Protect the innocent. Decide the deal.**
- Opening line: Upload the loan tape. We tell you which borrowers don't exist, which ones only look suspicious, and how much less to pay.
- Closing line: We don't just connect the evidence. We know when to take a connection down.
- Audience: a fraud investigator on a bank's due-diligence team, then the CRO who approves the money decision. Judges at Cal Hacks 13.0 (sponsors: Hyphenate, CRS, Anthropic, Microsoft).
- Avoid saying "the AI decides" or "replaces the team". Hazel recommends; a human approves.

### The demo moment (a landing page can tell this story)
1. Loan #37: a live CRS identity check says the SSN doesn't match the name and date of birth. A real SSN under a made-up identity.
2. Threads spread through a shared rare phone and a recycled pay-stub template to 4 more loans at one dealer: a ring.
3. Two borrowers share an address. One check shows a 212-unit apartment building, so that thread **falls**. This is the differentiator.
4. Budget meter: the ring is found for X acorns versus Y to check everything. Only real measured numbers go on screen.
5. CRO screen: exclusions, buyback demands, revised bid, Approve.

## 2. Truth rules for anything on screen (read before writing copy)

- **Only real numbers.** No invented stats, customer counts, logos or testimonials. Costs and comparisons come from actual runs (`docs/PROOF.md`); assumed prices must say "assumed".
- **A connection is not proof.** Output is a recommendation for human review, never an adverse action on a consumer.
- **No location-only signals** (ZIP or neighbourhood alone is never evidence). Fair-lending proxy risk.
- **Sandbox personas and synthetic data only.** No real people's information anywhere. Do not use real faces or names.
- **Data labelling:** the app's board used to show PREVIEW and SIMULATED labels on synthetic data; they were removed for the demo look in commit `2339a3e`. Anything on the landing page that shows the board must be honest about it: use a screenshot or video of a real recorded run, or label it as a demonstration. Restore the in-app labels before showing judges the board.
- Status words are exact: **Investigate · No material anomaly found · Insufficient evidence · Human-confirmed disposition.** Portfolio actions: **Exclude / Reprice / Protect.**

## 3. Visual language: a cosy detective's room

The product is a physical scene, not a dashboard: a large corkboard in a walnut frame, paper cards pinned with red yarn, a squirrel detective standing on a ledge. The landing page should feel like the same room, **warm paper, cork, walnut and brass, never glossy SaaS.**

### Palette (CSS tokens in `app/globals.css`, Tailwind v4 `@theme`)
| Token | Hex | Use |
|---|---|---|
| `cream` | `#f3e9dc` | page ground, light text on dark |
| `paper` | `#fffbf4` | cards, labels |
| `cork` / `cork-deep` | `#d9be9c` / `#c4a47f` | board, kraft surfaces |
| `walnut` | `#4a3728` | all body text, frame wood |
| `milk` | `#8b6f55` | large or decorative text only (not small text: contrast) |
| `terracotta` | `#b5533c` | accent, active underline, the red thread |
| `sage` | `#8fa67e` | "explained / resolved" (a thread taken down) |
| `dusty` | `#7b91a6` | secondary accent |
| `honey` / `amber` | `#d9a441` / `#f0c27e` | brass, lamp light, highlights |
| `ink` | `#1d140e` | the dark desk |

The in-app wall is a pale yellow `#f7f0c8` with a very faint ornament pattern (96×132 SVG tile, strokes at ~16% opacity). Reuse it so the landing page and the app match.

### Type (loaded in `app/layout.tsx` via `next/font/google`)
- **Fraunces** (`font-display`): headlines, the wordmark, card titles. Warm serif.
- **IBM Plex Sans** (`font-sans`, 400/500/600): everything else. Tabular numerals on.
- **Caveat** (`font-hand`): handwriting for small notes only (sticky notes, margin notes). Never for functional labels or long text.

### Materials and textures (in `public/assets/detective/`)
`cork-dark.webp`, `wood-walnut.webp`, `paper-aged.webp`. Every rule keeps a plain CSS fallback colour under the image so a missing texture degrades gracefully. Reuse these; do not generate or download imagery without asking.

### Recurring components (classes in `app/globals.css`)
- `.board-frame`: bevelled walnut frame around the cork. `.paper-tab` / `.paper-sheet`: kraft or paper tabs with irregular edges and a back sheet. `.brass-plate`: gradient brass for controls. `.folder` (manila case folder with a LEAD tab) and `.index-ruled` (ruled index card). `.sticky-note` (Caveat handwriting). `.tape` (translucent masking tape). `.ink-stamp` (rubber stamp). Pushpins in red (suspicion) or brass (explained fact).
- **Yarn:** red = suspicion, thickness = rarity weight (`1 + 8 × weight` px). When a thread is explained it retracts, leaving a pale dashed line and a sage tag. This "thread falls" moment is the best single animation to feature.
- Shadows are gentle and physical. Slight tilts (about 1°) on paper. No gradients-on-gradients, no rounded SaaS pills, no neon.

### Hazel
Four original sprites in `public/hazel/` (1219×1290 PNG, transparent): `hazel-idle`, `hazel-thinking`, `hazel-discovery`, `hazel-resolved`. Keep her original artwork; do not redraw, recolour or invent new poses. Whole-sprite motion only (slow breathing, an occasional sway, a hop at a discovery, a nod at an explanation). Components: `components/notebook/hazel-avatar.tsx` and `hazel-standing.tsx`. Respect `prefers-reduced-motion`.

### Motion principles
Purposeful, short (under about 300 ms for UI), strong ease-out (`cubic-bezier(0.23, 1, 0.32, 1)`), animate `transform` and `opacity` only, never `transition: all`, gentle not bouncy, reduced motion keeps opacity and drops movement. Every in-app animation is driven by a recorded event row; on a landing page, scripted animation is fine but should echo the same moves (thread draws in, pin drops, thread falls).

## 4. Layout and responsiveness
- The app is built and tested at **1280×720, 1440×900 and 1920×1080**; below 900px nav collapses to icons. The landing page must work at phone width too (about 400px, 16px minimum side gutter, no horizontal scroll).
- Keep readable text at 12px or more as rendered; body 16px.
- Accessibility: visible focus states, accessible names on every control, contrast of 4.5:1 for small text (use `walnut` on paper/cream, not `milk`).

## 5. Suggested landing-page shape (a proposal, adjust freely)
1. **Hero:** wordmark, tagline, the opening line, one calm primary action (open the demo), and a framed corkboard shot with Hazel standing at the corner. Pale yellow wall with the faint pattern.
2. **The three promises**, one per tagline phrase: *find the ring* (a thread spreading across loans), *protect the innocent* (the apartment-building thread falling), *decide the deal* (the CRO summary).
3. **How it works** as 4 pinned index cards: upload the tape, Hazel pulls threads, checks cost acorns, a human approves.
4. **Proof strip:** real measured numbers from `docs/PROOF.md` only (once it exists) (recall on ring members, innocents left flagged, spend versus check-everything). If numbers aren't measured yet, leave the strip out rather than inventing it.
5. **Responsible design** note: recommendation for human review, sandbox and synthetic data only.
6. Footer: team, Cal Hacks 13.0, links.

## 6. The existing app (so you can link to it and match it)

- Route `/` is the investigator room (the board). `?run=<run_id>` shows a recorded or live run from Supabase; without it, a small built-in fixture appears.
- The room: pale yellow wall, centred corkboard in a walnut frame (about 85% of width), five paper tabs hung on the frame's top edge (Files, Board, Evidence, Notes, Brief; Brief is not built yet), a status plaque (case and budget), a brass control plate at the lower right (case navigation, zoom), and Hazel on a ledge at the lower left. One side panel at a time slides over the board (filing drawer, evidence inspector, Hazel's notebook).
- Not built yet: the CRO review screen, the demo/replay picker. Do not link to them as if they exist.
- Dev-only pages: `/dev/hazel` (the four poses and a reaction rehearsal) and `/dev/drawer`.

## 7. Where things are (the landing page should not need to touch the app)

| Path | What |
|---|---|
| `app/page.tsx`, `app/layout.tsx`, `app/globals.css` | the app route, fonts, all design tokens and component classes |
| `components/board/` | the room, board, cards, yarn, tabs, panels |
| `components/notebook/` | Hazel and her notebook |
| `components/drawer/` | the filing drawer |
| `lib/events/` | event stream to board state (do not change) |
| `lib/contracts/` | shared Zod contracts (**team-owned, do not change**) |
| `public/hazel/`, `public/assets/detective/` | art and textures |
| `tests/` | `bun test` |

**Do not modify without asking:** `lib/contracts`, `supabase/migrations`, `lib/crs`, `lib/agent`, `lib/deal`, `lib/graph`, anything under `app/api`. A landing page needs none of them.

To avoid fighting the app's styles, put the landing page in its own route or route group (for example `app/(marketing)/page.tsx`, moving the investigator room to `/room` or keeping it at `/app`) and ask the owner before changing the route of the current `/`. Reuse the tokens and textures above instead of adding a second palette.

## 8. Run it

```
bun install
cp .env.example .env.local     # fill in the Supabase URL and anon key only; never commit keys
bun run dev                    # http://localhost:3000
bun run typecheck && bun test && bun run build
```

- Stack: Next.js 16 (App Router), React 19, TypeScript, Tailwind v4, React Flow, Motion, Supabase (Postgres + Realtime), Bun. Zod for contracts. Claude (Sonnet 5.5) runs Hazel.
- The Supabase service-role key is server-only. The browser only ever gets the anon key.
- If the dev server shows an old version, restart it and hard-refresh.

## 9. Working rules (from `CLAUDE.md`)
- **No AI watermarks, ever.** No `Co-Authored-By: Claude`, no "Generated with Claude Code" in commits or PRs. Check `git log origin/main..HEAD --format=%B` and the changed files (including invisible Unicode) before any push.
- Commit under your own name. Do not push to `main` without the team's agreement; use a branch and a PR.
- No API keys in the repo. Demo-first: the main path must work at every commit to `main`.
- Deadlines: prototype freeze Sat 21:00; Devpost submission Sun 09:00 (the repo must be public by then); judging Sun 10:30 to 12:30.
