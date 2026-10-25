// Reading pay stubs the fixed-label parser can't (ticket 08). Real data rooms hold payroll advices, tables and scans that
// no fixed label list reads; a model can read them, and code decides whether to believe it:
//
// 1. The parser goes first. A stub it reads never reaches a model (every generated stub, so seeded runs are unchanged).
// 2. What a model sees: the stub's numbered lines, with every line the injection guard flags withheld and invisible
//    characters removed. Instructions in a document never reach the reader.
// 3. What a model may answer: a fixed schema, each field a value plus the number of the line it is printed on. No free
//    text, no tools, nothing that acts.
// 4. What code accepts: every field present, on a line that exists and wasn't withheld, and found on that line as
//    printed: the same number, the same date in any common format, the same name (case and spacing aside), the same
//    check number. One field that fails and the whole stub is unreadable: a missing value is never filled in.
// 5. A failed or slow model call makes the stub unreadable, never a crash. Each stub is read once per run.
//
// No model client here (lib/evidence stays model-free): the reader takes a StubExtractor, and lib/agent supplies one.
// Reasons and sources name lines and fields only, never document text: they travel into tool results a model reads.
import { z } from "zod";
import type { Document } from "@/lib/contracts/loan";
import { parsePayStub, type PayStub } from "./documents";
import { INVISIBLE, scanDocument } from "./injection";

export const STUB_FIELDS = ["employer", "employee", "position", "pay_date", "check_no", "gross", "net", "ytd"] as const;
type StubField = (typeof STUB_FIELDS)[number];

const cited = <T extends z.ZodType>(value: T) =>
  z.object({ value: value.nullable(), line: z.number().int().nullable().describe("the number of the line the value is printed on") });

/** The only shape a model may answer in. */
export const ExtractionSchema = z.object({
  employer: cited(z.string()), employee: cited(z.string()), position: cited(z.string()),
  pay_date: cited(z.string().describe("YYYY-MM-DD")), check_no: cited(z.string()),
  gross: cited(z.number().describe("gross pay for this period")), net: cited(z.number().describe("net pay for this period")),
  ytd: cited(z.number().describe("year-to-date gross pay")),
});
export type Extraction = z.infer<typeof ExtractionSchema>;

/** Reads one stub. Gets the numbered, guarded lines (extractionInput), returns the model's answer, unvalidated. */
export type StubExtractor = (numberedLines: string) => Promise<unknown>;

export const WITHHELD_LINE = "[line withheld]";

/** What a model gets of a document: numbered lines, flagged lines withheld, invisible characters removed. */
export function extractionInput(doc: Document): { lines: string[]; withheld: Set<number>; text: string } {
  const flagged = new Set(scanDocument(doc).matches.map((m) => m.line));
  const lines = doc.text.split("\n").map((l, i) => (flagged.has(i + 1) ? WITHHELD_LINE : l.replace(new RegExp(INVISIBLE.source, "g"), "")));
  return { lines, withheld: flagged, text: lines.map((l, i) => `${i + 1}| ${l}`).join("\n") };
}

// ---- grounding: is the value printed on the line the model cites?
const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim();
const amounts = (line: string) =>
  [...line.matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => Number(m[0].replace(/,/g, ""))).filter((n) => !Number.isNaN(n));
