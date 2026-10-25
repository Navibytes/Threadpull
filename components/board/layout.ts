// Deterministic board layout. Each lead (a card first pinned by lead_opened) starts a case cluster. A card
// pinned by link_found is placed around the card it was linked FROM (its partner), on the side facing away
// from the cluster centre, in the first spot that overlaps no card and whose thread crosses no unrelated
// card. Placement runs in seq order and only looks at earlier cards and threads, so new rows never move
// earlier cards, and a refresh or replay of the same rows lays out the same board. No random force layout.
import type { BoardCard, BoardThread } from "@/lib/events";

// Starting values, tuned on the six-card proof run; adjust here (tests read them from this object).
export const LAYOUT = {
  // card sizes (IndexCardNode draws exactly these): the lead is a case folder, linked loans are index cards
  lead: { w: 300, h: 176 },
  linked: { w: 232, h: 148 },
  widthJitter: 10, // slightly uneven widths, from the card id
  cardH: 160, // fallback height when a card has not been measured yet
  leadNoteH: 64, // the lead's taped note hangs below the card
  gap: 40, // minimum space between cards of the same case
  caseGap: 220, // minimum space between cards of different cases, so separate cases never read as linked
  // distances from the partner card's centre, nearest ring first
  rings: [
    { rx: 420, ry: 270 },
    { rx: 820, ry: 520 },
    { rx: 1180, ry: 780 },
  ],
  // angles tried around the partner, relative to the direction facing away from the cluster centre;
  // the coarse set first, then the in-between angles
  spread: [0, 35, -35, 70, -70, 110, -110, 145, -145, 180, 18, -18, 52, -52, 90, -90, 128, -128, 162, -162],
  cluster: { w: 1300, h: 820, perRow: 2 }, // case clusters on a two-column grid
  threadSag: (len: number) => 14 + len * 0.07, // matches yarnPath in yarn-edge.tsx
  threadClearance: 12, // a thread keeps this far from unrelated card boxes
};

export type Rect = { x: number; y: number; w: number; h: number; body?: number }; // body: card height without its note
export type Spot = { x: number; y: number; cluster: number };
type Pt = { x: number; y: number };

function hash(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

// Slightly uneven but consistent sizes and tilts, from the card id (stable across reloads).
export function cardSize(id: string, lead: boolean) {
  const base = lead ? LAYOUT.lead : LAYOUT.linked;
  return { w: base.w + (hash(id) % LAYOUT.widthJitter) - Math.floor(LAYOUT.widthJitter / 2), h: base.h };
}
export const cardTilt = (id: string) => ((hash(id) % 49) - 24) / 10; // -2.4° to 2.4°

type CardIn = Pick<BoardCard, "id" | "pinnedBy" | "firstSeq"> & { note?: string | null };
type ThreadIn = Pick<BoardThread, "a" | "b" | "firstSeq">;

const isLead = (c: CardIn) => c.pinnedBy === "lead_opened";

// The box a card occupies on the board, including a lead's hanging note.
export function cardBox(c: CardIn, x: number, y: number): Rect {
  const { w, h } = cardSize(c.id, isLead(c));
  return { x, y, w, h: h + (isLead(c) && c.note ? LAYOUT.leadNoteH : 0), body: h };
}

const centreOf = (r: Rect): Pt => ({ x: r.x + r.w / 2, y: r.y + (r.body ?? r.h) / 2 });

const overlaps = (a: Rect, b: Rect, gap = LAYOUT.gap) =>
  a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap;

// Points along the sagging thread between two card centres (the curve yarn-edge.tsx draws).
export function threadPoints(p: Pt, q: Pt, samples = 16): Pt[] {
  const cx = (p.x + q.x) / 2;
  const cy = (p.y + q.y) / 2 + LAYOUT.threadSag(Math.hypot(q.x - p.x, q.y - p.y));
  return Array.from({ length: samples + 1 }, (_, i) => {
    const t = i / samples;
    return {
      x: (1 - t) ** 2 * p.x + 2 * (1 - t) * t * cx + t * t * q.x,
      y: (1 - t) ** 2 * p.y + 2 * (1 - t) * t * cy + t * t * q.y,
    };
  });
}

const inRect = (p: Pt, r: Rect, pad: number) =>
  p.x > r.x - pad && p.x < r.x + r.w + pad && p.y > r.y - pad && p.y < r.y + r.h + pad;

// Does the polyline pass through the box grown by `pad`? (segment clipping, so long hops are caught too)
export function polylineHitsRect(pts: Pt[], r: Rect, pad = LAYOUT.threadClearance) {
  const x0 = r.x - pad, y0 = r.y - pad, x1 = r.x + r.w + pad, y1 = r.y + r.h + pad;
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1];
    let t0 = 0, t1 = 1;
    const dx = b.x - a.x, dy = b.y - a.y;
    const clip = (p: number, q: number) => {
      if (p === 0) return q > 0;
      const t = q / p;
      if (p < 0) {
        if (t > t1) return false;
        if (t > t0) t0 = t;
      } else {
        if (t < t0) return false;
        if (t < t1) t1 = t;
      }
      return true;
    };
    if (clip(-dx, a.x - x0) && clip(dx, x1 - a.x) && clip(-dy, a.y - y0) && clip(dy, y1 - a.y)) return true;
  }
  return false;
}

