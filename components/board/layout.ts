// Deterministic placement: a card's spot depends only on the order it was pinned, so a refresh or a
// replay of the same rows puts every card in the same place. No random force layout.
const COLS = 3;
const COL_W = 420;
const ROW_H = 320;

export function cardPosition(index: number) {
  const col = index % COLS;
  const row = Math.floor(index / COLS);
  return { x: col * COL_W + (row % 2) * (COL_W / 2), y: row * ROW_H + (col % 2) * 70 };
}

// A slight tilt per card, hashed from its id (stable across reloads), between -2.4° and 2.4°.
export function cardTilt(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return ((Math.abs(h) % 49) - 24) / 10;
}
