// Local asset preview: Hazel's four poses side by side. Development only (404 in production builds).
// This page shows artwork, not investigation state: it reads no run's events. The rehearsal below appends
// made-up rows on the page itself to show how Hazel reacts.
import { notFound } from "next/navigation";
import { HazelAvatar } from "@/components/notebook/hazel-avatar";
import { HAZEL_POSES, POSE_FOR_EVENT } from "@/lib/events";
import { HazelStage } from "./stage";

export default function HazelAssetPreview() {
  if (process.env.NODE_ENV === "production") notFound();
  const trigger = (pose: string) =>
    Object.entries(POSE_FOR_EVENT).find(([, p]) => p === pose)?.[0] ?? "no event yet (default)";

  return (
    <main className="mx-auto max-w-5xl px-6 py-8">
      <p className="w-fit rounded border border-honey bg-paper px-3 py-1.5 text-xs font-semibold tracking-[0.08em]">
        ASSET PREVIEW · development only · not investigation state
      </p>
      <h1 className="mt-4 font-display text-3xl font-semibold">Hazel&rsquo;s poses</h1>
      <p className="mt-1 text-sm text-walnut/80">
        On the board, the pose comes only from the latest of these event rows in the run.
      </p>
      <ul className="mt-6 grid grid-cols-2 gap-5 md:grid-cols-4">
        {HAZEL_POSES.map((pose) => (
          <li key={pose} className="notebook-paper flex flex-col items-center rounded-lg border border-walnut/15 py-4 pl-6 pr-4">
            <HazelAvatar pose={pose} size={160} />
            <p className="mt-3 font-medium">{pose}</p>
            <p className="text-xs text-walnut/80">
              <code>{trigger(pose)}</code>
            </p>
          </li>
        ))}
      </ul>
      <HazelStage />
    </main>
  );
}