// True when the thread between two card boxes runs through any of the other boxes.
export function threadCrossesCards(from: Rect, to: Rect, others: Rect[]) {
  // only the stretch between the two cards counts: drop the points still inside its own two cards
  const pts = threadPoints(centreOf(from), centreOf(to)).filter((p) => !inRect(p, from, 0) && !inRect(p, to, 0));
  if (pts.length < 2) return false;
  return others.some((o) => polylineHitsRect(pts, o));
}

export function layoutBoard(cards: CardIn[], threads: ThreadIn[]): Map<string, Spot> {
  const boxes = new Map<string, Rect>();
  const clusterOf = new Map<string, number>();
  const centres: Pt[] = [];

  // free of every card: the case gap applies against other cases' cards
  const fits = (r: Rect, cluster: number) =>
    [...boxes].every(([id, p]) => !overlaps(r, p, clusterOf.get(id) === cluster ? LAYOUT.gap : LAYOUT.caseGap));
  const others = (...except: string[]) => [...boxes].filter(([id]) => !except.includes(id)).map(([, r]) => r);
  for (const card of cards) {
    // threads already on the board when this card arrives (both ends placed)
    const drawn = threads.filter((t) => t.firstSeq <= card.firstSeq && boxes.has(t.a) && boxes.has(t.b));
    // how many of them a box placed here would sit on
    const blocked = (r: Rect) => drawn.filter((t) => threadCrossesCards(boxes.get(t.a)!, boxes.get(t.b)!, [r])).length;

    // the card it was linked from: the other end of the earliest thread that existed when it was pinned
    const partner = isLead(card)
      ? undefined
      : threads
          .filter((t) => t.firstSeq <= card.firstSeq && (t.a === card.id || t.b === card.id))
          .sort((x, y) => x.firstSeq - y.firstSeq)
          .map((t) => (t.a === card.id ? t.b : t.a))
          .find((other) => boxes.has(other));

    const size = cardBox(card, 0, 0);
    const at = (cx: number, cy: number): Rect => ({ ...size, x: Math.round(cx - size.w / 2), y: Math.round(cy - size.body! / 2) });
    let box: Rect | undefined;
    let cluster: number;

    if (partner === undefined) {
      // a new case: the next cell of the two-column grid
      cluster = centres.length;
      const c = {
        x: (cluster % LAYOUT.cluster.perRow) * LAYOUT.cluster.w,
        y: Math.floor(cluster / LAYOUT.cluster.perRow) * LAYOUT.cluster.h,
      };
      centres.push(c);
      for (let step = 0; !box; step++) {
        const r = at(c.x, c.y + step * (size.body! + LAYOUT.gap));
        if (fits(r, cluster) && blocked(r) === 0) box = r;
      }
    } else {
      cluster = clusterOf.get(partner)!;
      const pBox = boxes.get(partner)!;
      const p = centreOf(pBox);
      const c = centres[cluster];
      // face away from the cluster centre; the lead itself sits at the centre and starts facing right
      const away = Math.hypot(p.x - c.x, p.y - c.y) < 1 ? 0 : (Math.atan2(p.y - c.y, p.x - c.x) * 180) / Math.PI;
      let best: { r: Rect; crossings: number } | undefined;
      search: for (const ring of LAYOUT.rings) {
        for (const d of LAYOUT.spread) {
          const a = ((away + d) * Math.PI) / 180;
          const r = at(p.x + ring.rx * Math.cos(a), p.y + ring.ry * Math.sin(a));
          if (!fits(r, cluster)) continue;
          const crossings = (threadCrossesCards(pBox, r, others(partner)) ? 1 : 0) + blocked(r);
          if (crossings === 0) {
            box = r;
            break search;
          }
          if (!best || crossings < best.crossings) best = { r, crossings };
        }
      }
      // nowhere clean: the free spot with the fewest crossings, else stack below the partner
      box ??= best?.r;
      for (let step = 1; !box; step++) {
        const r = at(p.x, p.y + step * (size.body! + LAYOUT.gap) + LAYOUT.leadNoteH);
        if (fits(r, cluster)) box = r;
      }
    }

    boxes.set(card.id, box);
    clusterOf.set(card.id, cluster);
  }

  return new Map([...boxes].map(([id, r]) => [id, { x: r.x, y: r.y, cluster: clusterOf.get(id)! }]));
}

// The board boxes for a finished layout (for framing and tests).
export function layoutBoxes(cards: CardIn[], spots: Map<string, Spot>): Map<string, Rect> {
  return new Map(cards.filter((c) => spots.has(c.id)).map((c) => [c.id, cardBox(c, spots.get(c.id)!.x, spots.get(c.id)!.y)]));
}
