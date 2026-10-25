// Where questions and rules live. Async so the Supabase `rules` / `questions` tables can replace the in-memory store
// without changing callers. Rules are append-only: a new version is a new row, older versions stay.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { QuestionSchema, RuleSchema, type Question, type Rule } from "@/lib/contracts/rule";

export interface RuleStore {
  /** Every saved version of every rule. */
  ruleVersions(): Promise<Rule[]>;
  addRuleVersion(rule: Rule): Promise<void>;
  questions(): Promise<Question[]>;
  /** Insert or replace a question by id. */
  saveQuestion(question: Question): Promise<void>;
}

export class MemoryRuleStore implements RuleStore {
  private readonly rules: Rule[] = [];
  private readonly qs = new Map<string, Question>();

  async ruleVersions() { return [...this.rules]; }
  async addRuleVersion(rule: Rule) {
    const r = RuleSchema.parse(rule);
    if (this.rules.some((x) => x.id === r.id && x.version === r.version)) throw new Error(`${r.id} v${r.version} already saved`);
    this.rules.push(r);
  }
  async questions() { return [...this.qs.values()]; }
  async saveQuestion(question: Question) { this.qs.set(question.id, QuestionSchema.parse(question)); }
}

/** The latest version of each rule. */
export async function currentRules(store: RuleStore): Promise<Rule[]> {
  const latest = new Map<string, Rule>();
  for (const r of await store.ruleVersions()) if ((latest.get(r.id)?.version ?? 0) < r.version) latest.set(r.id, r);
  return [...latest.values()].sort((a, b) => a.id.localeCompare(b.id));
}

const nextId = (prefix: string, ids: string[]) =>
  `${prefix}-${String(Math.max(0, ...ids.map((id) => Number(id.slice(prefix.length + 1)) || 0)) + 1).padStart(3, "0")}`;

export const nextQuestionId = async (store: RuleStore) => nextId("q", (await store.questions()).map((q) => q.id));
export const nextRuleId = async (store: RuleStore) => nextId("R", (await store.ruleVersions()).map((r) => r.id));

/**
 * Rules and questions kept in one JSON file, so a ruling outlives the run that asked for it (ask once, remember forever).
 * Read on every call, so a run and the CRO screen (separate processes) see each other's writes; written to a temporary
 * file and renamed, so a reader never sees half a file. Same guarantees as MemoryRuleStore: rule versions are
 * append-only, every row is validated. The Supabase `rules` / `questions` tables can replace it behind RuleStore.
 */
export class FileRuleStore implements RuleStore {
  constructor(readonly path: string) {}

  private load(): { rules: Rule[]; questions: Question[] } {
    if (!existsSync(this.path)) return { rules: [], questions: [] };
    const raw = JSON.parse(readFileSync(this.path, "utf8")) as { rules?: unknown[]; questions?: unknown[] };
    return { rules: (raw.rules ?? []).map((r) => RuleSchema.parse(r)), questions: (raw.questions ?? []).map((q) => QuestionSchema.parse(q)) };
  }

  private save(data: { rules: Rule[]; questions: Question[] }) {
    mkdirSync(dirname(this.path), { recursive: true });
    const tmp = `${this.path}.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
    renameSync(tmp, this.path);
  }

  async ruleVersions() { return this.load().rules; }
  async addRuleVersion(rule: Rule) {
    const data = this.load(), r = RuleSchema.parse(rule);
    if (data.rules.some((x) => x.id === r.id && x.version === r.version)) throw new Error(`${r.id} v${r.version} already saved`);
    this.save({ ...data, rules: [...data.rules, r] });
  }
  async questions() { return this.load().questions; }
  async saveQuestion(question: Question) {
    const data = this.load(), q = QuestionSchema.parse(question);
    this.save({ ...data, questions: [...data.questions.filter((x) => x.id !== q.id), q] });
  }
}
