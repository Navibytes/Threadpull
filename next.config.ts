import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The API routes read files the import graph can't see (paths built at run time): the generated portfolios and, in the
  // public demo (THREADPULL_RUNS=demo/runs), the recorded runs. Include them in the deployed functions.
  outputFileTracingIncludes: {
    "/api/**": ["./data/out/seed*/loans.normalized.json", "./demo/runs/**/*"],
  },
};

export default nextConfig;
