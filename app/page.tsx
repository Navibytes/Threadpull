// Investigator view (docs/ARCHITECTURE.md §2). `/?run=<run_id>` follows a run's events in Supabase;
// without it (or without Supabase configured) the board shows the PREVIEW fixture.
import { InvestigatorView } from "@/components/board/investigator-view";

export default async function Page({ searchParams }: { searchParams: Promise<{ run?: string | string[] }> }) {
  const { run } = await searchParams;
  return <InvestigatorView runId={typeof run === "string" && run ? run : undefined} />;
}
