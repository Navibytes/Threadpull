// Landing page (docs/DESIGN.md), the home page at `/`. The investigator room is at /board. Copy follows the truth rules in DESIGN.md §2: no invented numbers, and anything not built yet
// says so. The results section shows the measured runs in docs/PROOF.md (components/landing/proof-data.ts, kept in step by a test).
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Pushpin } from "@/components/board/pushpin";
import { CaseBoard } from "@/components/landing/case-board";
import { PROOF, PROOF_URL, type ProofSeed } from "@/components/landing/proof-data";
import { DEMO_HREF } from "@/components/landing/demo";
import { SITE_NAV, SiteFooter, SiteHeader } from "@/components/landing/site-chrome";
import s from "@/components/landing/landing.module.css";

export const metadata: Metadata = {
  title: "Threadpull · Find the ring. Protect the innocent. Decide the deal.",
  description:
    "An AI fraud investigator for banks buying auto-loan portfolios. Upload the loan tape: we tell you which borrowers don't exist, which ones only look suspicious, and how much less to pay.",
};

const v = (vars: Record<string, string | number>) => vars as CSSProperties;

// The board used to live at `/`: a link that still carries one of its options goes to /board with the same options.
const BOARD_OPTIONS = ["run", "scenario", "replay"] as const;

export default async function Landing({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = await searchParams;
  const carried = new URLSearchParams();
  for (const key of BOARD_OPTIONS) {
    const v = q[key];
    if (typeof v === "string" && v) carried.set(key, v);
  }
  if (carried.size > 0) redirect(`/board?${carried.toString()}`);
  return (
    <div className={`${s.page} room min-h-full`}>
      <SiteHeader nav={SITE_NAV(true)} />
      <main id="main">
        <Hero />
        <Problem />
        <Promises />
        <HowItWorks />
        <Results />
        <Limits />
        <Responsible />
      </main>
      <SiteFooter onLanding />
    </div>
  );
}


function Hero() {
  return (
    <section aria-labelledby="hero-title" className={`${s.gutter} pt-6 pb-16 lg:pt-8 lg:pb-24`}>
      <p className={`sticky-note ${s.note} ${s.rise}`} style={v({ "--i": 0 })}>case file: a loan portfolio for sale</p>
      <h1 id="hero-title" className={`${s.headline} mt-4 text-walnut`}>
        <span className={s.rise} style={v({ "--i": 1 })}>Find the ring.</span>
        <span className={s.rise} style={v({ "--i": 2 })}>Protect the <span className={s.underlined}>innocent.</span></span>
        <span className={s.rise} style={v({ "--i": 3 })}>Decide the deal.</span>
      </h1>
      <div className="mt-6 grid grid-cols-[minmax(0,1fr)] items-start gap-x-12 gap-y-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <div className="lg:pt-2">
        <p className={`${s.rise} max-w-[34rem] text-lg leading-relaxed`} style={v({ "--i": 4 })}>
          Upload the loan tape. We tell you which borrowers don&apos;t exist, which ones only look suspicious, and how much
          less to pay.
        </p>
        <div className={`${s.rise} mt-6 flex flex-wrap items-center gap-3`} style={v({ "--i": 5 })}>
          <Link href={DEMO_HREF} className={`brass-plate ${s.brass}`}>
            Open the investigator room <span aria-hidden>→</span>
          </Link>
          <Link href="/upload" className={s.paperButton}>Upload a loan tape</Link>
        </div>
        <p className={`${s.rise} mt-3 max-w-[34rem] text-[0.95rem] leading-snug text-walnut/85`} style={v({ "--i": 6 })}>
          The room opens a sample investigation: made-up loans, six cases, two taken down by a cited check, no live
          checks. Uploading a tape checks its format, then lets you start a live investigation of it (it needs the API keys).
        </p>
        <p className={`${s.rise} mt-5 max-w-[34rem] leading-relaxed`} style={v({ "--i": 6 })}>
          Hazel, our investigator, pulls threads through 1,000 loans on a fixed verification budget. When a check reveals a
          legitimate explanation, she withdraws suspicion and takes the thread back down.
        </p>
      </div>
      <div className={s.rise} style={v({ "--i": 5 })}>
        <CaseBoard />
      </div>
      </div>
    </section>
  );
}

// The problem, in sourced numbers only. Every figure is quoted from the Point Predictive release (April 8, 2026); the
// due-diligence line is quoted from OCC Bulletin 2020-81. Exposure estimates, not confirmed losses, and labelled so.
const PP_URL = "https://pointpredictive.com/press-releases/point-predictive-releases-2026-auto-lending-fraud-trends-report-fraud-exposure-reaches-record-10-4-billion/";
const OCC_URL = "https://www.occ.gov/news-issuances/bulletins/2020/bulletin-2020-81.html";
const FACTS: { n: string; what: string; why: string; tilt: number }[] = [
  { n: "69%", what: "of exposure is first-party fraud: borrowers or dealers misrepresenting information", why: "Asking \u201cis this a real person?\u201d misses most of it.", tilt: -1 },
  { n: "45%", what: "comes from income and employment misrepresentation, up 21% year over year", why: "Pay stubs have to be examined, not trusted.", tilt: 0.8 },
  { n: "67%", what: "growth in bust-out fraud over five years", why: "Organised fraud is connected, so we follow the links between loans.", tilt: -0.6 },
  { n: ">70%", what: "of early payment defaults contain evidence of origination fraud", why: "It shows up as losses soon after a portfolio is bought.", tilt: 1.1 },
];

function Problem() {
  return (
    <section id="problem" aria-labelledby="problem-title" className={`${s.gutter} scroll-mt-24 pb-24`}>
      <div className={`${s.reveal} max-w-3xl`}>
        <p className={s.kicker}>The problem</p>
        <h2 id="problem-title" className={`${s.sectionTitle} mt-3`}>
          Auto-lending fraud exposure hit a record <span className="text-[#7c3a26]">$10.4&nbsp;billion</span>.
        </h2>
        <p className="mt-4 text-lg leading-relaxed">
          Up from $9.2 billion a year earlier, and most of it hides inside applications that look fine. A bank that buys a
          portfolio inherits that risk without having seen how the loans were made.
        </p>
      </div>
      <ul className="mt-12 grid list-none gap-8 p-0 sm:grid-cols-2 lg:grid-cols-4 lg:gap-6">
        {FACTS.map((f) => (
          <li key={f.n} className={`${s.sheet} ${s.reveal} min-w-0 !px-5 !pt-7 !pb-5`} style={v({ "--tilt": `${f.tilt}deg` })}>
            <span className={`tape ${s.sheetTape}`} aria-hidden />
            <p className="font-display text-[2.6rem] font-semibold leading-none tabular-nums text-[#7c3a26]">{f.n}</p>
            <p className="mt-2 leading-snug">{f.what}</p>
            <p className="mt-3 border-t border-walnut/20 pt-3 font-hand text-[1.35rem] leading-tight text-walnut/90">{f.why}</p>
          </li>
        ))}
      </ul>
      <div className={`${s.reveal} mt-12 grid gap-8 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:items-start`}>
        <div>
          <h3 className="font-display text-xl font-semibold">What a buying bank struggles with</h3>
          <ol className="mt-3 grid list-decimal gap-2 pl-5 leading-relaxed">
            <li><strong>Hidden risk.</strong> Bad loans sit among thousands of normal-looking ones, and rings spread across many borrowers.</li>
            <li><strong>Costly checking.</strong> Every deep check on every loan wastes money; checking too little misses the ring.</li>
            <li><strong>A weak negotiating position.</strong> Without evidence, the buyer can&apos;t justify excluding loans, lowering the price or asking the seller for protections.</li>
          </ol>
        </div>
        <blockquote className="sticky-note m-0 rotate-[0.8deg] px-6 pt-6 pb-5 shadow-[0_14px_20px_-12px_rgb(0_0_0/0.45)]">
          <p className="font-hand text-[1.7rem] leading-[1.15] text-[#3a2a1d]">&ldquo;A bank should perform due diligence before purchasing loans.&rdquo;</p>
          <footer className="mt-2 text-sm text-walnut/85">
            OCC Bulletin 2020-81, <a href={OCC_URL} className="font-semibold underline underline-offset-2">Risk Management of Loan Purchase Activities</a> (2020)
          </footer>
        </blockquote>
      </div>
      <p className={`${s.reveal} mt-8 max-w-3xl text-sm leading-relaxed text-walnut/85`}>
        Industry estimates of fraud exposure, not confirmed losses. Source:{" "}
        <a href={PP_URL} className="font-semibold underline underline-offset-2">Point Predictive, 2026 Auto Lending Fraud Trends Report</a>{" "}
        (April 8, 2026), which also notes that fraudsters now generate synthetic pay stubs with AI.
      </p>
    </section>
  );
}

const PROMISES: { title: string; tilt: number; body: ReactNode; stamp?: string }[] = [
  {
    title: "Find the ring",
    tilt: -1.2,
    body: (
      <>
        One real SSN under a made-up name is a bad loan. A rare shared phone, a recycled pay-stub template and one dealer
        make it a ring. Every shared detail counts in proportion to how rare it is in the pool, and location alone never
        counts.
      </>
    ),
  },
  {
    title: "Protect the innocent",
    tilt: 0.8,
    body: (
      <>
        Two borrowers at one address look like a pair until one check shows a 212-unit apartment building. The thread
        comes down, and it always cites the check or saved rule that explains it. Spouses and big employers get the same
        care.
      </>
    ),
  },
  {
    title: "Decide the deal",
    tilt: -0.6,
    stamp: "needs a recorded run",
    body: (
      <>
        The Chief Risk Officer gets the work done, not a list of flags: which loans to exclude, reprice or protect,
        buyback demands for the seller, and a revised bid. A person approves; Hazel never signs or sends anything.
      </>
    ),
  },
];

function Promises() {
  return (
    <section id="promises" aria-labelledby="promises-title" className={`${s.gutter} scroll-mt-24 pb-24`}>
      <div className={`${s.reveal} max-w-2xl`}>
        <p className={s.kicker}>What it does</p>
        <h2 id="promises-title" className={`${s.sectionTitle} mt-3`}>A connection is a lead, not a verdict.</h2>
      </div>
      <ol className="mt-12 grid list-none gap-10 p-0 md:grid-cols-3 md:gap-8">
        {PROMISES.map((p, i) => (
          <li key={p.title} className={`${s.sheet} ${s.reveal}`} style={v({ "--tilt": `${p.tilt}deg` })}>
            <span className={`tape ${s.sheetTape}`} aria-hidden />
            <div className="flex items-start justify-between gap-3">
              <span className={s.promiseNum} aria-hidden>{String(i + 1).padStart(2, "0")}</span>
              {p.stamp && <span className="ink-stamp ink-simulated mt-2 rotate-[-4deg] text-[0.72rem]">{p.stamp}</span>}
            </div>
            <h3 className="mt-3 font-display text-2xl font-semibold">{p.title}</h3>
            <p className="mt-3 leading-relaxed">{p.body}</p>
          </li>
        ))}
      </ol>
    </section>
  );
}

const STEPS: { title: string; tilt: number; body: ReactNode }[] = [
  { title: "Upload the loan tape", tilt: -1.4,
    body: <>A messy portfolio export becomes one clean shape: applicant, residence, employer, vehicle and documents for every loan.</> },
  { title: "Hazel pulls threads", tilt: 1.1,
    body: <>Claude picks the next lead and the next check. An evidence graph links loans through phones, bank accounts, devices, employers, dealers and document fingerprints.</> },
  { title: "Every check costs acorns", tilt: -0.7,
    body: <>A CRS identity check costs more than a public-data lookup. The 60-acorn budget is enforced in code; a refused call costs nothing and is still logged.</> },
  { title: "A person approves", tilt: 1.5,
    body: <>Questions go to the right person with a confidence and a reason. A &ldquo;yes&rdquo; becomes a saved rule, so the next lookalike is cleared citing it, and a &ldquo;no&rdquo; saves nothing.</> },
];

function HowItWorks() {
  return (
    <section id="how" aria-labelledby="how-title" className={`${s.corkBand} scroll-mt-20 py-20 text-cream`}>
      <div className={s.gutter}>
        <div className={`${s.reveal} max-w-2xl`}>
          <p className={`${s.kicker} !text-amber`}>How it works</p>
          <h2 id="how-title" className={`${s.sectionTitle} mt-3 text-cream`}>Four cards on the board.</h2>
        </div>
        <ol className="mt-14 grid list-none gap-x-7 gap-y-12 p-0 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step, i) => (
            <li key={step.title} className={`${s.stepCard} ${s.reveal}`} style={v({ "--tilt": `${step.tilt}deg` })}>
              <span className={s.stepPin} aria-hidden><Pushpin color={i === 3 ? "brass" : "red"} size={26} /></span>
              <div className={`index-ruled worn-${i % 4} h-full px-5 pt-6 pb-5 text-walnut`}>
                <p className="font-hand text-2xl leading-none text-[#7c3a26]">step {i + 1}</p>
                <h3 className="mt-2 font-display text-xl font-semibold leading-snug">{step.title}</h3>
                <p className="mt-2 leading-[22px]">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

function ResultsTable({ p, tilt }: { p: ProofSeed; tilt: number }) {
  return (
    <li className={`${s.sheet} ${s.reveal} min-w-0`} style={v({ "--tilt": `${tilt}deg` })}>
      <span className={`tape ${s.sheetTape}`} aria-hidden />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h3 className="font-display text-2xl font-semibold">Seed {p.seed}</h3>
        <span className={`${s.kicker} !tracking-[0.12em]`}>{p.label}</span>
      </div>
      <p className="mt-1 text-sm leading-relaxed text-walnut/85">{p.note}</p>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[22rem] border-collapse text-left text-[15px] tabular-nums">
          <caption className="sr-only">Seed {p.seed} results by agent</caption>
          <thead>
            <tr className="border-b border-walnut/30 text-xs uppercase tracking-wide text-walnut/80">
              <th scope="col" className="py-1.5 pr-3 font-semibold">Agent</th>
              <th scope="col" className="py-1.5 pr-3 font-semibold">Ring found</th>
              <th scope="col" className="py-1.5 pr-3 font-semibold">Innocents flagged</th>
              <th scope="col" className="py-1.5 pr-3 font-semibold">Review cases right</th>
              <th scope="col" className="py-1.5 font-semibold">Acorns</th>
            </tr>
          </thead>
          <tbody>
            {p.rows.map((r) => {
              const hazel = r.agent === "Threadpull (Hazel)";
              return (
                <tr key={r.agent} className={`border-b border-walnut/15 ${hazel ? "bg-amber/15 font-semibold" : ""}`}>
                  <th scope="row" className={`py-2 pr-3 ${hazel ? "font-semibold" : "font-normal"}`}>{hazel ? "Threadpull" : r.agent}</th>
                  <td className="whitespace-nowrap py-2 pr-3">{r.ring}</td>
                  <td className="whitespace-nowrap py-2 pr-3">{r.innocents}</td>
                  <td className="whitespace-nowrap py-2 pr-3">{r.review}</td>
                  <td className="py-2">{r.acorns}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-walnut/85">
        Every ring member was marked Investigate after <strong>{p.ringCompleteAt} acorns</strong>; the rest of the budget went on
        other leads and checking the largest balances. Run <span className={s.monoLight}>{p.run}</span>.
      </p>
    </li>
  );
}

function Results() {
  return (
    <section id="results" aria-labelledby="results-title" className={`${s.gutter} scroll-mt-24 py-24`}>
      <div className={`${s.reveal} max-w-2xl`}>
        <p className={s.kicker}>Measured results</p>
        <h2 id="results-title" className={`${s.sectionTitle} mt-3`}>Every ring member found. No innocent left flagged.</h2>
        <p className="mt-4 leading-relaxed">
          Each portfolio has 1,000 loans and a separate answer key that only the evaluator reads. Threadpull is compared with
          two baselines on the same loans, with CRS live: <strong>fixed rules</strong> flag every loan that shares a phone, email,
          bank account, device, IP or address, then spend the same budget; <strong>check everything</strong> runs all four
          CRS products on every loan, with no budget.
        </p>
      </div>
      <ol className="mt-12 grid list-none gap-10 p-0 lg:grid-cols-2 lg:gap-8">
        {PROOF.map((p, i) => <ResultsTable key={p.seed} p={p} tilt={i ? 0.6 : -0.5} />)}
      </ol>
      <p className={`${s.reveal} mt-10 max-w-3xl text-sm leading-relaxed`}>
        Hazel reaches the review cases (fraud alert, frozen bureau, bureaus that disagree) only when checking the largest
        balances, so she got 1 of 3; checking everything gets all 3 at about four times the cost. On seed 13 she also held
        one more loan (L0742) for an open question to the CRO; it is cleared once the CRO answers. Hazel picks her own path,
        so figures vary between runs: across five seed 13 runs the ring was complete after 7 to 14 acorns. Numbers are
        generated by <span className={s.monoLight}>bun run eval</span> from the runs&apos; recorded events, on the detector frozen
        before the held-out seed was run.{" "}
        <a href={PROOF_URL} className="font-semibold underline underline-offset-2">Full tables and method in PROOF.md</a>
      </p>
    </section>
  );
}

const LIMITS: { plate: string; line: ReactNode; detail: ReactNode }[] = [
  { plate: "The budget",
    line: <>Code holds the purse, not the prompt.</>,
    detail: <>A ledger charges each verification from a fixed price list and refuses the call that would overspend. Only successful calls are charged.</> },
  { plate: "The verdict",
    line: <>Hazel proposes. Code decides.</>,
    detail: <>Statuses come from the evidence gathered in the run. When Hazel proposes something else, the log keeps both, and the code&apos;s decision stands.</> },
  { plate: "The documents",
    line: <>Document text is data, never instructions.</>,
    detail: <>One ring loan&apos;s pay stub says to clear every loan from its dealer and skip the CRS checks. It is logged as <span className={s.mono}>attack_detected</span>, the words never reach the model, and the loan stays in Investigate.</> },
  { plate: "The memory",
    line: <>Ask once, remember forever.</>,
    detail: <>The CRO&apos;s ruling that a 48,000-staff hospital explains a shared employer becomes rule <span className={s.mono}>R-001</span>. The next lookalike is cleared citing it; a 38-person employer is outside its scope, so Hazel asks again.</> },
  { plate: "The record",
    line: <>Every step proves itself.</>,
    detail: <>Each move is an append-only event row with its sources and every CRS RequestID, so &ldquo;why is this loan flagged?&rdquo; has an answer months later.</> },
];

function Limits() {
  return (
    <section id="limits" aria-labelledby="limits-title" className="desk scroll-mt-20 py-20">
      <div className={s.gutter}>
        <div className={`${s.reveal} max-w-2xl`}>
          <p className={`${s.kicker} !text-amber`}>Limits in code</p>
          <h2 id="limits-title" className={`${s.sectionTitle} mt-3 text-cream`}>Claude chooses the next step. Code keeps the rules.</h2>
          <p className="mt-4 max-w-xl leading-relaxed text-cream/85">
            Everything a model could get wrong (money, status, budget, who may do what) is enforced outside the model.
          </p>
        </div>
        <dl className="mt-12">
          {LIMITS.map((l) => (
            <div key={l.plate} className={`${s.ledgerRow} ${s.reveal}`}>
              <dt className={`brass-plate ${s.plate}`}>{l.plate}</dt>
              <dd className="m-0">
                <p className={s.inkLine}>{l.line}</p>
                <p className="mt-2 max-w-2xl leading-relaxed text-cream/80">{l.detail}</p>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function Responsible() {
  return (
    <section id="responsible" aria-labelledby="responsible-title" className={`${s.gutter} scroll-mt-24 grid items-center gap-12 py-24 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]`}>
      <div className={s.reveal}>
        <p className={s.kicker}>Responsible design</p>
        <h2 id="responsible-title" className={`${s.sectionTitle} mt-3`}>A recommendation for a person, never a verdict on a borrower.</h2>
        <ul className="mt-6 grid max-w-xl list-none gap-3 p-0 leading-relaxed">
          <li><strong>A connection is not proof.</strong> Threadpull&apos;s output goes to human review and is never an adverse action on a consumer.</li>
          <li><strong>No location-only signals.</strong> A ZIP code or a neighbourhood is never evidence on its own.</li>
          <li><strong>Inside the data room only.</strong> Hazel can read the tape and call the CRS sandbox. She cannot buy, reject, sign or send.</li>
          <li><strong>Built on synthetic data.</strong> Loans are generated; identities are CRS sandbox personas. A production version would need a permissible purpose under the FCRA and legal review.</li>
        </ul>
      </div>
      <div className={`${s.reveal} relative mx-auto w-full max-w-sm`}>
        <div className={`sticky-note ${s.bigNote}`}>
          <p className="font-hand text-[1.9rem] leading-[1.15] text-[#3a2a1d]">
            We don&apos;t just connect the evidence. We know when to take a connection down.
          </p>
        </div>
        <Image src="/hazel/hazel-thinking.png" alt="" width={1219} height={1290} sizes="140px"
          className="hazel-breathe pointer-events-none absolute -right-4 -bottom-16 w-32 md:-right-10" />
      </div>
    </section>
  );
}
