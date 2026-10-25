"use client";

import { motion, useAnimate, useReducedMotion } from "motion/react";
import { useEffect } from "react";
import type { HazelPose, HazelState } from "@/lib/events";
import { HazelAvatar } from "./hazel-avatar";

// One transform template for every frame, so Motion interpolates between them (and retargets from wherever an
// interrupted reaction was). The full string keeps the animation off CSS variables.
const t = (y: number, r: number, s: number) => `translateY(${y}%) rotate(${r}deg) scale(${s})`;
const REST = t(0, 0, 1);
const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const EASE_IN_OUT = [0.77, 0, 0.175, 1] as const;

// The one-shot reactions. Her own coordinates are mirrored (she faces the board), so these read the same either way.
// perk: a quick hop at a found link; nod: a dip and back, timed with the thread pulling back (0.7s in YarnEdge).
const REACTIONS = {
  perk: { frames: [null, t(-3.5, 0, 1.02), REST], times: [0, 0.35, 1], duration: 0.36, ease: [EASE_OUT, EASE_IN_OUT] },
  nod: { frames: [null, t(1, 2, 1), t(0, -0.8, 1), REST], times: [0, 0.3, 0.65, 1], duration: 0.6, ease: [EASE_OUT, EASE_IN_OUT, EASE_OUT] },
} as const;

// Hazel standing on the room's ledge, facing the cards. She never takes clicks: anything behind her stays usable.
// The root box is what the board's camera measures to keep cards clear of her; all motion happens on layers
// inside it, so a lean or a hop never moves that box and never moves the camera.
//   lean   (spring, held)   — leaning toward the board while a check runs
//   react  (one-shot)       — perk or nod, played once per event row (cue.key)
//   sway / breathe (CSS)    — quiet idle loops, off the main thread
// prefers-reduced-motion drops all of that movement; the pose crossfade stays.
export function HazelStanding({ pose, cue = null }: { pose: HazelPose; cue?: HazelState["cue"] }) {
  const reduce = useReducedMotion();
  const [scope, animate] = useAnimate<HTMLDivElement>();
  const kind = cue?.kind;
  const key = cue?.key;

  useEffect(() => {
    if (!key || reduce || (kind !== "perk" && kind !== "nod")) return;
    const r = REACTIONS[kind];
    const controls = animate(
      scope.current,
      { transform: [...r.frames] },
      { duration: r.duration, times: [...r.times], ease: r.ease.map((e) => [...e] as [number, number, number, number]) },
    );
    return () => controls.stop(); // a newer row takes over from the current frame
  }, [key, kind, reduce, animate, scope]);

  return (
    <div className="pointer-events-none absolute -bottom-7 -right-8 z-20 select-none">
      <div aria-hidden className="absolute inset-x-[14%] bottom-[1%] h-[5%] rounded-[50%] bg-black/55 blur-md" />
      <motion.div
        style={{ transformOrigin: "50% 94%" }}
        initial={false}
        animate={{ transform: pose === "thinking" && !reduce ? t(0, -2.5, 1) : REST }}
        transition={{ type: "spring", duration: 0.5, bounce: 0.15 }}
      >
        <div ref={scope} style={{ transformOrigin: "50% 94%" }}>
          <div className="hazel-sway">
            <div className="hazel-breathe">
              <HazelAvatar
                pose={pose}
                size={420}
                className="w-[clamp(240px,26vw,400px)] drop-shadow-[0_8px_14px_rgb(0_0_0/0.45)]"
              />
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
