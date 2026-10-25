import type { FeedMode } from "@/lib/events";

const LABEL: Record<FeedMode, { text: string; className: string; title: string }> = {
  preview: {
    text: "PREVIEW",
    className: "border-honey bg-honey text-ink",
    title: "Hand-written synthetic fixture. Not a live or recorded investigation.",
  },
  replay: {
    text: "REPLAY",
    className: "border-dusty bg-dusty text-ink",
    title: "A recorded run's event rows, played back in seq order.",
  },
  live: {
    text: "LIVE",
    className: "border-terracotta bg-terracotta text-paper",
    title: "Event rows arriving from a running investigation.",
  },
};

export function ModeBadge({ mode, runId }: { mode: FeedMode; runId: string }) {
  const l = LABEL[mode];
  return (
    <span
      title={l.title}
      className={`inline-flex items-center gap-2 whitespace-nowrap rounded border px-2.5 py-1 text-xs font-semibold tracking-[0.12em] ${l.className}`}
    >
      {l.text}
      <span className="font-normal tracking-normal opacity-80">run {runId}</span>
    </span>
  );
}
