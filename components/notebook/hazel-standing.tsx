import type { HazelPose } from "@/lib/events";
import { HazelAvatar } from "./hazel-avatar";

// Hazel standing in front of the board's bottom-right corner, stepping a little past the frame (her feet
// below it, her tail past its right edge), facing the cards. She never takes clicks: anything behind her
// on the board stays usable. Rendered outside the cork's clipping, by the board's wrapper.
export function HazelStanding({ pose }: { pose: HazelPose }) {
  return (
    <div className="pointer-events-none absolute -bottom-7 -right-8 z-20 select-none">
      <div aria-hidden className="absolute inset-x-[14%] bottom-[1%] h-[5%] rounded-[50%] bg-walnut/30 blur-md" />
      <HazelAvatar
        pose={pose}
        size={420}
        className="w-[clamp(240px,26vw,400px)] drop-shadow-[0_6px_10px_rgb(74_55_40/0.28)]"
      />
    </div>
  );
}
