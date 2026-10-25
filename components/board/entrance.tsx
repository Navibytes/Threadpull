"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { EASE_OUT, PIN_REST, strike } from "./entrance-motion";
import { ENTRANCE, secs } from "./entrance-plan";

// Everything here animates transform and opacity only, on elements that sit beside or inside the card's own box
// and take no space: nothing changes a node's measured size, its layout position or its handles. Full transform
// strings, not Motion's x/y/scale shorthands (those run on the main thread).

// A pin: it falls from above and strikes the paper (pressed in, rebounds, settles), with a contact shadow that
// flashes where it lands. `delay` is seconds from now (from the plan); without it the pin is simply there, which is
// every case but an entrance and reduced motion. A card's own pin (`fx`) also sends a ripple through the paper.
export function PinStrike({ delay, tie = false, fx = false, children }: { delay?: number; tie?: boolean; fx?: boolean; children: ReactNode }) {
  const strikes = delay !== undefined;
  const ms = tie ? ENTRANCE.tiePinMs : ENTRANCE.pinMs;
  const k = strike(tie);
  const hit = (delay ?? 0) + secs(ms * ENTRANCE.pinStrikeAt); // the moment the pin meets the paper
  return (
    <div className="relative">
      {strikes && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[58%] h-[36%] w-[125%] -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ background: "radial-gradient(closest-side, rgb(18 8 2 / 0.7), transparent)" }}
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0], transform: ["scale(1.7)", "scale(0.9)", "scale(1.25)"] }}
          transition={{ duration: secs(ms * 1.3), delay: delay, times: [0, ENTRANCE.pinStrikeAt, 1], ease: EASE_OUT }}
        />
      )}
      {strikes && fx && !tie && (
        <motion.span
          aria-hidden
          className="pointer-events-none absolute left-1/2 top-[58%] h-7 w-7 -translate-x-1/2 -translate-y-1/2 rounded-full border-[1.5px] border-[rgb(255_248_232/0.85)]"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0.85, 0], transform: ["scale(0.3)", "scale(2.6)"] }}
          transition={{ duration: secs(360), delay: hit, ease: EASE_OUT }}
        />
      )}
      <motion.div
        style={{ transformOrigin: "50% 85%" }}
        initial={strikes ? { opacity: 0, transform: k.frames[0] } : false}
        animate={strikes ? { opacity: 1, transform: k.frames } : { opacity: 1, transform: PIN_REST }}
        transition={
          strikes
            ? {
                opacity: { duration: secs(50), delay },
                transform: { duration: secs(ms), delay, times: k.times, ease: k.ease },
              }
            : { duration: 0 }
        }
      >
        {children}
      </motion.div>
    </div>
  );
}

// What a landing paper does to the cork around it: a dark thump under its edges, and a puff of pale dust pushed out
// from them. `at` is seconds until the impact (the paper's delay plus its flight). Both sit behind the card, take no
// layout space, and only fade and scale.
export function ImpactFx({ at }: { at: number }) {
  return (
    <>
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -inset-3 -z-10 rounded-[10px]"
        style={{ background: "radial-gradient(closest-side, rgb(14 6 2 / 0.6), transparent)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 1, 0], transform: ["scale(0.88)", "scale(1)", "scale(1.14)"] }}
        transition={{ duration: secs(320), delay: Math.max(0, at - secs(40)), times: [0, 0.2, 1], ease: EASE_OUT }}
      />
      <motion.span
        aria-hidden
        className="pointer-events-none absolute -inset-7 -z-10 rounded-[40px]"
        style={{ background: "radial-gradient(closest-side, rgb(255 238 210 / 0.5), transparent)", filter: "blur(6px)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.9, 0], transform: ["scale(0.82)", "scale(1.04)", "scale(1.26)"] }}
        transition={{ duration: secs(460), delay: at, times: [0, 0.22, 1], ease: EASE_OUT }}
      />
    </>
  );
}
