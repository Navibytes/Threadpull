// How Threadpull is built, as the landing page's data-flow diagram: what each part does, its stack and where it lives in
// the repo. Every claim matches the code (the module paths exist; tests/landing-architecture.test.ts checks them). The
// cards marked "Claude" are the only places a model runs; everything else is plain code. Mirrors the README diagram.
import s from "./landing.module.css";

export type Part = { id: string; title: string; does: string; stack: string; path: string; model?: string; area: string };

export const PARTS: Part[] = [
  { id: "gen", area: "gen", title: "Portfolio generator", does: "Seeded loan tapes with planted fraud rings and innocent lookalikes. The answer key is written apart.", stack: "Bun · Faker", path: "data/generate.ts" },
  { id: "intake", area: "intake", title: "Intake", does: "Validates every row, refuses SSNs that could be real, flags documents with instruction-like text.", stack: "TypeScript · Zod", path: "lib/ingest" },
  { id: "graph", area: "graph", title: "Evidence graph", does: "Links loans by shared phones, accounts, devices, IPs, employers, dealers and document templates. Rarer means stronger; location alone never counts.", stack: "graphology", path: "lib/graph" },
  { id: "tools", area: "tools", title: "Checks", does: "CRS sandbox (TransUnion identity, credit report, Fraud Finder, reverse phone) behind a persona guard; address, household, employer and dealer explanation checks; pay-stub parser.", stack: "CRS API", path: "lib/crs · lib/evidence", model: "Claude Haiku reads only stubs the parser can't; code verifies each value" },
  { id: "hazel", area: "hazel", title: "Hazel, the investigator", does: "Picks the next check from the leads and writes short notes citing their sources. Never sets a status, a price or the budget.", stack: "Anthropic SDK tool runner", path: "lib/agent", model: "Claude Sonnet 5.5" },
  { id: "ledger", area: "ledger", title: "Budget ledger", does: "Reserves each check's acorn price before it runs and refuses what would overspend. Hazel can't raise it.", stack: "TypeScript", path: "lib/ledger.ts" },
  { id: "log", area: "log", title: "Event log", does: "Every step is an append-only row with its sources and CRS RequestIDs. Statuses are decided by code from the evidence.", stack: "Supabase Postgres", path: "lib/agent · lib/events" },
  { id: "board", area: "board", title: "Corkboard", does: "Replays the rows or streams them live. Every animation is a recorded row, never a script.", stack: "Next.js · React Flow · Realtime", path: "components/board" },
  { id: "deal", area: "deal", title: "Deal engine", does: "Exclusions, repricing, buyback drafts and the revised bid, all computed in code.", stack: "TypeScript", path: "lib/deal" },
  { id: "eval", area: "eval", title: "Evaluator", does: "The only code that reads the answer key: scores recorded runs against it and two baselines.", stack: "Bun", path: "eval" },
  { id: "cro", area: "cro", title: "CRO review", does: "A person approves or overrides. An answered question becomes a saved rule. The memo keeps only sentences it can check against the events.", stack: "Next.js", path: "app/cro · lib/rules", model: "Claude Sonnet 5.5 drafts the memo" },
];

// grid arrows between cards (desktop): [area, glyph, label]
const ARROWS: [string, string, string][] = [
  ["a1", "→", ""], ["a2", "↓", ""], ["a3", "↓", "leads"], ["a4", "⇄", "results come back as evidence"], ["a5", "←", "limit"],
  ["a6", "↓", "rows"], ["a7", "←", "live"], ["a8", "→", ""], ["a9", "↓", ""], ["a10", "↓", ""],
];

const GRID = `
  "gen    a1  intake .   .     "
  ".      .   a2     .   .     "
  ".      .   graph  .   .     "
  ".      .   a3     .   .     "
  "tools  a4  hazel  a5  ledger"
  ".      .   a6     .   .     "
  "board  a7  log    a8  deal  "
  ".      .   a9     .   a10   "
  ".      .   eval   .   cro   "`;

function Card({ p }: { p: Part }) {
  const llm = p.id === "hazel";
  return (
    <div style={{ gridArea: p.area }}
      className={`${s.reveal} relative flex flex-col rounded-[3px] border p-4 text-walnut shadow-[0_10px_18px_-12px_rgb(0_0_0/0.5)] ${llm ? "border-terracotta bg-[#fdf3e3] ring-2 ring-terracotta/60" : "border-walnut/25 bg-[#fbf6ea]"}`}>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-display text-[1.15rem] font-semibold leading-tight">{p.title}</h3>
        {p.model ? <span className="shrink-0 rounded-sm bg-terracotta px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-white">Claude</span> : null}
      </div>
      <p className="mt-1.5 text-[14px] leading-snug text-walnut/90">{p.does}</p>
      {p.model ? <p className="mt-1.5 text-[13px] font-medium leading-snug text-[#7c3a26]">{p.model}</p> : null}
      <p className="mt-auto pt-2 text-[12.5px] text-walnut/75">{p.stack} · <span className={s.monoLight}>{p.path}</span></p>
    </div>
  );
}

export function Architecture() {
  return (
    <section id="architecture" aria-labelledby="architecture-title" className={`${s.gutter} scroll-mt-24 py-24`}>
      <div className={`${s.reveal} max-w-3xl`}>
        <p className={s.kicker}>How it&apos;s built</p>
        <h2 id="architecture-title" className={`${s.sectionTitle} mt-3`}>Claude plans the checks. Code holds the evidence and the math.</h2>
        <p className="mt-4 text-lg leading-relaxed">
          A model runs in three places, each marked <span className="rounded-sm bg-terracotta px-1.5 py-0.5 text-[12px] font-semibold uppercase tracking-wide text-white">Claude</span>:
          choosing Hazel&apos;s next check, reading a pay stub the parser can&apos;t, and drafting the CRO memo. Everything with money
          or consequences attached (the graph, the budget, every status and every number) is plain, tested code.
        </p>
      </div>

      {/* desktop: the data-flow diagram */}
      <div className="mt-12 hidden gap-x-3 gap-y-1 lg:grid" style={{ gridTemplateAreas: GRID, gridTemplateColumns: "minmax(0,1fr) 5.5rem minmax(0,1fr) 5.5rem minmax(0,1fr)" }}>
        {PARTS.map((p) => <Card key={p.id} p={p} />)}
        {ARROWS.map(([area, glyph, label]) => (
          <div key={area} aria-hidden style={{ gridArea: area }} className="flex min-h-10 flex-col items-center justify-center text-center">
            <span className="font-display text-[1.7rem] leading-none text-terracotta">{glyph}</span>
            {label ? <span className="font-hand text-[1.05rem] leading-tight text-walnut/85">{label}</span> : null}
          </div>
        ))}
      </div>

      {/* phone and tablet: the same parts in flow order */}
      <ol className="mt-10 grid list-none gap-4 p-0 lg:hidden">
        {PARTS.map((p) => <li key={p.id} className="min-w-0"><Card p={{ ...p, area: "auto" }} /></li>)}
      </ol>

      <p className={`${s.reveal} mt-8 max-w-3xl text-sm leading-relaxed text-walnut/85`}>
        Data flows from the tape to the CRO. Each check&apos;s result goes back to Hazel as new evidence, so every check can
        change what she does next. The answer key never reaches the app: only the evaluator reads it, and a test enforces that.
        The full diagram is in the <a href="https://github.com/Navibytes/Threadpull#architecture" className="font-semibold underline underline-offset-2">README</a>.
      </p>
    </section>
  );
}
