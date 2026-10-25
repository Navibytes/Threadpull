"use client";

// The hero's corkboard: a scripted illustration of seed 13's opening (docs/DESIGN.md §3 allows scripted motion on
// the landing page, echoing the app's moves). Loan ids, CRS codes and the 212-unit building are seed 13's own;
// the in-app board plays recorded event rows instead. Base styles are the final state, so reduced motion shows the
// finished board with the address thread already down.
import Image from "next/image";
import { useState, type CSSProperties } from "react";
import { Pushpin } from "@/components/board/pushpin";
import s from "./landing.module.css";

type Pt = readonly [number, number]; // viewBox units (1000 × 600)
const pct = ([x, y]: Pt) => ({ left: `${x / 10}%`, top: `${y / 6}%` });
const sag = (a: Pt, b: Pt, dx: number, dy: number) => `M${a[0]} ${a[1]} Q${(a[0] + b[0]) / 2 + dx} ${(a[1] + b[1]) / 2 + dy} ${b[0]} ${b[1]}`;
// a point on the quadratic curve drawn by sag(), at t (0 = a, 1 = b)
const at = (a: Pt, b: Pt, dx: number, dy: number, t = 0.5): Pt => {
  const c: Pt = [(a[0] + b[0]) / 2 + dx, (a[1] + b[1]) / 2 + dy];
  const f = (i: 0 | 1) => (1 - t) ** 2 * a[i] + 2 * (1 - t) * t * c[i] + t ** 2 * b[i];
  return [f(0), f(1)];
};
const v = (vars: Record<string, string | number>) => vars as CSSProperties;

// pins sit at the top centre of each card
const PIN = { lead: [185, 186], p12: [530, 48], bg1: [545, 354], twinA: [840, 60], twinB: [835, 366] } as const satisfies Record<string, Pt>;

const THREADS = [
  { a: PIN.lead, b: PIN.bg1, dx: 0, dy: 80, width: 7, delay: 1.0, label: "same rare phone", tilt: -2, t: 0.66 },
  { a: PIN.lead, b: PIN.p12, dx: 0, dy: 80, width: 6, delay: 1.25, label: "same bank account", tilt: 2, t: 0.38 },
  { a: PIN.p12, b: PIN.bg1, dx: 120, dy: 0, width: 5, delay: 1.5, label: "same pay-stub template", tilt: -1.5, t: 0.5 },
];
const ADDRESS = { a: PIN.twinA, b: PIN.twinB, dx: 130, dy: 0 };

