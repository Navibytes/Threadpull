// Investigator view (docs/ARCHITECTURE.md §2). `/?run=<run_id>` follows a run's events in Supabase. Without it the
// board shows a sample situation: `/?scenario=<id>` picks one (lib/events/scenarios.ts); the default is the phone match.
import { InvestigatorView } from "@/components/board/investigator-view";

export default async function Page({ searchParams }: { searchParams: Promise<{ run?: string | string[]; scenario?: string | string[] }> }) {
  const { run, scenario } = await searchParams;
  return <InvestigatorView runId={typeof run === "string" && run ? run : undefined} scenario={typeof scenario === "string" ? scenario : undefined} />;
}
