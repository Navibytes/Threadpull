"use client";

import { useNodesInitialized, useReactFlow, type FitViewOptions } from "@xyflow/react";
import { useReducedMotion } from "motion/react";
import { useEffect, type RefObject } from "react";

// Keeps the active case framed: when the latest event lands in a cluster (or that cluster grows), the camera
// moves to fit that cluster. Not while the viewer has panned or zoomed by hand; pressing "fit view" shows the
// whole board and hands framing back.
export function AutoFrame({
  focusIds,
  userMoved,
  options,
}: {
  focusIds: string[];
  userMoved: RefObject<boolean>;
  options: FitViewOptions;
}) {
  const { fitView } = useReactFlow();
  const measured = useNodesInitialized(); // every card has a size, so the fit is right
  const reduce = useReducedMotion();
  const key = focusIds.join("|");
  useEffect(() => {
    if (!key || !measured || userMoved.current) return;
    const nodes = key.split("|").map((id) => ({ id }));
    const raf = requestAnimationFrame(() => void fitView({ ...options, nodes, duration: reduce ? 0 : 500 }));
    return () => cancelAnimationFrame(raf);
  }, [key, measured, fitView, options, reduce, userMoved]);
  return null;
}
