"use client";

import { ViewportPortal } from "@xyflow/react";

const TILE = 1100; // px of board per cork tile at zoom 1
const REACH = TILE * 10; // the cork extends this far from the canvas origin in every direction (whole tiles keep it aligned)

// The cork, drawn inside React Flow's own viewport layer: it pans and zooms with the cards, like a real board
// under a moving camera. Because it lives in the transformed layer, the browser moves it by compositing; it is
// not re-rendered or repainted on a pan or zoom frame (it used to rewrite its background position and size from
// the viewport transform every frame). A dark tint keeps it moody and the labels readable; the fallback colour
// shows if the texture is missing. Behind everything, never takes clicks.
export function CorkSurface() {
  return (
    <ViewportPortal>
      <div
        aria-hidden
        className="cork-surface pointer-events-none absolute"
        style={{
          zIndex: -1,
          left: -REACH,
          top: -REACH,
          width: REACH * 2,
          height: REACH * 2,
          backgroundImage: 'linear-gradient(rgb(28 14 5 / 0.34), rgb(28 14 5 / 0.34)), url("/assets/detective/cork-dark.webp")',
          backgroundSize: `auto, ${TILE}px ${TILE}px`,
        }}
      />
    </ViewportPortal>
  );
}
