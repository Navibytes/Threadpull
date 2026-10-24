// crs_reverse_phone (ticket 06): who a phone number is registered to (AccurateAppend). Takes a phone, as in SKELETON §7,
// so it can follow a shared phone from one loan to another. Comparing the name with a borrower is left to the caller.
import { z } from "zod";
import { toolError, toolOk, type ToolResult } from "@/lib/contracts/tool-result";
import type { Ledger } from "@/lib/ledger";
import { CrsError, defaultCrsClient, type CrsClient } from "./client";
import { bodyForPhone, GuardRefused } from "./persona-guard";

const TOOL = "crs_reverse_phone";
const Field = z.string().nullish();

export const ReversePhoneResponseSchema = z
  .object({
    success: z.boolean().nullish(),
    data: z
      .object({ records: z.array(z.object({ firstName: Field, lastName: Field, address: Field, city: Field, state: Field, postalCode: Field }).loose()).nullish() })
      .loose()
      .nullish(),
  })
  .loose();

export type ReversePhoneRecord = { first_name: string | null; last_name: string | null; address: string | null; city: string | null; state: string | null; postal_code: string | null };
/** `records` is empty when the number is registered to no one we can see: that is an answer, not an error. */
export type ReversePhone = { phone: string; records: ReversePhoneRecord[] };

/** crs_reverse_phone: 1 acorn. A phone that is not a sandbox persona's is refused before any request. */
export function crsReversePhone(phone: string, ledger: Ledger, client: CrsClient = defaultCrsClient()): Promise<ToolResult<ReversePhone | null>> {
  return ledger.run(TOOL, async (): Promise<ToolResult<ReversePhone | null>> => {
    let body: ReturnType<typeof bodyForPhone>;
    try {
      body = bodyForPhone(phone);
    } catch (e) {
      if (e instanceof GuardRefused) return toolError(TOOL, `refused, nothing sent: ${e.message}`);
      throw e;
    }
    try {
      const { request_id, body: r } = await client.call("reverse_phone", body, ReversePhoneResponseSchema);
      if (r.success === false) return toolError(TOOL, "CRS reverse lookup reported success: false");
      const records = (r.data?.records ?? []).map(
        (x): ReversePhoneRecord => ({
          first_name: x.firstName ?? null, last_name: x.lastName ?? null, address: x.address ?? null,
          city: x.city ?? null, state: x.state ?? null, postal_code: x.postalCode ?? null,
        }),
      );
      return toolOk(TOOL, { phone: String(body.phoneNumber), records }, [{ kind: "crs", product: "reverse_phone", request_id }]);
    } catch (e) {
      if (e instanceof CrsError) return toolError(TOOL, e.message);
      throw e;
    }
  });
}