const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const iso = (y: number, m: number, d: number) =>
  m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}` : null;

/** Every date printed on a line, as YYYY-MM-DD: 2026-06-30, 06/30/2026, June 30, 2026, 30-Jun-2026, 30 June 2026. */
export function datesOn(line: string): string[] {
  const out: (string | null)[] = [];
  for (const m of line.matchAll(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/g)) out.push(iso(+m[1], +m[2], +m[3]));
  for (const m of line.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) out.push(iso(+m[3], +m[1], +m[2]));
  const month = (s: string) => MONTHS.indexOf(s.slice(0, 3).toLowerCase()) + 1;
  for (const m of line.matchAll(/\b([A-Za-z]{3,9})\.? (\d{1,2}),? (\d{4})\b/g)) if (month(m[1])) out.push(iso(+m[3], month(m[1]), +m[2]));
  for (const m of line.matchAll(/\b(\d{1,2})[- ]([A-Za-z]{3,9})[- ](\d{4})\b/g)) if (month(m[2])) out.push(iso(+m[3], month(m[2]), +m[1]));
  return out.filter((d): d is string => !!d);
}

function grounded(field: StubField, value: string | number, line: string): boolean {
  if (typeof value === "number") return value > 0 && amounts(line).some((n) => Math.abs(n - value) < 0.005);
  if (field === "pay_date") return /^\d{4}-\d{2}-\d{2}$/.test(value) && datesOn(line).includes(value);
  if (field === "check_no") return /^[A-Za-z0-9-]{1,20}$/.test(value) && new RegExp(`(^|[^A-Za-z0-9])${value}([^A-Za-z0-9]|$)`).test(line);
  const v = norm(value);
  return v.length >= 2 && ` ${norm(line)} `.includes(` ${v} `);
}

export type Verified = { ok: true; stub: PayStub } | { ok: false; reason: string };

/** Accept a model's answer only if every field is present and printed on the line it cites. */
export function verifyExtraction(answer: unknown, lines: readonly string[], withheld: ReadonlySet<number>): Verified {
  const parsed = ExtractionSchema.safeParse(answer);
  if (!parsed.success) return { ok: false, reason: "the reader's answer does not fit the schema" };
  const stub: Record<string, string | number> = {};
  for (const f of STUB_FIELDS) {
    const { value, line } = parsed.data[f];
    if (value === null || value === "") return { ok: false, reason: `${f} is not on the stub` };
    if (line === null || line < 1 || line > lines.length) return { ok: false, reason: `${f} cites no line of the stub` };
    if (withheld.has(line)) return { ok: false, reason: `${f} cites a withheld line` };
    if (!grounded(f, value, lines[line - 1])) return { ok: false, reason: `${f} is not printed on the line it cites (line ${line})` };
    stub[f] = typeof value === "string" ? value.trim() : value;
  }
  return { ok: true, stub: stub as PayStub };
}

export type StubRead = { stub: PayStub; by: "parser" | "model" } | { stub: null; reason: string };
export const READ_TIMEOUT_MS = 20_000;

/** One run's pay-stub reader: the parser, then (when given an extractor) a verified model read, each stub once. */
export class PayStubReader {
  private readonly reads = new Map<string, StubRead>();
  private readonly pending = new Map<string, Promise<void>>(); // reads in flight, so one stub is never read twice
  constructor(private readonly extractor?: StubExtractor, private readonly timeoutMs = READ_TIMEOUT_MS) {}

  /** The stub's values, if the parser or an earlier verified model read has them. */
  read(doc: Document): StubRead {
    const parsed = parsePayStub(doc.text);
    if (parsed) return { stub: parsed, by: "parser" };
    return this.reads.get(doc.doc_id)
      ?? { stub: null, reason: this.extractor ? "not read yet" : "the fixed-label parser can't read it and no model reader is configured" };
  }

  /** Model-read any of these stubs the parser can't read and that haven't been read yet. Never throws. */
  async prepare(docs: readonly Document[]): Promise<void> {
    if (!this.extractor) return;
    for (const doc of docs)
      if (doc.type === "pay_stub" && !this.reads.has(doc.doc_id) && !this.pending.has(doc.doc_id) && !parsePayStub(doc.text))
        this.pending.set(doc.doc_id, this.modelRead(doc).finally(() => this.pending.delete(doc.doc_id)));
    await Promise.all(docs.map((d) => this.pending.get(d.doc_id)));
  }

  private async modelRead(doc: Document): Promise<void> {
    const input = extractionInput(doc);
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const answer = await Promise.race([
        this.extractor!(input.text),
        new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`no answer in ${this.timeoutMs / 1000} s`)), this.timeoutMs); }),
      ]);
      const v = verifyExtraction(answer, input.lines, input.withheld);
      this.reads.set(doc.doc_id, v.ok ? { stub: v.stub, by: "model" } : { stub: null, reason: `model read rejected: ${v.reason}` });
    } catch (e) {
      this.reads.set(doc.doc_id, { stub: null, reason: `model read failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      clearTimeout(timer);
    }
  }
}
