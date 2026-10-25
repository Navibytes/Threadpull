// One recorded event row, in a plain sentence for the audit list. It rewords the row's own fields; where a row says
// little (a type with no agreed fields), the sentence says only what is known.
import { loanName, sharedLabel, type RunEvent } from "@/lib/events";
import { ClueExplainedResultSchema } from "@/lib/contracts/event";

const words = (s: string) => s.replace(/_/g, " ");
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
const loans = (e: RunEvent) => e.loan_ids.map(loanName).join(", ");

export function describeEvent(e: RunEvent): { title: string; detail: string | null } {
  switch (e.type) {
    case "run_started":
      return { title: "Run started", detail: null };
    case "run_finished":
      return { title: "Run finished", detail: null };
    case "lead_opened":
      return { title: `Opened ${loans(e) || "a loan"} as a lead`, detail: e.note.trim() || null };
    case "check_run":
      return { title: `Ran a check${e.tool ? ` (${words(e.tool)})` : ""}${e.loan_ids.length ? ` on ${loans(e)}` : ""}`, detail: e.note.trim() || null };
    case "link_found": {
      const kind = str(e.result.kind);
      const title = kind && e.loan_ids.length >= 2 ? `${sharedLabel(kind)}: ${loanName(e.loan_ids[0])} and ${loanName(e.loan_ids[1])}` : "Found a connection";
      return { title, detail: e.note.trim() || null };
    }
    case "clue_explained": {
      const r = ClueExplainedResultSchema.safeParse(e.result);
      return { title: "Explained a connection", detail: r.success ? r.data.reason : e.note.trim() || null };
    }
    case "status_changed": {
      const status = str(e.result.status);
      return { title: status && e.loan_ids.length ? `${loanName(e.loan_ids[0])} set to ${status}` : "Changed a status", detail: str(e.result.reason) };
    }
    case "budget_spent":
      return { title: "Spent budget", detail: e.note.trim() || null };
    case "question_asked":
      return { title: `Asked ${str(e.result.to) ? words(str(e.result.to)!) : "a person"} a question`, detail: e.note.trim() || null };
    case "question_answered":
      return { title: "A question was answered", detail: e.note.trim() || null };
    case "rule_applied":
      return { title: "Applied a saved rule", detail: e.note.trim() || null };
    case "attack_detected":
      return { title: "Found instructions hidden in a document and ignored them", detail: null };
    case "recovery":
      return { title: "Recovered from a problem", detail: e.note.trim() || null };
    case "disposition_recorded":
      return { title: `A person recorded a decision${e.loan_ids.length ? ` for ${loans(e)}` : ""}`, detail: e.note.trim() || null };
    case "lead_dropped":
      return { title: `Dropped ${loans(e) || "a lead"}`, detail: e.note.trim() || null };
  }
}
