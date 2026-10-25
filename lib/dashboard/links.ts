// Where the board and the dashboard point at each other. `run` is the recorded run on the board; without one the
// board is showing the sample run, so the dashboard opens its sample too. `case` is a lead loan id on that run.
/** The query that names a portfolio: a generated seed other than 13, or an uploaded tape (seed 13 is the default). */
export function portfolioQuery(portfolio: number | string | null | undefined): string {
  if (typeof portfolio === "string") return `&tape=${encodeURIComponent(portfolio)}`;
  return typeof portfolio === "number" && portfolio !== 13 ? `&seed=${portfolio}` : "";
}

/** `portfolio`: the run's seed or uploaded tape, so the dashboard reads that run's own loans. */
export function dashboardHref(opts: { run?: string | null; scenario?: string; portfolio?: number | string | null }, caseId?: string): string {
  const q = new URLSearchParams();
  if (opts.run) {
    q.set("run", opts.run);
    if (typeof opts.portfolio === "string") q.set("tape", opts.portfolio);
    else if (typeof opts.portfolio === "number" && opts.portfolio !== 13) q.set("seed", String(opts.portfolio));
  } else {
    q.set("sample", "1");
    if (opts.scenario) q.set("scenario", opts.scenario); // which sample situation
  }
  if (caseId) q.set("case", caseId);
  return `/dashboard?${q.toString()}`;
}