export function CaseBoard() {
  const [take, setTake] = useState(0); // remounting the board replays it

  return (
    <figure className="m-0">
      <div className={s.desktopBoard}>
      <div className={s.boardScroll}>
        <div className={s.boardWrap}>
          <div className="board-frame">
            <div
              key={take}
              className={s.cork}
              role="img"
              aria-label="Illustration: loan L0037 fails a TransUnion identity check and red threads link it to L0190 and L0445 at Dealer #3. A thread between L0229 and L0566, who share an address, comes down after a check finds a 212-unit apartment building."
            >
              <svg className={s.yarn} viewBox="0 0 1000 600" aria-hidden>
                {THREADS.map((t) => (
                  <path key={t.label} className={s.thread} pathLength={1} d={sag(t.a, t.b, t.dx, t.dy)} strokeWidth={t.width}
                    style={v({ "--delay": `${t.delay}s` })} />
                ))}
                <path className={s.trace} d={sag(ADDRESS.a, ADDRESS.b, ADDRESS.dx, ADDRESS.dy)} strokeWidth={4} style={v({ "--delay": "1s" })} />
                <path className={s.falling} pathLength={1} d={sag(ADDRESS.a, ADDRESS.b, ADDRESS.dx, ADDRESS.dy)} strokeWidth={5}
                  style={v({ "--delay": "1.2s" })} />
              </svg>

              <div aria-hidden>
                {/* the lead: a manila case folder */}
                <div className={s.card} style={v({ left: "3%", top: "30%", width: "31%", "--tilt": "-1.2deg", "--delay": "0.15s" })}>
                  <span className={s.pinAt}><Pushpin color="red" /></span>
                  <span className={`folder-tab ${s.folderTab}`}>LEAD</span>
                  <div className={`folder worn-0 ${s.cardBody}`}>
                    <div className={s.cardId}>L0037</div>
                    <div className="mt-[0.6cqw] font-semibold">TransUnion identity</div>
                    <div><span className={s.code}>2201</span> SSN not associated with this name</div>
                    <div><span className={s.code}>2202</span> date of birth doesn&apos;t match</div>
                    <div><span className={s.code}>2101</span> address doesn&apos;t match</div>
                    <span className={`ink-stamp ink-crs ${s.stamp}`}>CRS</span>{" "}
                    <span className={s.status}>Investigate</span>
                  </div>
                </div>

                <IndexCard id="L0190" at={{ left: "42%", top: "7%", width: "22%" }} tilt={1.5} delay={0.3} lines={["Dealer #3", "TU: 2201 + 2202"]} />
                <IndexCard id="L0445" at={{ left: "43%", top: "58%", width: "23%" }} tilt={-1} delay={0.45}
                  lines={["Dealer #3 · no bureau file", "Pay stub: instructions withheld"]} />
                <IndexCard id="L0229" at={{ left: "73%", top: "9%", width: "22%" }} tilt={-1.4} delay={0.6} lines={["shared street address"]} />
                <IndexCard id="L0566" at={{ left: "72%", top: "60%", width: "23%" }} tilt={1.1} delay={0.75} lines={["shared street address"]} />

                {THREADS.map((t) => {
                  const m = at(t.a, t.b, t.dx, t.dy, t.t);
                  return (
                    <span key={t.label} className={`tape ${s.label}`} style={v({ ...pct(m), "--tilt": `${t.tilt}deg`, "--delay": `${t.delay + 0.55}s` })}>
                      {t.label}
                    </span>
                  );
                })}
                <span className={`tape ${s.label} ${s.labelFalls}`}
                  style={v({ ...pct(at(ADDRESS.a, ADDRESS.b, ADDRESS.dx, ADDRESS.dy)), "--tilt": "2deg", "--delay": "1.75s", "--delay2": "0.6s" })}>
                  same address
                </span>
                <div className={s.explained} style={v({ left: "80%", top: "41%", "--delay": "0.6s" })}>
                  <strong>Explained</strong> by <code>check_address</code>: a 212-unit apartment building. The thread comes down.
                </div>
              </div>
            </div>
          </div>

          <div className={s.hazel} aria-hidden>
            <div className="hazel-breathe absolute inset-0">
              <Image className={s.poseIdle} src="/hazel/hazel-idle.png" alt="" fill sizes="180px" style={v({ "--delay": "1s" })} />
              <Image className={s.poseResolved} src="/hazel/hazel-resolved.png" alt="" fill sizes="180px" style={v({ "--delay": "1s" })} />
            </div>
          </div>

          <button type="button" className={`brass-plate ${s.replay}`} onClick={() => setTake((n) => n + 1)}>
            Pull the thread again
          </button>
        </div>
      </div>
      </div>
      <MobileBoard />
      <figcaption className={`${s.caption} mt-1 text-walnut`}>
        An illustration of the seed-13 case (synthetic loans, sandbox personas). The sample you open next uses different, made-up loans and no live checks.
        In the app, every move on the board is an event row.
      </figcaption>
    </figure>
  );
}

