// What a visitor may ask GET /api/sample-tape for (the generator itself is data/sample-tape.ts, server-only). Shared by
// the route and the upload page, so the page offers exactly what the route serves.

/** Any loan count in this range; the planted cases alone take about 200 loans, and 2,000 stays far under the 10 MB
 * upload limit. The presets are quick picks on the page. */
export const MIN_SAMPLE_LOANS = 250;
export const MAX_SAMPLE_LOANS = 2000;
export const SAMPLE_SIZES = [300, 500, 1000] as const;
export const MAX_SAMPLE_SEED = 999_999;

export type SampleRequest = { seed: number; loans: number };

/** Why a request can't be served, or null. */
export function sampleProblem(seed: number, loans: number): string | null {
  if (!Number.isInteger(seed) || seed < 1 || seed > MAX_SAMPLE_SEED) return `the seed must be a whole number from 1 to ${MAX_SAMPLE_SEED.toLocaleString("en-US")}`;
  if (!Number.isInteger(loans) || loans < MIN_SAMPLE_LOANS || loans > MAX_SAMPLE_LOANS)
    return `the number of loans must be a whole number from ${MIN_SAMPLE_LOANS} to ${MAX_SAMPLE_LOANS.toLocaleString("en-US")} (the planted cases alone take about 200)`;
  return null;
}

export const sampleName = ({ seed, loans }: SampleRequest) => `sample-tape-seed${seed}-${loans}-loans.json`;
export const sampleUrl = ({ seed, loans }: SampleRequest) => `/api/sample-tape?seed=${seed}&loans=${loans}`;
