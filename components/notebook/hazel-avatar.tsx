import Image from "next/image";
import { HAZEL_POSES, type HazelPose } from "@/lib/events";

// Hazel's artwork in public/hazel/ (1219 × 1290 PNG, transparent background).
const SRC: Record<HazelPose, string> = {
  idle: "/hazel/hazel-idle.png",
  thinking: "/hazel/hazel-thinking.png",
  discovery: "/hazel/hazel-discovery.png",
  resolved: "/hazel/hazel-resolved.png",
};

const ALT: Record<HazelPose, string> = {
  idle: "Hazel, waiting",
  thinking: "Hazel, thinking",
  discovery: "Hazel, pointing out a discovery",
  resolved: "Hazel, pleased with a resolved clue",
};

// All four poses are stacked and the current one fades in, so a pose change never waits for a download.
// The fade and lift are turned off for prefers-reduced-motion (see .hazel-pose in globals.css).
// `size` is the largest width it is drawn at (it picks the image resolution); `className` can make it fluid.
export function HazelAvatar({ pose, size = 88, className }: { pose: HazelPose; size?: number; className?: string }) {
  const height = Math.round((size * 1290) / 1219);
  return (
    <div className={`relative shrink-0 ${className ?? ""}`} style={{ width: className ? undefined : size, aspectRatio: "1219 / 1290" }}>
      {HAZEL_POSES.map((p) => (
        <Image
          key={p}
          src={SRC[p]}
          alt={p === pose ? ALT[p] : ""}
          aria-hidden={p !== pose}
          width={size}
          height={height}
          sizes={`${size}px`}
          loading="eager"
          data-active={p === pose}
          className="hazel-pose absolute inset-0 h-full w-full object-contain"
        />
      ))}
    </div>
  );
}
