"use client";

import { useStore } from "@xyflow/react";

const TILE = 1100; // px of board per cork tile at zoom 1

// The cork, drawn inside React Flow and anchored to the canvas: it pans and zooms with the cards, like a real
// board under a moving camera. A dark tint keeps it moody and the labels readable; the fallback colour shows
// if the texture is missing. Behind everything, never takes clicks.
export function CorkSurface() {
  const [x, y, zoom] = useStore((s) => s.transform);
  const size = TILE * zoom;
  return (
    <div
      aria-hidden
      className="cork-surface pointer-events-none absolute inset-0"
      style={{
        zIndex: -1,
        backgroundImage: 'linear-gradient(rgb(28 14 5 / 0.34), rgb(28 14 5 / 0.34)), url("/assets/detective/cork-dark.webp")',
        backgroundSize: `auto, ${size}px ${size}px`,
        backgroundPosition: `0 0, ${x}px ${y}px`,
      }}
    />
  );
}
