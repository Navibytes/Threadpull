// Injection guard (ticket 08). Document text is data, never instructions (CLAUDE.md hard rule 5).
// scanDocument finds instruction-like text; safeDocumentView is what Hazel and the model may see of a document:
// the fixed form fields only, never the raw text, plus the scan result. Detection changes no status by itself;
// the caller logs `attack_detected` and carries on.
import type { Document } from "@/lib/contracts/loan";
import type { SourceRef } from "@/lib/contracts/tool-result";

// The fields each document type may contain. Anything else on the page is unexpected content.
export const DOCUMENT_FIELDS: Record<Document["type"], { titles: string[]; labels: string[] }> = {
  pay_stub: {
    titles: ["EARNINGS STATEMENT", "PENSION BENEFIT STATEMENT"],
    labels: ["Employer", "Employee", "Position", "Pay date", "Check no", "Gross pay", "Net pay", "YTD gross"],
  },
  application: {
    titles: ["RETAIL INSTALLMENT CREDIT APPLICATION"],
    labels: ["Dealer", "Applicant", "Residence", "Employer", "Position", "Time at employer", "Gross monthly income",
      "Vehicle", "Purchase price", "Co-applicant"],
  },
};

// Phrase rules. Single words never trigger: ordinary documents say "Physician Assistant", "Data Agent",
// "Health System" and "Tesla Model Y". Each rule needs an instruction aimed at a reader or a demand to act.
const RULES: { id: string; re: RegExp }[] = [
  { id: "override_instructions",
    re: /\b(ignore|disregard|forget|override|bypass)\b[^.\n]{0,40}\b(instructions?|prompts?|rules|guidelines|directions)\b/i },
  { id: "role_play", re: /\b(you are now|act as (an?|the)|pretend to be|system prompt|system message|developer message|as an ai)\b|^\s*(system|assistant|user)\s*:/im },
  { id: "addressed_to_reviewer",
    re: /\b(automated|ai|llm|language model|reviewer|underwriter|screening)\b[^.\n]{0,30}\b(instructions?|directives?|notes? to|commands?)\b/i },
  { id: "demand_status",
    re: /\b(mark|set|label|classify|flag|treat)\b[^.\n]{0,60}\b(as )?(verified|approved|pre-?cleared|legitimate|no material anomaly( found)?|low risk|not fraud)\b/i },
  { id: "suppress_checks",
    re: /\b(do not|don't|never|skip|no need to|stop)\b[^.\n]{0,30}\b(run|perform|call|use)\b[^.\n]{0,30}\b(checks?|crs|verification|review|tools?)\b/i },
  { id: "claims_pre_clearance", re: /\b(pre-?cleared|pre-?verified|already (been )?(verified|approved|cleared)) by\b/i },
];
const INVISIBLE = /[\u200B-\u200F\u2060-\u2064\uFEFF\u202A-\u202E]/;
export const WITHHELD = "[withheld: instruction-like text, see attack_detected]";

export type InjectionMatch = { rule: string; line: number; excerpt: string };
export type InjectionScan = {
  doc_id: string;
  attack_detected: boolean; // any phrase rule or invisible characters
  matches: InjectionMatch[];
  unexpected_lines: { line: number; excerpt: string }[]; // lines that aren't part of the form (soft signal alone)
  invisible_characters: boolean;
  sources: SourceRef[];
};

const excerpt = (s: string) => (s.length > 120 ? `${s.slice(0, 117)}...` : s);

function isFormLine(type: Document["type"], line: string): boolean {
  const f = DOCUMENT_FIELDS[type];
  const t = line.trim();
  return t === "" || f.titles.includes(t) || f.labels.some((l) => t.startsWith(`${l}:`));
}

export function scanDocument(doc: Document): InjectionScan {
  const lines = doc.text.split("\n");
  const matches: InjectionMatch[] = [];
  lines.forEach((line, i) => {
    for (const r of RULES) if (r.re.test(line)) matches.push({ rule: r.id, line: i + 1, excerpt: excerpt(line.trim()) });
  });
  const unexpected = lines.flatMap((line, i) => (isFormLine(doc.type, line) ? [] : [{ line: i + 1, excerpt: excerpt(line.trim()) }]));
  const invisible = INVISIBLE.test(doc.text);
  const sources: SourceRef[] = [
    ...matches.map((m) => ({ kind: "document" as const, doc_id: doc.doc_id, detail: `line ${m.line} (${m.rule}): ${m.excerpt}` })),
    ...(invisible ? [{ kind: "document" as const, doc_id: doc.doc_id, detail: "invisible Unicode characters in the text" }] : []),
    ...unexpected.map((u) => ({ kind: "document" as const, doc_id: doc.doc_id, detail: `line ${u.line} is not part of the form: ${u.excerpt}` })),
  ];
  return { doc_id: doc.doc_id, attack_detected: matches.length > 0 || invisible, matches, unexpected_lines: unexpected,
    invisible_characters: invisible, sources };
}

export type SafeDocumentView = {
  doc_id: string; type: Document["type"]; template_id: string; font: string; creating_tool: string;
  fields: Record<string, string>; // only the form's labels; values with invisible characters removed
  scan: Omit<InjectionScan, "sources">;
};

/** What Hazel and any model may see of a document: the form fields only, never the raw text. */
export function safeDocumentView(doc: Document): SafeDocumentView {
  const { sources: _s, ...scan } = scanDocument(doc);
  const flaggedLines = new Set(scan.matches.map((m) => m.line));
  const fields: Record<string, string> = {};
  doc.text.split("\n").forEach((line, i) => {
    const label = DOCUMENT_FIELDS[doc.type].labels.find((l) => line.trim().startsWith(`${l}:`));
    if (!label || label in fields) return;
    // a field that itself carries instruction-like text is withheld, so it can never reach a model prompt
    fields[label] = flaggedLines.has(i + 1) ? WITHHELD
      : line.trim().slice(label.length + 1).replace(new RegExp(INVISIBLE.source, "g"), "").trim();
  });
  return { doc_id: doc.doc_id, type: doc.type, template_id: doc.template_id, font: doc.font,
    creating_tool: doc.creating_tool, fields, scan };
}
