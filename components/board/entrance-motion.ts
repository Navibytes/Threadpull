// The shapes of the Paper → Pin → Thread motion: the keyframes and curves, with no React and no clock. Everything is
// derived from the card's id and its resting tilt, so the same card is thrown the same way every time the board is
// entered, live or replayed. All transforms are written with the same function list (translate, rotate, scale), which
// is what lets the browser interpolate between them on the compositor.
import { ENTRANCE } from "./entrance-plan";

export type Bezier = [number, number, number, number];

// Arriving things: a strong ease-out (the animate skill's --ease-out). The built-in ease-out is too weak.
export const EASE_OUT: Bezier = [0.23, 1, 0.32, 1];
// A thrown sheet: it is already moving on the first frame (no slow start to wait through) and is fastest where it
// hits the board. Its end slope is steep on purpose; the squash that follows is the impact.
export const EASE_THROW: Bezier = [0.3, 0.25, 0.75, 0.55];

const t = (x: number, y: number, deg: number, sx = 1, sy = 1) => `translate(${x}px, ${y}px) rotate(${deg}deg) scale(${sx}, ${sy})`;

// A card at rest: its tilt, and (while selected) lifted three pixels.
export const atRest = (tilt: number, lifted = false) => t(0, lifted ? -3 : 0, tilt);

export type Keyframes = { frames: string[]; times: number[]; ease: Bezier[] };

// The paper is thrown from above, slams down, squashes on impact, rebounds, wobbles and rests. Rotation about the
// card's pin corner (the node's transform-origin), so the far corner swings. Impact is the second frame.
export function slam(tilt: number, h: number): Keyframes & { rise: number; spin: number } {
  const dir = h % 2 === 0 ? 1 : -1;
  const spin = 8 + ((h >> 3) % 5); // 8 to 12 degrees off its resting tilt
  const rise = 110 + ((h >> 6) % 51); // 110 to 160 px above where it lands
  const drift = (((h >> 10) % 5) - 2) * 7; // a little sideways, so a row of cards isn't a row of identical drops
  return {
    rise,
    spin,
    frames: [
      t(drift, -rise, tilt + dir * spin, 1.08, 1.08), // in the air: nearer the viewer, so larger
      t(0, 3, tilt + dir * 1.6, 1.05, 0.93), // impact: squashed flat against the cork
      t(0, -6, tilt - dir * 2.6, 0.992, 1.018), // rebound
      t(0, 1.5, tilt + dir * 1.3, 1.004, 0.996), // wobble
      t(0, -0.8, tilt - dir * 0.5),
      atRest(tilt),
    ],
    times: [0, ENTRANCE.impactAt, 0.68, 0.8, 0.91, 1],
    ease: [EASE_THROW, EASE_OUT, EASE_OUT, EASE_OUT, EASE_OUT],
  };
}

// A pin falls from above, strikes (pressed in, a little too far), rebounds and settles. The tie pins at the ends of
// a yarn travel less.
export function strike(tie = false): Keyframes {
  const lift = tie ? 14 : 30;
  const big = tie ? 1.5 : 1.9;
  return {
    frames: [
      `translateY(${-lift}px) scale(${big})`,
      "translateY(0px) scale(0.84)",
      "translateY(-3px) scale(1.1)",
      "translateY(0px) scale(0.97)",
      "translateY(0px) scale(1)",
    ],
    times: [0, ENTRANCE.pinStrikeAt, 0.74, 0.88, 1],
    ease: [EASE_THROW, EASE_OUT, EASE_OUT, EASE_OUT],
  };
}

export const PIN_REST = "translateY(0px) scale(1)";

// The paper shudders where the pin went in, once, then is still.
export const SHUDDER = {
  frames: [
    "translate(0px, 0px) rotate(0deg)",
    "translate(0.6px, 1.8px) rotate(0.5deg)",
    "translate(-0.5px, -1px) rotate(-0.4deg)",
    "translate(0.3px, 0.6px) rotate(0.2deg)",
    "translate(-0.1px, -0.2px) rotate(-0.08deg)",
    "translate(0px, 0px) rotate(0deg)",
  ],
  times: [0, 0.12, 0.38, 0.62, 0.82, 1],
} as const;
export const NO_SHUDDER = SHUDDER.frames[0];

// The yarn's sag is scaled through these multiples of its resting sag while it settles: straight and taut while it is
// drawn, an overshoot deeper than rest when the tension releases, a rebound shallower than rest, then rest (1).
export function yarnSettle() {
  const draw = ENTRANCE.yarnDrawMs / (ENTRANCE.yarnDrawMs + ENTRANCE.yarnSettleMs);
  return {
    sag: [0, 0, 1.5, 0.86, 1],
    times: [0, draw, draw + (1 - draw) * 0.45, draw + (1 - draw) * 0.75, 1],
  };
}
