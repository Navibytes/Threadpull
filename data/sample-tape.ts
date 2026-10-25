// A judge's own portfolio: the development spec's patterns (one ring, the lookalikes, the review cases, the injected pay
// stub) generated with a seed and a size the judge picks, as a bank would send it. Different seed, different names,
// addresses, loan positions and background loans; the same kinds of cases. Served by GET /api/sample-tape.
// Lives in data/ because only data/ and eval/ may read a pattern spec. It returns the tape alone: the answer key and
// the generator's truth fields (kind, persona_id) never leave this file.
import type { RawLoan } from "@/lib/contracts/loan";
import { Generator } from "./generate";
import base from "./patterns/seed13.json";
import { parseSpec } from "./spec";
import { sampleProblem, type SampleRequest } from "@/lib/ingest/sample";

/** The tape for a seed and a size, without generator truth. Same request, same tape. */
export function sampleTape({ seed, loans }: SampleRequest): RawLoan[] {
  const problem = sampleProblem(seed, loans);
  if (problem) throw new Error(problem);
  const spec = parseSpec({ ...structuredClone(base), seed, n_loans: loans }, `sample seed ${seed}`);
  return new Generator(spec).run().tape.map((loan) => {
    const { kind: _kind, persona_id: _persona, ...rest } = loan as RawLoan & { kind?: unknown; persona_id?: unknown };
    return rest as RawLoan;
  });
}
