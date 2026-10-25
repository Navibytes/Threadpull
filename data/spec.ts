// The pattern spec the generator plants (ticket 12): a Zod schema plus the cross-checks a schema can't express, so a
// hand-written held-out spec fails loudly with a readable message instead of planting something other than intended.
// Only the generator and data/check.ts read specs; detection code never does (tests/architecture.test.ts).
import { z } from "zod";

/** Persona ids from data/personas.json (the CRS sandbox's 20 identities). */
export const PERSONA_IDS = Array.from({ length: 20 }, (_, i) => `P${String(i + 1).padStart(2, "0")}`);
/** The identifiers a ring can share between members (the generator copies the first member's value). */
export const RING_SHARED_KINDS = ["phone", "bank_account", "device_id", "ip_address"] as const;

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "a date like 2026-08-11");
const persona = z.enum(PERSONA_IDS as [string, ...string[]]);
const dealerId = z.string().regex(/^D\d{2}$/, "a dealer id like D03");
const brokerId = z.string().regex(/^B\d{2}$/, "a broker id like B07");
const count = z.number().int().nonnegative();
const employer = z.strictObject({ name: z.string().min(1), headcount: z.number().int().positive(), job_titles: z.array(z.string().min(1)).min(1) });

const Ring = z.strictObject({
  type: z.literal("ring"),
  ring_id: z.string().regex(/^[A-Z0-9-]+$/, "upper-case letters, digits and dashes, like RING-1"),
  dealer: dealerId,
  broker: brokerId,
  personas: z.array(persona).min(1),
  background_members: count,
  window_days: z.number().int().positive(),
  start: isoDate,
  shared: z.array(z.strictObject({ kind: z.enum(RING_SHARED_KINDS), members: z.array(z.string()).min(2) })),
  employers: z.array(z.strictObject({ name: z.string().min(1), headcount: z.number().int().positive(), members: z.array(z.string()).min(1) })),
  recycled_pay_stub: z.boolean().optional(),
  vin_year_mismatch: z.array(z.string()).optional(),
});
const Pattern = z.discriminatedUnion("type", [
  Ring,
  z.strictObject({ type: z.literal("shared_building"), persona, background_members: count.min(1), units: z.number().int().positive(), proving_check: z.string().min(1) }),
  z.strictObject({ type: z.literal("large_employer"), personas: z.array(persona).optional(), background_members: count, employer, proving_check: z.string().optional(), truth: z.string().optional() }),
  z.strictObject({ type: z.literal("small_employer"), personas: z.array(persona).optional(), background_members: count, employer, proving_check: z.string().optional(), truth: z.string().optional() }),
  z.strictObject({ type: z.literal("household"), persona, spouse: z.strictObject({ first_name: z.string().min(1), last_name: z.string().min(1) }), proving_check: z.string().min(1) }),
  z.strictObject({ type: z.literal("dealer_burst"), dealer: dealerId, month: z.string().regex(/^\d{4}-\d{2}$/, "a month like 2026-08"), count: count.min(1),
    history_month_end_share: z.number().min(0).max(1), proving_check: z.string().min(1) }),
  z.strictObject({ type: z.literal("review"), persona, expected_status: z.enum(["Investigate", "Insufficient evidence"]), reason: z.string().min(1) }),
  z.strictObject({ type: z.literal("risky_real"), personas: z.array(persona).min(1), expected_action: z.string().min(1) }),
  // into a ring member planted above ("RING-1:bg1"), or a persona's own loan: exactly one of the two
  z.strictObject({ type: z.literal("injection"), target: z.string().min(1).optional(), persona: persona.optional() }),
]);

export const SpecSchema = z.strictObject({
  seed: z.number().int().positive(),
  n_loans: z.number().int().min(100).max(9999), // loan ids are L0001…L9999
  tape_date: isoDate,
  origination_start: isoDate,
  origination_end: isoDate,
  n_dealers: z.number().int().min(1).max(24), // DEALER_NAMES in data/generate.ts
  n_brokers: z.number().int().min(1).max(99),
  pin: z.partialRecord(persona, z.string().regex(/^L\d{4}$/)).optional(),
  patterns: z.array(Pattern).min(1),
});
export type Spec = z.infer<typeof SpecSchema>;
type Pattern = z.infer<typeof Pattern>;

/** Rough count of the loans patterns plant (a dealer burst also adds 5–8 history loans a month). */
function planted(p: Pattern, months: number): number {
  switch (p.type) {
    case "ring": return p.personas.length + p.background_members;
    case "shared_building": return 1 + p.background_members;
    case "large_employer": case "small_employer": return (p.personas?.length ?? 0) + p.background_members;
    case "household": return 2;
    case "dealer_burst": return p.count + 8 * months;
    case "review": return 1;
    case "risky_real": return p.personas.length;
    case "injection": return p.persona ? 1 : 0;
  }
}

