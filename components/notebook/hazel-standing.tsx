import type { HazelPose } from "@/lib/events";
import { HazelAvatar } from "./hazel-avatar";

// Hazel standing on the board's bottom frame at the right corner, facing the cards. She never takes
// clicks: anything behind her on the board stays usable.
export function HazelStanding({ pose }: { pose: HazelPose }) {
  return (
    <div className="pointer-events-none absolute bottom-[2px] right-4 z-10 select-none">
      <div aria-hidden className="absolute inset-x-[14%] bottom-[1%] h-[5%] rounded-[50%] bg-walnut/30 blur-md" />
      <HazelAvatar
        pose={pose}
        size={360}
        className="w-[clamp(200px,22vw,340px)] drop-shadow-[0_6px_10px_rgb(74_55_40/0.28)]"
      />
    </div>
  );
}