// The same story as the wide board, for a phone: one column of cards, each thread a labelled red line between two of them.
// Real text, not a picture, so it reads at a normal size and a screen reader gets it as it is.
function MobileBoard() {
  return (
    <div className={s.mobileBoard}>
      <div className="board-frame">
        <div className={s.mCork}>
          <div className={s.mCard} style={v({ "--tilt": "-0.8deg" })}>
            <span className={s.mPin}><Pushpin color="red" /></span>
            <div className={`folder worn-0 ${s.mBody}`}>
              <span className={s.mLead}>LEAD</span>
              <div className={s.mId}>L0037</div>
              <div className="mt-1 font-semibold">TransUnion identity</div>
              <div><span className={s.code}>2201</span> SSN not associated with this name</div>
              <div><span className={s.code}>2202</span> date of birth doesn&apos;t match</div>
              <div><span className={s.code}>2101</span> address doesn&apos;t match</div>
              <div className="mt-2 flex items-center gap-2">
                <span className="ink-stamp ink-crs">CRS</span>
                <span className={s.mStatus}>Investigate</span>
              </div>
            </div>
          </div>

          <div className={s.mThread}><span className={s.mLabel} style={v({ "--tilt": "-2deg" })}>same rare phone</span></div>

          <div className={s.mCard} style={v({ "--tilt": "0.9deg" })}>
            <span className={s.mPin}><Pushpin color="red" /></span>
            <div className={`index-ruled worn-1 ${s.mBody}`}>
              <div className={s.mId}>L0445</div>
              <div>Dealer #3 · no bureau file</div>
              <div>Pay stub: instructions withheld</div>
            </div>
          </div>

          <div className={s.mThread}><span className={s.mLabel} style={v({ "--tilt": "1.5deg" })}>same pay-stub template</span></div>

          <div className={s.mCard} style={v({ "--tilt": "-0.6deg" })}>
            <span className={s.mPin}><Pushpin color="red" /></span>
            <div className={`index-ruled worn-2 ${s.mBody}`}>
              <div className={s.mId}>L0190</div>
              <div>Dealer #3</div>
              <div>TU: 2201 + 2202</div>
            </div>
          </div>
          <p className={s.mNote}>L0190 and L0037 also share a bank account.</p>

          <div className={s.mDivider} aria-hidden />

          <div className={s.mCard} style={v({ "--tilt": "0.7deg" })}>
            <span className={s.mPin}><Pushpin color="red" /></span>
            <div className={`index-ruled worn-3 ${s.mBody}`}>
              <div className={s.mId}>L0229</div>
              <div>shared street address</div>
            </div>
          </div>
          <div className={`${s.mThread} ${s.mThreadGone}`}><span className={s.mLabel} style={v({ "--tilt": "1deg", textDecoration: "line-through" })}>same address</span></div>
          <div className={s.mCard} style={v({ "--tilt": "-0.9deg" })}>
            <span className={s.mPin}><Pushpin color="red" /></span>
            <div className={`index-ruled worn-0 ${s.mBody}`}>
              <div className={s.mId}>L0566</div>
              <div>shared street address</div>
            </div>
          </div>
          <p className={s.mExplained}>
            <strong>Explained</strong> by <code>check_address</code>: a 212-unit apartment building. The thread comes down.
          </p>
          <div className={s.mHazel}>
            <Image src="/hazel/hazel-resolved.png" alt="" width={1219} height={1290} sizes="88px" className="h-auto w-full" />
          </div>
        </div>
      </div>
    </div>
  );
}

function IndexCard({ id, at, tilt, delay, lines }: {
  id: string; at: { left: string; top: string; width: string }; tilt: number; delay: number; lines: string[];
}) {
  return (
    <div className={s.card} style={v({ ...at, "--tilt": `${tilt}deg`, "--delay": `${delay}s` })}>
      <span className={s.pinAt}><Pushpin color="red" /></span>
      <div className={`index-ruled worn-${Math.abs(Math.round(tilt * 10)) % 4} ${s.cardBody}`}>
        <div className={s.cardId}>{id}</div>
        {lines.map((l) => <div key={l}>{l}</div>)}
      </div>
    </div>
  );
}
