"use client";

import { useEffect, useState } from "react";
import { emptyBoard, reduceEvents, type BoardState, type RunEventFeed } from "@/lib/events";

// Folds every batch a feed delivers into board state. Swapping the feed (preview → replay → live)
// is the only change needed to put real runs on the board.
// `animateAfterSeq`: rows up to this seq were history when the board loaded (or rebuilt) and appear without
// an entrance; only rows after it animate. Until the history is in, nothing animates.
// `entry`: the board was entered. A new object, once per subscription, when its history has been read: mounting
// the board (a page navigation), or swapping the feed. It carries the last seq that was history, so the board can
// lay the recorded evidence out again. A rebuild after a gap in the rows is the same board, not a new entry.
export type BoardEntry = { seq: number };

export function useRunEvents(feed: RunEventFeed): { board: BoardState; errors: string[]; animateAfterSeq: number; entry: BoardEntry | null } {
  const [board, setBoard] = useState<BoardState>(emptyBoard);
  const [errors, setErrors] = useState<string[]>([]);
  const [animateAfterSeq, setAnimateAfterSeq] = useState(Number.POSITIVE_INFINITY);
  const [entry, setEntry] = useState<BoardEntry | null>(null);
  useEffect(() => {
    let entered = false;
    setBoard(emptyBoard);
    setErrors([]);
    setAnimateAfterSeq(Number.POSITIVE_INFINITY);
    setEntry(null);
    return feed.subscribe(
      (rows) => setBoard((b) => reduceEvents(rows, b)),
      (message) => setErrors((e) => (e.includes(message) ? e : [...e.slice(-4), message])),
      () => {
        setBoard(emptyBoard);
        setErrors([]);
        setAnimateAfterSeq(Number.POSITIVE_INFINITY);
      },
      (lastSeq) => {
        setAnimateAfterSeq(lastSeq);
        if (!entered) {
          entered = true;
          setEntry({ seq: lastSeq });
        }
      },
    );
  }, [feed]);
  return { board, errors, animateAfterSeq, entry };
}
