// components/board/layout.ts: cards around the card they were linked from, no overlaps, no thread through an
// unrelated card, stable and deterministic.
import { describe, expect, test } from "bun:test";
import { cardBox, LAYOUT, layoutBoard, layoutBoxes, threadCrossesCards, type Rect } from "@/components/board/layout";

type C = { id: string; pinnedBy: "lead_opened" | "link_found"; firstSeq: number; note?: string | null };
type T = { id: string; a: string; b: string; firstSeq: number };

// The six-card LIVE proof run (proof-1792876100530), in the order the board pins them.
const PROOF_CARDS: C[] = [
  { id: "PROOF-01", pinnedBy: "lead_opened", firstSeq: 2, note: "Hand-inserted lead." },
  { id: "PROOF-02", pinnedBy: "link_found", firstSeq: 3 },
  { id: "PROOF-04", pinnedBy: "lead_opened", firstSeq: 4, note: "Seq 4, inserted after seq 5." },
  { id: "PROOF-03", pinnedBy: "link_found", firstSeq: 5 },
  { id: "PROOF-06", pinnedBy: "lead_opened", firstSeq: 6, note: "Seq 6, inserted 3 s after seq 7." },
  { id: "PROOF-05", pinnedBy: "link_found", firstSeq: 7 },
];
const PROOF_THREADS: T[] = [
  { id: "e-phone-proof", a: "PROOF-01", b: "PROOF-02", firstSeq: 3 },
  { id: "e-email-proof", a: "PROOF-02", b: "PROOF-03", firstSeq: 5 },
  { id: "e-device-proof", a: "PROOF-04", b: "PROOF-05", firstSeq: 7 },
];

// Three leads, each with linked cards (some chained), interleaved like a real run.
function run(n: number) {
  const cards: C[] = [];
  const threads: T[] = [];
  let seq = 0;
  for (let i = 0; i < n; i++) {
    const lead = `LEAD-${i % 3}`;
    if (!cards.some((c) => c.id === lead)) cards.push({ id: lead, pinnedBy: "lead_opened", firstSeq: ++seq, note: "note" });
    const id = `L${String(i).padStart(4, "0")}`;
    // every fourth card hangs off the previous card of its case instead of the lead (a chain)
    const prev = cards.filter((c) => c.id.startsWith("L0") && Number(c.id.slice(1)) % 3 === i % 3).at(-1);
    const from = i % 4 === 3 && prev ? prev.id : lead;
    threads.push({ id: `e${i}`, a: from, b: id, firstSeq: ++seq });
    cards.push({ id, pinnedBy: "link_found", firstSeq: seq });
  }
  return { cards, threads };
}

function audit(cards: C[], threads: T[]) {
  const spots = layoutBoard(cards, threads);
  const boxes = layoutBoxes(cards, spots);
  const overlaps: string[] = [];
  const ids = [...boxes.keys()];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const a = boxes.get(ids[i])!, b = boxes.get(ids[j])!;
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) overlaps.push(`${ids[i]}/${ids[j]}`);
    }
  const crossings = threads
    .filter((t) => boxes.has(t.a) && boxes.has(t.b))
    .filter((t) => {
      const others = [...boxes].filter(([id]) => id !== t.a && id !== t.b).map(([, r]) => r);
      return threadCrossesCards(boxes.get(t.a)!, boxes.get(t.b)!, others);
    })
    .map((t) => t.id);
  return { spots, boxes, overlaps, crossings };
}

const centre = (r: Rect) => ({ x: r.x + r.w / 2, y: r.y + 89 });
const dist = (a: Rect, b: Rect) => Math.hypot(centre(a).x - centre(b).x, centre(a).y - centre(b).y);

describe("six-card proof run", () => {
  const { spots, boxes, overlaps, crossings } = audit(PROOF_CARDS, PROOF_THREADS);

  test("no two cards overlap and no thread runs through an unrelated card", () => {
    expect(overlaps).toEqual([]);
    expect(crossings).toEqual([]);
  });

  test("PROOF-03 hangs off PROOF-02, its partner, and its thread clears lead PROOF-01", () => {
    const p1 = boxes.get("PROOF-01")!, p2 = boxes.get("PROOF-02")!, p3 = boxes.get("PROOF-03")!;
    expect(threadCrossesCards(p2, p3, [p1])).toBe(false);
    expect(dist(p3, p2)).toBeLessThan(dist(p3, p1));
    // it continues away from the lead rather than doubling back across it
    expect(Math.sign(centre(p3).x - centre(p2).x)).toBe(Math.sign(centre(p2).x - centre(p1).x));
  });

  test("each linked card shares its partner's case; each lead starts its own", () => {
    expect(spots.get("PROOF-02")!.cluster).toBe(spots.get("PROOF-01")!.cluster);
    expect(spots.get("PROOF-03")!.cluster).toBe(spots.get("PROOF-01")!.cluster);
    expect(spots.get("PROOF-05")!.cluster).toBe(spots.get("PROOF-04")!.cluster);
    expect(new Set([spots.get("PROOF-01")!.cluster, spots.get("PROOF-04")!.cluster, spots.get("PROOF-06")!.cluster]).size).toBe(3);
  });

  test("cards of different cases keep the wider case gap", () => {
    const ids = [...boxes.keys()];
    for (const a of ids)
      for (const b of ids) {
        if (a >= b || spots.get(a)!.cluster === spots.get(b)!.cluster) continue;
        const A = boxes.get(a)!, B = boxes.get(b)!;
        const gapX = Math.max(B.x - (A.x + A.w), A.x - (B.x + B.w));
        const gapY = Math.max(B.y - (A.y + A.h), A.y - (B.y + B.h));
        expect([a, b, Math.max(gapX, gapY) >= LAYOUT.caseGap]).toEqual([a, b, true]);
      }
  });

  test("a lead's box includes its hanging note", () => {
    expect(boxes.get("PROOF-01")!.h).toBeGreaterThan(cardBox({ id: "PROOF-02", pinnedBy: "link_found", firstSeq: 3 }, 0, 0).h);
  });
});

describe("thirty cards in three cases, with chains", () => {
  const { cards, threads } = run(27);
  const { overlaps, crossings } = audit(cards, threads);

  test("no overlaps and no thread through an unrelated card", () => {
    expect(cards).toHaveLength(30);
    expect(overlaps).toEqual([]);
    expect(crossings).toEqual([]);
  });
});

describe("stability", () => {
  test("same rows, same layout", () => {
    expect(layoutBoard(PROOF_CARDS, PROOF_THREADS)).toEqual(layoutBoard(PROOF_CARDS, PROOF_THREADS));
  });

  test("new rows never move cards already on the board", () => {
    for (let k = 1; k < PROOF_CARDS.length; k++) {
      const seq = PROOF_CARDS[k - 1].firstSeq;
      const before = layoutBoard(PROOF_CARDS.slice(0, k), PROOF_THREADS.filter((t) => t.firstSeq <= seq));
      const after = layoutBoard(PROOF_CARDS, PROOF_THREADS);
      for (const [id, p] of before) expect(after.get(id)).toEqual(p);
    }
    const small = run(9), big = run(20);
    const a = layoutBoard(small.cards, small.threads), b = layoutBoard(big.cards, big.threads);
    for (const [id, p] of a) expect(b.get(id)).toEqual(p);
  });
});
