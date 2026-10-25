"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import styles from "./case-room-intro.module.css";

const SEEN_KEY = "threadpull:case-room-intro:v1";
const INTRO_DURATION_MS = 2900;

type Phase = "checking" | "playing" | "finished";

/**
 * A decorative entrance to the investigation room, not a simulated investigation.
 * It does not touch RunEventFeed, React Flow state, camera framing or loan-card animations.
 * Plays once per browser-tab session and can be replayed from a small board control.
 */
export function CaseRoomIntro() {
  const [phase, setPhase] = useState<Phase>("checking");
  const [cycle, setCycle] = useState(0);
  const [reduceMotion, setReduceMotion] = useState(false);
  const skipRef = useRef<HTMLButtonElement>(null);

  const finish = useCallback(() => {
    try {
      window.sessionStorage.setItem(SEEN_KEY, "1");
    } catch {
      // Private browsing / storage restrictions must never block the board.
    }
    setPhase("finished");
  }, []);

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let seen = false;
    try {
      seen = window.sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      // Animation can still play when storage is unavailable.
    }
    setReduceMotion(reduced);
    setPhase(reduced || seen ? "finished" : "playing");
  }, []);

  useEffect(() => {
    if (phase !== "playing") return;

    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    skipRef.current?.focus({ preventScroll: true });
    const timeout = window.setTimeout(finish, INTRO_DURATION_MS);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        finish();
      }
    };
    window.addEventListener("keydown", onKeyDown);

    return () => {
      window.clearTimeout(timeout);
      window.removeEventListener("keydown", onKeyDown);
      if (previousFocus?.isConnected) previousFocus.focus({ preventScroll: true });
    };
  }, [phase, cycle, finish]);

  const replay = () => {
    setCycle((value) => value + 1);
    setPhase("playing");
  };

  return (
    <>
      {phase === "finished" && !reduceMotion && (
        <button type="button" className={styles.replay} onClick={replay} title="Replay the case-room entrance">
          <span aria-hidden="true">↻</span> Replay opening
        </button>
      )}

      {phase === "checking" && <div aria-hidden="true" className={styles.preflight} />}

      {phase === "playing" && (
        <div key={cycle} className={styles.scene} role="dialog" aria-modal="true" aria-label="Opening the Threadpull investigation room">
          <div className={styles.darkness} aria-hidden="true" />
          <div className={`${styles.door} ${styles.leftDoor}`} aria-hidden="true" />
          <div className={`${styles.door} ${styles.rightDoor}`} aria-hidden="true" />
          <div className={styles.lightSweep} aria-hidden="true" />

          <div className={styles.file} aria-hidden="true">
            <div className={styles.fileCorner} />
            <div className={styles.fileTopline}>
              <span>THREADPULL</span>
              <span>CASE FILE / REVIEW</span>
            </div>
            <span className={styles.fileDivider} />
            <p className={styles.eyebrow}>THE DETECTIVE'S ROOM</p>
            <p className={styles.headline}>The investigation<br />begins.</p>
            <p className={styles.tagline}>Find the ring. Protect the innocent. Decide the deal.</p>
            <span className={styles.fileDivider} />
            <p className={styles.footer}>FOLLOW THE EVIDENCE · NOT THE ASSUMPTION</p>
            <span className={styles.seal}>✦</span>
          </div>

          <button ref={skipRef} type="button" className={styles.skip} onClick={finish}>
            Skip opening <kbd>Esc</kbd>
          </button>
        </div>
      )}
    </>
  );
}
