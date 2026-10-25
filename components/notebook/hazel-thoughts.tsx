"use client";

// Hazel's thinking made visible: a thought bubble over her head with what she is doing now, and, when she records a
// conclusion, a stamped verdict card that stays up long enough to read. Both come only from rows that arrive live:
// rows that were already history when the board loaded are not replayed, and a row is shown at most once.
// The bubble is decoration for sighted viewers; a hidden status line announces conclusions to screen readers.
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import type { RunEvent } from "@/lib/events";
import styles from "./hazel-thoughts.module.css";
import { STAGE_LABEL, ThoughtQueue, type ThoughtView, type Verdict } from "./thoughts-model";

const EMPTY: ThoughtView = { thought: null, verdict: null };
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const TONE: Record<string, string> = {
  Investigate: "investigate",
  "No material anomaly found": "clear",
  "Insufficient evidence": "unsure",
  "Human-confirmed disposition": "human",
};
const tone = (v: Verdict) => (v.kind === "explained" ? "explained" : (v.status && TONE[v.status]) || "investigate");

export function HazelThoughts({ events, animateAfterSeq }: { events: RunEvent[]; animateAfterSeq: number }) {
  const reduce = useReducedMotion();
  const queue = useRef(new ThoughtQueue());
  const seen = useRef(0); // the highest seq already handed to the queue
  const runId = useRef<string | null>(null);
  const [view, setView] = useState<ThoughtView>(EMPTY);

  // hand new live rows to the queue; start over when the board was reset or a different run is on it
  useEffect(() => {
    if (events.length === 0 || events[0].run_id !== runId.current) {
      queue.current = new ThoughtQueue();
      seen.current = 0;
      runId.current = events[0]?.run_id ?? null;
      setView(EMPTY);
    }
    if (!Number.isFinite(animateAfterSeq)) return; // the history isn't in yet: nothing is live
    const fresh = events.filter((e) => e.seq > Math.max(animateAfterSeq, seen.current));
    if (fresh.length === 0) return;
    seen.current = fresh[fresh.length - 1].seq;
    queue.current.push(fresh);
  }, [events, animateAfterSeq]);

  // advance on a short interval; only re-render when what is on screen changes
  useEffect(() => {
    const id = setInterval(() => {
      const next = queue.current.tick(performance.now());
      setView((prev) => (prev.thought?.key === next.thought?.key && prev.verdict?.key === next.verdict?.key ? prev : next));
    }, 100);
    return () => clearInterval(id);
  }, []);

  const { thought, verdict } = view;
  const swap = reduce ? { duration: 0 } : { duration: 0.16, ease: EASE_OUT };
  return (
    <div className={styles.spot}>
      <AnimatePresence mode="wait">
        {verdict && (
          <motion.div
            key={verdict.key}
            className={styles.verdict}
            data-tone={tone(verdict)}
            aria-hidden
            initial={reduce ? { opacity: 0 } : { opacity: 0, transform: "scale(1.45) rotate(-7deg)" }}
            animate={reduce ? { opacity: 1 } : { opacity: 1, transform: ["scale(1.45) rotate(-7deg)", "scale(0.95) rotate(-1.5deg)", "scale(1) rotate(-1.2deg)"] }}
            exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.2 } }}
            transition={reduce ? { duration: 0 } : { opacity: { duration: 0.08 }, transform: { duration: 0.3, ease: EASE_OUT, times: [0, 0.62, 1] } }}
          >
            <span className={styles.stamp}>{verdict.label}</span>
            <p className={styles.names}>
              {verdict.names}
              {verdict.simulated ? " (simulated)" : ""}
            </p>
            {verdict.reason && <p className={styles.reason}>{verdict.reason}</p>}
            {verdict.cited && <p className={styles.cited}>Cited: {verdict.cited}</p>}
          </motion.div>
        )}
      </AnimatePresence>

      {thought && (
        <motion.div
          key={thought.key}
          className={styles.bubble}
          aria-hidden
          initial={reduce ? false : { opacity: 0, transform: "translateY(6px)" }}
          animate={{ opacity: 1, transform: "translateY(0px)" }}
          transition={swap}
        >
          <p className={styles.stage}>
            {STAGE_LABEL[thought.stage]}
            {thought.stage === "check" && (
              <span className={styles.dots} aria-hidden>
                <i />
                <i />
                <i />
              </span>
            )}
          </p>
          <p className={styles.title}>{thought.title}</p>
          {thought.detail && <p className={styles.detail}>{thought.detail}</p>}
          {thought.acorns && (
            <p className={styles.meter}>
              {thought.acorns.spent} of {thought.acorns.limit} acorns{thought.simulated ? " · simulated" : ""}
            </p>
          )}
        </motion.div>
      )}

      {/* what a screen reader hears: only conclusions, once each */}
      <p className="sr-only" role="status">
        {verdict ? `${verdict.names}: ${verdict.label}.${verdict.reason ? ` ${verdict.reason}` : ""}` : ""}
      </p>
    </div>
  );
}
