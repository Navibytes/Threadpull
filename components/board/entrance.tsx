"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { ENTRANCE } from "./entrance-plan";

// The strong ease-out for things that arrive (the animate skill's --ease-out). Built-in `ease-out` is too weak.
export const EASE_OUT = [0.23, 1, 0.32, 1] as const;

// transform and opacity only, so every step of the sequence is composited and stays smooth while the page is busy
// laying out a large board. Full transform strings, not Motion's x/y/scale shorthands (those run on the main thread).
const PIN_FROM = "translateY(-9px) scale(1.35)";
const PIN_PRESS = "translateY(0px) scale(0.9)";
const PIN_REST = "translateY(0px) scale(1)";

// A pin pops in from above, presses into the paper a little too far, and rests. `delay` is seconds from now (from
// the plan); without it the pin is simply there, which is every case but an entrance and reduced motion.
export function PinPop({ delay, children }: { delay?: number; children: ReactNode }) {
  const pops = delay !== undefined;
  return (
    <motion.div
      style={{ transformOrigin: "50% 85%" }}
      initial={pops ? { opacity: 0, transform: PIN_FROM } : false}
      animate={pops ? { opacity: 1, transform: [PIN_FROM, PIN_PRESS, PIN_REST] } : { opacity: 1, transform: PIN_REST }}
      transition={
        pops
          ? {
              opacity: { duration: 0.06, delay },
              transform: { duration: ENTRANCE.pinMs / 1000, delay, ease: EASE_OUT, times: [0, 0.65, 1] },
            }
          : { duration: 0 }
      }
    >
      {children}
    </motion.div>
  );
}
