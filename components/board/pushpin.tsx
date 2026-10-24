// A plastic pushpin seen from above at a slight angle, drawn in SVG (no image to load). Decorative only.
const COLORS = {
  red: { light: "#f08a7a", mid: "#c23a2c", dark: "#7c1d14" },
  brass: { light: "#f6e0a8", mid: "#c9a35a", dark: "#7d5f24" },
} as const;

export type PinColor = keyof typeof COLORS;

export function Pushpin({ color = "brass", size = 22 }: { color?: PinColor; size?: number }) {
  const c = COLORS[color];
  const id = `pin-${color}`;
  return (
    <svg aria-hidden width={size} height={size * 1.15} viewBox="0 0 22 25" className="pointer-events-none overflow-visible">
      <defs>
        <radialGradient id={id} cx="38%" cy="32%" r="70%">
          <stop offset="0%" stopColor={c.light} />
          <stop offset="55%" stopColor={c.mid} />
          <stop offset="100%" stopColor={c.dark} />
        </radialGradient>
      </defs>
      {/* shadow cast down-right onto the paper */}
      <ellipse cx="14.5" cy="17.5" rx="7" ry="3.2" fill="rgb(0 0 0 / 0.32)" />
      {/* collar and head */}
      <ellipse cx="11" cy="13" rx="6.2" ry="3.6" fill={c.dark} />
      <circle cx="11" cy="9" r="7" fill={`url(#${id})`} />
      <ellipse cx="8.4" cy="6.2" rx="2.4" ry="1.5" fill="rgb(255 255 255 / 0.55)" />
    </svg>
  );
}
