// Injection guard (ticket 08). Document text is data, never instructions (CLAUDE.md hard rule 5).
// scanDocument finds instruction-like text; safeDocumentView is what Hazel and the model may see of a document:
// the fixed form fields only, never the raw text, plus a text-free summary of the scan. Detection changes no status
// by itself; the caller logs `attack_detected` (attackEvent) and carries on.
//
// Only InjectionScan's `matches` and `unexpected_lines` carry document text (excerpts, for local debugging). They
// never leave this module's callers: sources, the safe view and the event payload hold line numbers and rule ids
// only, because event rows and tool results are later read by a model (Hazel, the CRO memo).
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
  // aimed at a model that reads the document's fields (ticket 08 extraction): "note to the parser", "report these values"
  { id: "addressed_to_reader", re: /\bnotes? (to|for) (the |any )?(automated |ai )?(parser|extractor|reader|model|system|ai|llm|bot)s?\b/i },
  { id: "replace_values",
    re: /\b(report|use|enter|record|output|return)\b[^.\n]{0,30}\b(those|these|the following|the correct|instead)\b[^.\n]{0,30}\b(values?|amounts?|figures|numbers)\b/i },
];
export const INVISIBLE = /[\u200B-\u200F\u2060-\u2064\uFEFF\u202A-\u202E]/;
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

// No excerpts here: sources travel into tool results and event rows (see the header).
function attackSources(doc_id: string, matches: InjectionMatch[], invisible: boolean): SourceRef[] {
  return [
    ...matches.map((m) => ({ kind: "document" as const, doc_id, detail: `line ${m.line} (${m.rule})` })),
    ...(invisible ? [{ kind: "document" as const, doc_id, detail: "invisible Unicode characters in the text" }] : []),
  ];
}

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
    ...attackSources(doc.doc_id, matches, invisible),
    ...unexpected.map((u) => ({ kind: "document" as const, doc_id: doc.doc_id, detail: `line ${u.line} is not part of the form` })),
  ];
  return { doc_id: doc.doc_id, attack_detected: matches.length > 0 || invisible, matches, unexpected_lines: unexpected,
    invisible_characters: invisible, sources };
}

/** A scan without any document text: rule ids, line numbers and form labels only. Safe for a model or an event row. */
export type ScanSummary = {
  doc_id: string;
  attack_detected: boolean;
  rules: string[]; // rule ids that fired, unique, in RULES order
  lines: number[]; // lines that matched a rule, ascending
  unexpected_lines: number[]; // lines that aren't part of the form, ascending
  invisible_characters: boolean;
  withheld_fields: string[]; // form labels whose value safeDocumentView replaced with WITHHELD
};

export type SafeDocumentView = {
  doc_id: string; type: Document["type"]; template_id: string; font: string; creating_tool: string;
  fields: Record<string, string>; // only the form's labels; values with invisible characters removed
  scan: ScanSummary;
};

/** What Hazel and any model may see of a document: the form fields only, never the raw text. */
export function safeDocumentView(doc: Document): SafeDocumentView {
  const scan = scanDocument(doc);
  const flaggedLines = new Set(scan.matches.map((m) => m.line));
  const fields: Record<string, string> = {};
  const withheld: string[] = [];
  doc.text.split("\n").forEach((line, i) => {
    const label = DOCUMENT_FIELDS[doc.type].labels.find((l) => line.trim().startsWith(`${l}:`));
    if (!label || label in fields) return;
    // a field that itself carries instruction-like text is withheld, so it can never reach a model prompt
    if (flaggedLines.has(i + 1)) withheld.push(label);
    fields[label] = flaggedLines.has(i + 1) ? WITHHELD
      : line.trim().slice(label.length + 1).replace(new RegExp(INVISIBLE.source, "g"), "").trim();
  });
  const fired = new Set(scan.matches.map((m) => m.rule));
  const summary: ScanSummary = {
    doc_id: doc.doc_id,
    attack_detected: scan.attack_detected,
    rules: RULES.map((r) => r.id).filter((id) => fired.has(id)),
    lines: [...flaggedLines].sort((a, b) => a - b),
    unexpected_lines: scan.unexpected_lines.map((u) => u.line),
    invisible_characters: scan.invisible_characters,
    withheld_fields: withheld,
  };
  return { doc_id: doc.doc_id, type: doc.type, template_id: doc.template_id, font: doc.font,
    creating_tool: doc.creating_tool, fields, scan: summary };
}

/** The `result` of an `attack_detected` event row (SKELETON §8). */
export type AttackEventResult = Omit<ScanSummary, "attack_detected">;

/**
 * The payload for an `attack_detected` event, or null when the document is clean. Built from the text-free summary,
 * so the injected text never enters the event log (the CRO memo model reads event rows).
 */
export function attackEvent(doc: Document): { result: AttackEventResult; sources: SourceRef[] } | null {
  const { scan } = safeDocumentView(doc);
  if (!scan.attack_detected) return null;
  const { attack_detected: _a, ...result } = scan;
  // the event cites the attack itself; off-form lines stay in result.unexpected_lines as numbers
  return { result, sources: attackSources(doc.doc_id, scanDocument(doc).matches, scan.invisible_characters) };
}
