"use client";

import { useEffect, useState } from "react";
import { emptyBoard, reduceEvents, type BoardState, type RunEventFeed } from "@/lib/events";

// Folds every batch a feed delivers into board state. Swapping the feed (preview → replay → live)
// is the only change needed to put real runs on the board.
export function useRunEvents(feed: RunEventFeed): BoardState {
  const [board, setBoard] = useState<BoardState>(emptyBoard);
  useEffect(() => {
    setBoard(emptyBoard);
    return feed.subscribe((rows) => setBoard((b) => reduceEvents(rows, b)));
  }, [feed]);
  return board;
}
