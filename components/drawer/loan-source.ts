import { LoanSchema, type Loan } from "@/lib/contracts/loan";

export type LoanSource = {
  kind: "api" | "preview";
  load: (options: { seed: number; signal: AbortSignal }) => Promise<Loan[]>;
};

// Only the existing same-origin route is contacted. No database client or credentials here.
export const apiLoanSource: LoanSource = {
  kind: "api",
  async load({ seed, signal }) {
    const response = await fetch(`/api/loans?seed=${encodeURIComponent(seed)}`, {
      signal,
      cache: "no-store",
    });
    if (!response.ok) {
      // Never echo a backend response body (which may contain infrastructure details).
      throw new Error(response.status === 404
        ? `No loan data is available for seed ${seed}. Generate this seed, then retry.`
        : `The loan service could not load this portfolio (HTTP ${response.status}). Retry to reconnect.`);
    }
    const parsed = LoanSchema.array().safeParse(await response.json());
    if (!parsed.success || new Set(parsed.data.map((loan) => loan.loan_id)).size !== parsed.data.length) {
      throw new Error("The loan service returned invalid loan records. Check the service, then retry.");
    }
    return parsed.data;
  },
};
