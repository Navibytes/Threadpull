# Person D: Investigation

**Good fit:** Agents / product

**Your stack:** graphology (evidence graph, connected components), Anthropic TypeScript SDK tool runner + Zod tool definitions with Claude Sonnet 5.5 (`lib/agent/`), Supabase `events` / `runs` / `rules`, Bun for the baseline and evaluator (`eval/`), `bun test`.

**Your tickets, in order:**

| Ticket | Title | Target | Blocked by |
| --- | --- | --- | --- |
| 04 | Evidence graph and weights | Sat 14:00 | 02 |
| 05 | Hazel v1: the first ring, end to end | Sat 15:00 | 01, 03, 04 |
| 11 | Ask once, remember forever | Sun 01:00 | 07, 10 |
| 13 | Proof: fixed-rule baseline vs Hazel | Sun 03:30 | 06, 12 |
| 16 | Submission pack | Sun 08:00 | 13, 15 |

**Who waits on you:** 05 is the critical path: A (07, 08), B (10) and C (09) all wait on it. The 21:00 checkpoint depends on you most.

**First 30 minutes:**

1. Read SKELETON §6 (weights) and §7 (tools) and confirm the tool-result shape with B and C.
1. While A ports the generator, write the graphology weight functions and their `bun test` unit tests against a tiny hand-made portfolio.
1. Sketch the tool loop (Anthropic SDK tool runner + a step limit) and draft Hazel's system prompt: she proposes, code decides; notes at most two sentences, always citing sources.

**While you're blocked:** You also own the pitch: keep the demo script (SKELETON §2) current and record a rough run at the 21:00 checkpoint.

**Team checkpoints:** Sat 12:00 contracts frozen · Sat 21:00 one full rough run · Sun 04:00 feature freeze · Sun 08:00 submit (hard deadline 08:50).

Tickets live in `../tickets/`; the full spec is `../SKELETON.md`; the folder map is `../ARCHITECTURE.md`.
