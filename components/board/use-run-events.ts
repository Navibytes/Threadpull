"use client";

import { useEffect, useState } from "react";
import { emptyBoard, reduceEvents, type BoardState, type RunEventFeed } from "@/lib/events";

// Folds every batch a feed delivers into board state. Swapping the feed (preview → replay → live)
// is the only change needed to put real runs on the board.
export function useRunEvents(feed: RunEventFeed): { board: BoardState; errors: string[] } {
  const [board, setBoard] = useState<BoardState>(emptyBoard);
  const [errors, setErrors] = useState<string[]>([]);
  useEffect(() => {
    setBoard(emptyBoard);
    setErrors([]);
    return feed.subscribe(
      (rows) => setBoard((b) => reduceEvents(rows, b)),
      (message) => setErrors((e) => (e.includes(message) ? e : [...e.slice(-4), message])),
      () => {
        setBoard(emptyBoard);
        setErrors([]);
      },
    );
  }, [feed]);
  return { board, errors };
}
