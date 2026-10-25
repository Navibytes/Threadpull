// Development rehearsal for the board's Paper → Pin → Thread entrance. The real corkboard, fed one sample row at a
// time by a button, so a live row's entrance can be watched; "Restart" re-enters the board, and the dashboard link
// is for going away and coming back. Sample rows only; this reads no run's events. 404 in production builds.
import { notFound } from "next/navigation";
import { EntranceStage } from "./stage";

export default function EntranceRehearsal() {
  if (process.env.NODE_ENV === "production") notFound();
  return <EntranceStage />;
}
