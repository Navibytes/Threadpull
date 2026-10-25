// Camera maths for the board, kept pure so it can be tested. Coordinates: "board" is React Flow's flow space,
// "pane" is screen pixels inside the board's visible area. A keep-out box (Hazel's corner) is never used
// to show cards: a fit goes beside it or above/below it, whichever shows the cards larger.
export type Box = { x: number; y: number; w: number; h: number };
export type Viewport = { x: number; y: number; zoom: number };

// Starting values; adjust here.
export const FRAMING = {
  padding: { top: 56, right: 36, bottom: 28, left: 56 }, // room for the notices, the case bar and the controls
  minReadableZoom: 0.62, // below this, card text gets too small to read; frame the active case instead
  maxZoom: 1.15,
  visibleShare: 0.6, // a card counts as on screen when at least this share of it is visible
};

export function boundsOf(boxes: Box[]): Box | null {
  if (boxes.length === 0) return null;
  const x0 = Math.min(...boxes.map((b) => b.x)), y0 = Math.min(...boxes.map((b) => b.y));
  const x1 = Math.max(...boxes.map((b) => b.x + b.w)), y1 = Math.max(...boxes.map((b) => b.y + b.h));
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// The pane areas a fit may use: the whole pane, or (with a keep-out box) the full-height strips left and
// right of it and the full-width strips above and below it. Strips with no room are dropped.
export function safeAreas(pane: { w: number; h: number }, keepOut: Box | null): Box[] {
  const whole = { x: 0, y: 0, w: pane.w, h: pane.h };
  if (!keepOut || keepOut.w <= 0 || keepOut.h <= 0) return [whole];
  const right = keepOut.x + keepOut.w, bottom = keepOut.y + keepOut.h;
  return [
    { x: 0, y: 0, w: Math.max(0, keepOut.x), h: pane.h },
    { x: right, y: 0, w: Math.max(0, pane.w - right), h: pane.h },
    { x: 0, y: 0, w: pane.w, h: Math.max(0, keepOut.y) },
    { x: 0, y: bottom, w: pane.w, h: Math.max(0, pane.h - bottom) },
  ].filter((a) => a.w > 0 && a.h > 0);
}

// The largest zoom (up to maxZoom) that fits `b` inside `area` with padding, centred in it.
export function fitInto(b: Box, area: Box, maxZoom = FRAMING.maxZoom): Viewport {
  const p = FRAMING.padding;
  const aw = Math.max(1, area.w - p.left - p.right), ah = Math.max(1, area.h - p.top - p.bottom);
  const zoom = Math.min(aw / Math.max(1, b.w), ah / Math.max(1, b.h), maxZoom);
  return {
    zoom,
    x: area.x + p.left + (aw - b.w * zoom) / 2 - b.x * zoom,
    y: area.y + p.top + (ah - b.h * zoom) / 2 - b.y * zoom,
  };
}

export function bestFit(b: Box, pane: { w: number; h: number }, keepOut: Box | null): Viewport {
  return safeAreas(pane, keepOut)
    .map((a) => fitInto(b, a))
    .reduce((best, v) => (v.zoom > best.zoom ? v : best));
}

// What the camera should show: every card if that is still readable, otherwise the active case.
export function planFrame(all: Box | null, active: Box | null, pane: { w: number; h: number }, keepOut: Box | null) {
  if (!all) return null;
  const everything = bestFit(all, pane, keepOut);
  if (everything.zoom >= FRAMING.minReadableZoom || !active) return { target: "all" as const, viewport: everything };
  return { target: "case" as const, viewport: bestFit(active, pane, keepOut) };
}

const area = (b: Box) => Math.max(0, b.w) * Math.max(0, b.h);
const intersect = (a: Box, b: Box): Box => {
  const x = Math.max(a.x, b.x), y = Math.max(a.y, b.y);
  return { x, y, w: Math.min(a.x + a.w, b.x + b.w) - x, h: Math.min(a.y + a.h, b.y + b.h) - y };
};

// Cards not really on screen: less than `visibleShare` of the card is inside the pane and outside the keep-out box.
export function cardsOutOfView(
  boxes: Map<string, Box>,
  vp: Viewport,
  pane: { w: number; h: number },
  keepOut: Box | null,
): string[] {
  const view = { x: 0, y: 0, w: pane.w, h: pane.h };
  return [...boxes]
    .filter(([, b]) => {
      const s = { x: b.x * vp.zoom + vp.x, y: b.y * vp.zoom + vp.y, w: b.w * vp.zoom, h: b.h * vp.zoom };
      const inPane = intersect(s, view);
      const hidden = keepOut ? area(intersect(inPane, keepOut)) : 0;
      return (area(inPane) - hidden) / Math.max(1, area(s)) < FRAMING.visibleShare;
    })
    .map(([id]) => id);
}
