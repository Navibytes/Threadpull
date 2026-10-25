// crs_fraud_finder (ticket 06): AtData contact signals for one case loan (email age, phone owner, IP distance, address type).
// These are soft signals: the tool reports them, and weighing them is done by code elsewhere.
import { z } from "zod";
import { toolError, toolOk, type ToolResult } from "@/lib/contracts/tool-result";
import type { Ledger } from "@/lib/ledger";
import { CrsError, defaultCrsClient, type CrsClient } from "./client";
import { bodyForLoan, GuardRefused } from "./persona-guard";

const TOOL = "crs_fraud_finder";
const Match = z.string().nullish();

export const FraudFinderResponseSchema = z
  .object({
    risk: z
      .object({
        score: z.number().nullish(),
        postal: z.object({ address_type: z.string().nullish(), ip_postal_distance: z.union([z.string(), z.number()]).nullish() }).loose().nullish(),
        phone: z
          .object({
            line_type: z.string().nullish(),
            prepaid: z.boolean().nullish(),
            status: z.string().nullish(),
            owner: z.object({ first_name_match: Match, last_name_match: Match }).loose().nullish(),
          })
          .loose()
          .nullish(),
      })
      .loose()
      .nullish(),
    eam: z.object({ date_first_seen: z.string().nullish() }).loose().nullish(),
    email_validation: z.object({ status: z.string().nullish() }).loose().nullish(),
  })
  .loose();

export type FraudFinder = {
  loan_id: string;
  risk_score: number | null; // 0-100, higher is riskier; not a fraud probability
  email_first_seen: string | null;
  email_age_days: number | null;
  email_status: string | null;
  phone_line_type: string | null;
  phone_prepaid: boolean | null;
  phone_owner_name: "match" | "no_match" | "no_data" | null; // does the registered owner's name match the loan's name; null = AtData sent no owner block
  address_type: string | null;
  ip_postal_distance: string | null; // as AtData sends it
};

const DAY_MS = 86_400_000;

function ownerMatch(owner?: { first_name_match?: string | null; last_name_match?: string | null } | null): FraudFinder["phone_owner_name"] {
  if (!owner) return null;
  const parts = [owner.first_name_match, owner.last_name_match];
  if (parts.includes("no_match")) return "no_match";
  return parts.every((p) => p === "match") ? "match" : "no_data";
}

/** crs_fraud_finder: 2 acorns. A loan with no sandbox persona is refused before any request. */
export function crsFraudFinder(
  loan: Parameters<typeof bodyForLoan>[1],
  ledger: Ledger,
  client: CrsClient = defaultCrsClient(),
  now = Date.now(),
): Promise<ToolResult<FraudFinder | null>> {
  return ledger.run(TOOL, async (): Promise<ToolResult<FraudFinder | null>> => {
    let body: ReturnType<typeof bodyForLoan>;
    try {
      body = bodyForLoan("fraud_finder", loan);
    } catch (e) {
      if (e instanceof GuardRefused) return toolError(TOOL, `refused, nothing sent: ${e.message}`);
      throw e;
    }
    try {
      const { request_id, body: r } = await client.call("fraud_finder", body, FraudFinderResponseSchema);
      const seen = Date.parse(r.eam?.date_first_seen ?? "");
      const found: FraudFinder = {
        loan_id: loan.loan_id,
        risk_score: r.risk?.score ?? null,
        email_first_seen: r.eam?.date_first_seen ?? null,
        email_age_days: Number.isNaN(seen) ? null : Math.floor((now - seen) / DAY_MS),
        email_status: r.email_validation?.status ?? null,
        phone_line_type: r.risk?.phone?.line_type ?? null,
        phone_prepaid: r.risk?.phone?.prepaid ?? null,
        phone_owner_name: ownerMatch(r.risk?.phone?.owner),
        address_type: r.risk?.postal?.address_type ?? null,
        ip_postal_distance: r.risk?.postal?.ip_postal_distance == null ? null : String(r.risk.postal.ip_postal_distance),
      };
      return toolOk(TOOL, found, [{ kind: "crs", product: "fraud_finder", request_id }]);
    } catch (e) {
      if (e instanceof CrsError) return toolError(TOOL, e.message);
      throw e;
    }
  });
}
