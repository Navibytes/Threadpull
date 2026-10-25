// What a visitor may ask GET /api/sample-tape for (the generator itself is data/sample-tape.ts, server-only). Shared by
// the route and the upload page, so the page offers exactly what the route serves.

/** Loan counts offered. The planted cases alone take about 200 loans. */
export const SAMPLE_SIZES = [300, 500, 1000] as const;
export const MAX_SAMPLE_SEED = 999_999;

export type SampleRequest = { seed: number; loans: number };

/** Why a request can't be served, or null. */
export function sampleProblem(seed: number, loans: number): string | null {
  if (!Number.isInteger(seed) || seed < 1 || seed > MAX_SAMPLE_SEED) return `the seed must be a whole number from 1 to ${MAX_SAMPLE_SEED.toLocaleString("en-US")}`;
  if (!(SAMPLE_SIZES as readonly number[]).includes(loans)) return `the number of loans must be one of ${SAMPLE_SIZES.join(", ")}`;
  return null;
}

export const sampleName = ({ seed, loans }: SampleRequest) => `sample-tape-seed${seed}-${loans}-loans.json`;
export const sampleUrl = ({ seed, loans }: SampleRequest) => `/api/sample-tape?seed=${seed}&loans=${loans}`;
