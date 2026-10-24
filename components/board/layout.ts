// Deterministic board layout. Each lead (a card first pinned by lead_opened) is the centre of a cluster; a
// card pinned by link_found joins the cluster of the card it was linked from, in the first free slot around
// that cluster. A card's spot depends only on rows up to its own seq, so new cards never move earlier ones,
// and a refresh or replay of the same rows lays out the same board. No random force layout.
import type { BoardCard, BoardThread } from "@/lib/events";

export const CARD_H = 178; // nominal height used for spacing (cards are about this tall)
const GAP = 34; // minimum space between cards
const CLUSTER_W = 1100; // distance between cluster centres
const CLUSTER_H = 560;
const CLUSTERS_PER_COLUMN = 3; // clusters stack down first: the board shows more height than width beside Hazel

// Slots around a cluster centre: [angle in degrees (0 = right, 90 = down), ring]. Sideways first, so yarn
// runs between cards rather than over them; further rings when the first fills up.
const SLOTS: [number, number][] = [
  [0, 0], [180, 0], [38, 0], [142, 0], [-38, 0], [-142, 0],
  [0, 1], [180, 1], [20, 1], [160, 1], [-20, 1], [-160, 1], [56, 1], [124, 1], [-56, 1], [-124, 1], [90, 1], [-90, 1],
];
const RING = [
  { rx: 370, ry: 235 },
  { rx: 700, ry: 430 },
];

function hash(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return Math.abs(h);
}

// Slightly uneven but consistent sizes and tilts, from the card id (stable across reloads).
export const cardWidth = (id: string) => 248 + (hash(id) % 23); // 248-270 px
export const cardTilt = (id: string) => ((hash(id) % 49) - 24) / 10; // -2.4° to 2.4°

type Rect = { x: number; y: number; w: number; h: number };
const overlaps = (a: Rect, b: Rect) =>
  a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP && a.y < b.y + b.h + GAP && b.y < a.y + a.h + GAP;

export function layoutBoard(
  cards: Pick<BoardCard, "id" | "pinnedBy" | "firstSeq">[],
  threads: Pick<BoardThread, "a" | "b" | "firstSeq">[],
): Map<string, { x: number; y: number; cluster: number }> {
  const placed = new Map<string, Rect>();
  const clusterOf = new Map<string, number>(); // card id -> cluster index
  const centres: { x: number; y: number }[] = [];
  const free = (r: Rect) => [...placed.values()].every((p) => !overlaps(r, p));
  const rectAt = (id: string, cx: number, cy: number): Rect => {
    const w = cardWidth(id);
    return { x: Math.round(cx - w / 2), y: Math.round(cy - CARD_H / 2), w, h: CARD_H };
  };

  for (const card of cards) {
    // the card it was linked from: an endpoint of a thread that existed when this card was pinned
    const partner =
      card.pinnedBy === "lead_opened"
        ? undefined
        : threads
            .filter((t) => t.firstSeq <= card.firstSeq && (t.a === card.id || t.b === card.id))
            .map((t) => (t.a === card.id ? t.b : t.a))
            .find((other) => clusterOf.has(other));

    if (partner === undefined) {
      // a new cluster, placed in reading order
      const k = centres.length;
      const centre = { x: Math.floor(k / CLUSTERS_PER_COLUMN) * CLUSTER_W, y: (k % CLUSTERS_PER_COLUMN) * CLUSTER_H };
      centres.push(centre);
      let r = rectAt(card.id, centre.x, centre.y);
      for (let step = 1; !free(r); step++) r = rectAt(card.id, centre.x, centre.y + step * (CARD_H + GAP));
      placed.set(card.id, r);
      clusterOf.set(card.id, k);
      continue;
    }

    const k = clusterOf.get(partner)!;
    const { x: cx, y: cy } = centres[k];
    let rect: Rect | undefined;
    for (const [deg, ring] of SLOTS) {
      const a = (deg * Math.PI) / 180;
      const r = rectAt(card.id, cx + RING[ring].rx * Math.cos(a), cy + RING[ring].ry * Math.sin(a));
      if (free(r)) {
        rect = r;
        break;
      }
    }
    // every slot taken: stack below the cluster until there is room
    for (let step = 1; !rect; step++) {
      const r = rectAt(card.id, cx, cy + RING[1].ry + step * (CARD_H + GAP));
      if (free(r)) rect = r;
    }
    placed.set(card.id, rect);
    clusterOf.set(card.id, k);
  }

  return new Map([...placed].map(([id, r]) => [id, { x: r.x, y: r.y, cluster: clusterOf.get(id)! }]));
}
