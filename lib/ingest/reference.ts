// Reference lookups that stand in for public data (address type and units, employer headcount).
// Written by the generator to data/out/seed<N>/reference/public_lookups.json; always simulated.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { z } from "zod";

export const ReferenceSchema = z.object({
  simulated: z.literal(true),
  note: z.string(),
  employers: z.record(z.string(), z.object({ headcount: z.number().int().positive() })),
  addresses: z.record(z.string(), z.object({
    address_type: z.enum(["single_family", "multi_unit", "commercial"]),
    units: z.number().int().positive().nullable(),
  })),
});
export type Reference = z.infer<typeof ReferenceSchema>;

export function loadReference(outDir: string): Reference {
  return ReferenceSchema.parse(JSON.parse(readFileSync(join(outDir, "reference", "public_lookups.json"), "utf8")));
}
