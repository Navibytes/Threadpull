// components/board/layout.ts: clusters around leads, no overlapping cards, stable and deterministic.
import { describe, expect, test } from "bun:test";
import { CARD_H, cardWidth, layoutBoard } from "@/components/board/layout";

type C = { id: string; pinnedBy: "lead_opened" | "link_found"; firstSeq: number };
type T = { a: string; b: string; firstSeq: number };

// three leads, each with linked cards; seq order interleaves the clusters like a real run would
function run(n: number) {
  const cards: C[] = [];
  const threads: T[] = [];
  let seq = 0;
  for (let i = 0; i < n; i++) {
    const lead = `LEAD-${i % 3}`;
    if (!cards.some((c) => c.id === lead)) cards.push({ id: lead, pinnedBy: "lead_opened", firstSeq: ++seq });
    const id = `L${String(i).padStart(4, "0")}`;
    threads.push({ a: lead, b: id, firstSeq: ++seq });
    cards.push({ id, pinnedBy: "link_found", firstSeq: seq });
  }
  return { cards, threads };
}

const rects = (pos: Map<string, { x: number; y: number; cluster: number }>) =>
  [...pos].map(([id, p]) => ({ id, x: p.x, y: p.y, w: cardWidth(id), h: CARD_H }));

describe("board layout", () => {
  test("30 cards in three clusters: no two cards overlap", () => {
    const { cards, threads } = run(27);
    expect(cards).toHaveLength(30);
    const r = rects(layoutBoard(cards, threads));
    for (let i = 0; i < r.length; i++)
      for (let j = i + 1; j < r.length; j++) {
        const a = r[i], b = r[j];
        const hit = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(hit ? `${a.id} overlaps ${b.id}` : "").toBe("");
      }
  });

  test("a linked card sits near its lead, not near another cluster", () => {
    const { cards, threads } = run(6);
    const pos = layoutBoard(cards, threads);
    const d = (a: string, b: string) => Math.hypot(pos.get(a)!.x - pos.get(b)!.x, pos.get(a)!.y - pos.get(b)!.y);
    expect(d("L0000", "LEAD-0")).toBeLessThan(d("L0000", "LEAD-1"));
    expect(d("L0004", "LEAD-1")).toBeLessThan(d("L0004", "LEAD-0"));
  });

  test("same rows, same layout; adding cards never moves earlier ones", () => {
    const small = run(9), big = run(20);
    const a = layoutBoard(small.cards, small.threads);
    expect(layoutBoard(small.cards, small.threads)).toEqual(a);
    const b = layoutBoard(big.cards, big.threads);
    for (const [id, p] of a) expect(b.get(id)).toEqual(p);
  });
});

describe("clusters", () => {
  test("each linked card is in its lead's cluster; leads start their own", () => {
    const { cards, threads } = run(6);
    const pos = layoutBoard(cards, threads);
    expect(pos.get("LEAD-0")!.cluster).toBe(0);
    expect(pos.get("LEAD-1")!.cluster).toBe(1);
    expect(pos.get("L0000")!.cluster).toBe(0);
    expect(pos.get("L0004")!.cluster).toBe(1);
  });
});