/** What a schema can't say: every reference resolves, every persona is planted once, dates and counts fit. */
export function specProblems(spec: Spec): string[] {
  const out: string[] = [];
  const day = (s: string) => Date.parse(`${s}T00:00:00Z`);
  const [start, end] = [day(spec.origination_start), day(spec.origination_end)];
  if (!(start < end)) out.push("origination_start must be before origination_end");
  if (day(spec.tape_date) < end) out.push("tape_date must be on or after origination_end");
  const dealerOk = (d: string) => Number(d.slice(1)) >= 1 && Number(d.slice(1)) <= spec.n_dealers;
  const brokerOk = (b: string) => Number(b.slice(1)) >= 1 && Number(b.slice(1)) <= spec.n_brokers;

  const used = new Map<string, number>(); // persona -> pattern index
  const tags = new Set<string>(); // planted loans an injection can target, in order
  const ringIds = new Set<string>();
  spec.patterns.forEach((p, i) => {
    const at = `patterns[${i}] (${p.type})`;
    const take = (pid: string) => {
      if (used.has(pid)) out.push(`${at}: ${pid} is already planted by patterns[${used.get(pid)}]; each persona has one loan`);
      else used.set(pid, i);
    };
    if (p.type === "ring") {
      if (ringIds.has(p.ring_id)) out.push(`${at}: ring_id ${p.ring_id} is used twice`);
      ringIds.add(p.ring_id);
      if (!dealerOk(p.dealer)) out.push(`${at}: dealer ${p.dealer} is outside D01…D${String(spec.n_dealers).padStart(2, "0")} (n_dealers)`);
      if (!brokerOk(p.broker)) out.push(`${at}: broker ${p.broker} is outside B01…B${String(spec.n_brokers).padStart(2, "0")} (n_brokers)`);
      if (day(p.start) < start || day(p.start) + p.window_days * 86_400_000 > end)
        out.push(`${at}: start + window_days must fall inside origination_start…origination_end`);
      p.personas.forEach(take);
      const members = new Set([...p.personas, ...Array.from({ length: p.background_members }, (_, k) => `bg${k + 1}`)]);
      const known = (m: string, where: string) => {
        if (!members.has(m)) out.push(`${at}: ${where} names ${m}, not a member (members: ${[...members].join(", ")})`);
      };
      for (const s of p.shared) {
        s.members.forEach((m) => known(m, `shared ${s.kind}`));
        if (new Set(s.members).size !== s.members.length) out.push(`${at}: shared ${s.kind} lists a member twice`);
      }
      const employed = new Set<string>();
      for (const e of p.employers)
        for (const m of e.members) {
          known(m, `employer ${e.name}`);
          if (employed.has(m)) out.push(`${at}: ${m} is listed under two employers`);
          employed.add(m);
        }
      for (const m of p.vin_year_mismatch ?? []) known(m, "vin_year_mismatch");
      for (const m of members) tags.add(`${p.ring_id}:${m}`);
    }
    if (p.type === "shared_building" || p.type === "household" || p.type === "review") take(p.persona);
    if (p.type === "large_employer" || p.type === "small_employer") (p.personas ?? []).forEach(take);
    if (p.type === "risky_real") p.personas.forEach(take);
    if (p.type === "dealer_burst") {
      if (!dealerOk(p.dealer)) out.push(`${at}: dealer ${p.dealer} is outside D01…D${String(spec.n_dealers).padStart(2, "0")} (n_dealers)`);
      const m = day(`${p.month}-01`);
      if (m < day(spec.origination_start.slice(0, 7) + "-01") || m > end) out.push(`${at}: month ${p.month} is outside the origination window`);
    }
    if (p.type === "injection") {
      if (!p.target === !p.persona) out.push(`${at}: give exactly one of target (a ring member, e.g. RING-1:bg1) or persona`);
      else if (p.persona) take(p.persona);
      else if (!tags.has(p.target!)) out.push(`${at}: target ${p.target} is not a ring member planted above (e.g. RING-1:bg1); list the ring first`);
    }
  });

  const bursts = spec.patterns.filter((p) => p.type === "dealer_burst").map((p) => p.dealer);
  if (new Set(bursts).size !== bursts.length) out.push("two dealer_burst patterns name the same dealer");

  for (const [pid, loanId = ""] of Object.entries(spec.pin ?? {}))
    if (Number(loanId.slice(1)) < 1 || Number(loanId.slice(1)) > spec.n_loans) out.push(`pin ${pid} -> ${loanId} is outside L0001…L${String(spec.n_loans).padStart(4, "0")}`);

  const months = Math.max(1, Math.ceil((end - start) / (30.4 * 86_400_000)));
  const plantedLoans = spec.patterns.reduce((s, p) => s + planted(p, months), 0) + (PERSONA_IDS.length - used.size);
  if (plantedLoans > spec.n_loans) out.push(`patterns plant about ${plantedLoans} loans, more than n_loans (${spec.n_loans})`);
  return out;
}

/** Parse and cross-check a spec; throws one error listing every problem. */
export function parseSpec(raw: unknown, name = "spec"): Spec {
  const r = SpecSchema.safeParse(raw);
  if (!r.success) throw new Error(`${name} is not a valid pattern spec:\n${r.error.issues.map((i) => `  - ${i.path.join(".") || "spec"}: ${i.message}`).join("\n")}`);
  const problems = specProblems(r.data);
  if (problems.length) throw new Error(`${name} is not a valid pattern spec:\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  return r.data;
}
