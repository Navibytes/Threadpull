// Where the board and the dashboard point at each other. `run` is the recorded run on the board; without one the
// board is showing the sample run, so the dashboard opens its sample too. `case` is a lead loan id on that run.
export function dashboardHref(opts: { run?: string | null }, caseId?: string): string {
  const q = new URLSearchParams();
  if (opts.run) q.set("run", opts.run);
  else q.set("sample", "1");
  if (caseId) q.set("case", caseId);
  return `/dashboard?${q.toString()}`;
}
