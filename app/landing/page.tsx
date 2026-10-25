// Landing page (docs/DESIGN.md). Lives on its own route so the investigator room keeps `/`; moving it is the
// board owner's call. Copy follows the truth rules in DESIGN.md §2: no invented numbers, and anything not built yet
// says so. The proof strip waits for measured results in docs/PROOF.md.
import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Pushpin } from "@/components/board/pushpin";
import { CaseBoard } from "@/components/landing/case-board";
import s from "@/components/landing/landing.module.css";

export const metadata: Metadata = {
  title: "Threadpull · Find the ring. Protect the innocent. Decide the deal.",
  description:
    "An AI fraud investigator for banks buying auto-loan portfolios. Upload the loan tape: we tell you which borrowers don't exist, which ones only look suspicious, and how much less to pay.",
};

const v = (vars: Record<string, string | number>) => vars as CSSProperties;

export default function Landing() {
  return (
    <div className={`${s.page} room min-h-full`}>
      <Header />
      <main id="main">
        <Hero />
        <Promises />
        <HowItWorks />
        <Limits />
        <Responsible />
      </main>
      <Footer />
    </div>
  );
}

function Header() {
  return (
    <header className={s.header}>
      <div className={`${s.gutter} flex items-center justify-between gap-4 py-2.5`}>
        <Link href="/landing" aria-label="Threadpull home" className="shrink-0 rounded-sm focus-visible:outline-2 focus-visible:outline-terracotta">
          <Image src="/hazel/threadpull-full-logo.png" alt="Threadpull" width={1998} height={787} priority
            className="h-11 w-auto sm:h-13" sizes="160px" />
        </Link>
        <nav aria-label="Sections" className="hidden items-center gap-7 text-[0.95rem] font-medium md:flex">
          <a className={s.navLink} href="#promises">What it does</a>
          <a className={s.navLink} href="#how">How it works</a>
          <a className={s.navLink} href="#limits">Limits in code</a>
          <a className={s.navLink} href="#responsible">Responsible design</a>
        </nav>
        <Link href="/" className={`brass-plate ${s.brass} !px-4 !py-2 text-sm`}>
          Open the room
        </Link>
      </div>
    </header>
  );
}

function Hero() {
  return (
    <section aria-labelledby="hero-title" className={`${s.gutter} pt-10 pb-16 lg:pt-14 lg:pb-24`}>
      <p className={`sticky-note ${s.note} ${s.rise}`} style={v({ "--i": 0 })}>case file: a loan portfolio for sale</p>
      <h1 id="hero-title" className={`${s.headline} mt-5 text-walnut`}>
        <span className={s.rise} style={v({ "--i": 1 })}>Find the ring.</span>
        <span className={s.rise} style={v({ "--i": 2 })}>Protect the <span className={s.underlined}>innocent.</span></span>
        <span className={s.rise} style={v({ "--i": 3 })}>Decide the deal.</span>
      </h1>
      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] items-start gap-x-12 gap-y-4 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
      <div className="lg:pt-6">
        <p className={`${s.rise} max-w-[34rem] text-lg leading-relaxed`} style={v({ "--i": 4 })}>
          Upload the loan tape. We tell you which borrowers don&apos;t exist, which ones only look suspicious, and how much
          less to pay.
        </p>
        <p className={`${s.rise} mt-3 max-w-[34rem] leading-relaxed`} style={v({ "--i": 5 })}>
          Hazel, our investigator, pulls threads through 1,000 loans on a fixed verification budget, and takes a thread back
          down when one check proves the link innocent.
        </p>
        <div className={`${s.rise} mt-8 flex flex-wrap items-center gap-3`} style={v({ "--i": 6 })}>
          <Link href="/" className={`brass-plate ${s.brass}`}>
            Open the investigator room <span aria-hidden>→</span>
          </Link>
          <a href="#how" className={s.paperButton}>See how Hazel works</a>
        </div>
      </div>
      <div className={s.rise} style={v({ "--i": 5 })}>
        <CaseBoard />
      </div>
      </div>
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
    stamp: "being built",
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

function Footer() {
  return (
    <footer className={`${s.footer} mt-10 pt-10 pb-12`}>
      <div className={`${s.gutter} flex flex-col items-start justify-between gap-6 sm:flex-row sm:items-center`}>
        <div className="flex items-center gap-4">
          <Image src="/hazel/threadpull-icon.png" alt="" width={1254} height={1254} sizes="64px" className="h-14 w-14" />
          <div>
            <p className="font-display text-xl font-semibold">Threadpull</p>
            <p className="text-sm text-cream/80">Built at Cal Hacks 13.0 with the CRS Credit API sandbox and Claude.</p>
          </div>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <Link className={s.footerLink} href="/">Investigator room</Link>
          <a className={s.footerLink} href="#how">How it works</a>
          <a className={s.footerLink} href="#responsible">Responsible design</a>
        </nav>
      </div>
    </footer>
  );
}
