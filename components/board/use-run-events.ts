"use client";

import { useEffect, useState } from "react";
import { emptyBoard, reduceEvents, type BoardState, type RunEventFeed } from "@/lib/events";

// Folds every batch a feed delivers into board state. Swapping the feed (preview → replay → live)
// is the only change needed to put real runs on the board.
// `animateAfterSeq`: rows up to this seq were history when the board loaded (or rebuilt) and appear without
// an entrance; only rows after it animate. Until the history is in, nothing animates.
export function useRunEvents(feed: RunEventFeed): { board: BoardState; errors: string[]; animateAfterSeq: number } {
  const [board, setBoard] = useState<BoardState>(emptyBoard);
  const [errors, setErrors] = useState<string[]>([]);
  const [animateAfterSeq, setAnimateAfterSeq] = useState(Number.POSITIVE_INFINITY);
  useEffect(() => {
    setBoard(emptyBoard);
    setErrors([]);
    setAnimateAfterSeq(Number.POSITIVE_INFINITY);
    return feed.subscribe(
      (rows) => setBoard((b) => reduceEvents(rows, b)),
      (message) => setErrors((e) => (e.includes(message) ? e : [...e.slice(-4), message])),
      () => {
        setBoard(emptyBoard);
        setErrors([]);
        setAnimateAfterSeq(Number.POSITIVE_INFINITY);
      },
      (lastSeq) => setAnimateAfterSeq(lastSeq),
    );
  }, [feed]);
  return { board, errors, animateAfterSeq };
}
