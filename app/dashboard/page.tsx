// Portfolio Intelligence (separate from the investigator room at `/`). `?run=<run_id>` picks a run, `?seed=` a
// portfolio, `?sample=1` the built-in sample run (labelled as such on the page).
import type { Metadata } from "next";
import { Dashboard } from "@/components/dashboard/dashboard";

export const metadata: Metadata = { title: "Portfolio Intelligence · Threadpull" };

type Params = { run?: string | string[]; seed?: string | string[]; sample?: string | string[] };
const one = (v: string | string[] | undefined) => (typeof v === "string" && v ? v : undefined);

export default async function Page({ searchParams }: { searchParams: Promise<Params> }) {
  const p = await searchParams;
  const seed = Number(one(p.seed) ?? 13);
  return <Dashboard run={one(p.run)} seed={Number.isInteger(seed) && seed > 0 ? seed : 13} sample={one(p.sample) === "1"} />;
}
