// Investigator view (docs/ARCHITECTURE.md §2). `/?run=<run_id>` follows a run's events in Supabase. Without it the
// board shows a sample situation: `/?scenario=<id>` picks one (lib/events/scenarios.ts); the default is the phone match.
import { InvestigatorView } from "@/components/board/investigator-view";

export default async function Page({ searchParams }: { searchParams: Promise<{ run?: string | string[]; scenario?: string | string[]; replay?: string | string[] }> }) {
  const { run, scenario, replay } = await searchParams;
  // ?replay=<speed> plays the run's rows back at that speed (1 to 16) instead of showing it as it stands
  const speed = Number(typeof replay === "string" ? replay : NaN);
  return <InvestigatorView runId={typeof run === "string" && run ? run : undefined} scenario={typeof scenario === "string" ? scenario : undefined} replay={speed >= 0.25 && speed <= 16 ? speed : undefined} />;
}
