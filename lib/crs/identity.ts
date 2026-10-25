// crs_identity_check (ticket 03): TransUnion identity verification for one case loan.
// Signals come only from addOnProducts[].idManagerVerification.messages. The SSN-issuance block, riskIndicator and KMSG07
// are identical for every sandbox persona, so nothing else in the response is read. The tool only reports the messages;
// what they mean for a status is decided by code elsewhere.
import { z } from "zod";
import { toolError, toolOk, type ToolResult } from "@/lib/contracts/tool-result";
import type { Ledger } from "@/lib/ledger";
import { CrsError, CrsUnreachable, defaultCrsClient, type CrsClient } from "./client";
import { DECEASED_CODE, refuseIfHalted } from "./halt";
import { bodyForLoan, GuardRefused } from "./persona-guard";
import { RECORDED_IDENTITY_CODES } from "./simulated";

const MessageSchema = z.object({ code: z.coerce.string(), text: z.string().nullish() });
export const IdentityResponseSchema = z
  .object({ addOnProducts: z.array(z.object({ idManagerVerification: z.object({ messages: z.array(MessageSchema) }).loose().optional() }).loose()) })
  .loose();

export type IdentityMessage = { code: string; text?: string };
/** `verified` means the file came back with no messages at all. */
export type IdentityCheck = { loan_id: string; verified: boolean; messages: IdentityMessage[] };

const TOOL = "crs_identity_check";
const check = (loan_id: string, messages: IdentityMessage[]): IdentityCheck => ({ loan_id, verified: messages.length === 0, messages });

/**
 * crs_identity_check: charged through the ledger. A loan with no sandbox persona is refused before any request;
 * if the sandbox is unreachable a recorded answer is returned, flagged `simulated`. A deceased result (2301) halts the loan
 * for the rest of the run, and a loan already halted is refused before any request.
 */
export async function crsIdentityCheck(
  loan: Parameters<typeof bodyForLoan>[1], // a Loan fits: only loan_id and the SSN are read
  ledger: Ledger,
  client: CrsClient = defaultCrsClient(),
): Promise<ToolResult<IdentityCheck | null>> {
  const halted = refuseIfHalted(TOOL, loan.loan_id, ledger);
  if (halted) return halted;
  const result = await ledger.run(TOOL, async (): Promise<ToolResult<IdentityCheck | null>> => {
    let body: ReturnType<typeof bodyForLoan>;
    try {
      body = bodyForLoan("tu_identity", loan);
    } catch (e) {
      if (e instanceof GuardRefused) return toolError(TOOL, `refused, nothing sent: ${e.message}`);
      throw e;
    }
    try {
      const { request_id, body: response } = await client.call("tu_identity", body, IdentityResponseSchema);
      const blocks = response.addOnProducts.flatMap((p) => (p.idManagerVerification ? [p.idManagerVerification] : []));
      // No verification block is not "verified": say so instead of reading an empty list as a clean file.
      if (blocks.length === 0) return toolError(TOOL, "CRS response had no idManagerVerification block");
      const messages = blocks.flatMap((b) => b.messages).map((m): IdentityMessage => (m.text ? { code: m.code, text: m.text } : { code: m.code }));
      return toolOk(TOOL, check(loan.loan_id, messages), [{ kind: "crs", product: "tu_identity", request_id }]);
    } catch (e) {
      if (e instanceof CrsUnreachable) {
        const codes = RECORDED_IDENTITY_CODES[String(body.ssn)];
        if (!codes) return toolError(TOOL, `${e.message}; no recorded answer for this loan`);
        const source = { kind: "lookup" as const, name: "crs_identity_recorded", key: loan.loan_id, simulated: true };
        return toolOk(TOOL, check(loan.loan_id, codes.map((code) => ({ code }))), [source], true);
      }
      if (e instanceof CrsError) return toolError(TOOL, e.message);
      throw e;
    }
  });
  if (result.ok && result.result?.messages.some((m) => m.code === DECEASED_CODE))
    ledger.halt(loan.loan_id, `TransUnion identity returned ${DECEASED_CODE}: the SSN belongs to a deceased person`);
  return result;
}
