import type { BoardThread } from "./board-state";

// Plain-English wording for the board. Everything here only rewords what an event row already says (a loan id,
// a connection's kind); nothing is inferred. The original ids, kinds and weights stay in the details panels.

// "PV-01" is a made-up sample application, so it is named as one. Any other id keeps its own text.
export function loanName(id: string): string {
  const sample = /^PV-(\d+)$/.exec(id);
  return sample ? `Sample Loan ${sample[1]}` : `Loan ${id}`;
}

// A shorter name for when the card is small: "Loan 01", or the id as it is.
export function loanShortName(id: string): string {
  const sample = /^PV-(\d+)$/.exec(id);
  return sample ? `Loan ${sample[1]}` : id;
}

const words = (kind: string) => kind.replace(/[_-]/g, " ");

// What the two loans have in common, as a noun phrase ("a phone number"). Unknown kinds say so plainly.
const PHRASE: Record<string, string> = {
  phone: "a phone number",
  email: "an email address",
  address: "an address",
  device: "a device",
  employer: "an employer",
  dealer: "a dealer",
  doc_fingerprint: "a pay-stub template",
  document: "a pay-stub template",
};
export const sharedPhrase = (kind: string) => PHRASE[kind] ?? `a matching ${words(kind)}`;

// A short label for a thread on the board.
const LABEL: Record<string, string> = {
  phone: "Shared phone number",
  email: "Shared email address",
  address: "Shared address",
  device: "Shared device",
  employer: "Shared employer",
  dealer: "Same dealer",
  doc_fingerprint: "Same pay-stub template",
  document: "Same pay-stub template",
};
export const sharedLabel = (kind: string) => LABEL[kind] ?? `Shared ${words(kind)}`;

// "a phone number and a device"
export function joinPhrases(phrases: string[]): string {
  if (phrases.length <= 1) return phrases[0] ?? "";
  return `${phrases.slice(0, -1).join(", ")} and ${phrases.at(-1)}`;
}

// The one sentence about what a shared detail means, used wherever a connection is explained.
export const NOT_PROOF = "A shared detail is a lead to check, not proof of fraud.";
export const NOT_PROOF_SHORT = "A shared detail is a lead, not proof.";

export type CardFinding = { text: string; explained: boolean };

// Why a card is on the board, in plain English, from the link_found threads it is on. It rewords the recorded
// connections and nothing else: a shared detail is named, never called fraud. An explained connection keeps its
// fact and says it has an explanation.
export const SPOT_CHECK_FINDING = "Spot check of a large balance nobody had verified.";

export function cardFinding(id: string, lead: boolean, threads: BoardThread[], spotCheck = false): CardFinding | null {
  const links = threads
    .filter((t) => t.a === id || t.b === id)
    .sort((x, y) => Number(!!x.explained) - Number(!!y.explained) || y.weight - x.weight);
  if (links.length === 0) return spotCheck ? { text: SPOT_CHECK_FINDING, explained: false } : lead ? { text: "No connections found yet.", explained: false } : null;
  const other = (t: BoardThread) => (t.a === id ? t.b : t.a);
  if (lead) {
    const loans = new Set(links.map(other)).size;
    const kinds = [...new Set(links.map((t) => t.kind))];
    const explained = links.filter((t) => t.explained).length;
    const what = joinPhrases(kinds.map(sharedPhrase));
    const who = loans === 1 ? "another loan" : `${loans} other loans`;
    const base = `This application shares ${what} with ${who}.`;
    const note =
      explained === 0
        ? ""
        : explained === links.length
          ? links.length === 1
            ? " It has an innocent explanation."
            : " Each match has an explanation."
          : ` ${explained} of ${links.length} matches already explained.`;
    return { text: base + note, explained: explained === links.length };
  }
  const [top] = links;
  const more = links.length > 1 ? ` and ${links.length - 1} more ${links.length === 2 ? "loan" : "loans"}` : "";
  const name = loanName(other(top));
  return top.explained
    ? { text: `Shared ${sharedPhrase(top.kind)} with ${name}${more}, now explained.`, explained: true }
    : { text: `Shares ${sharedPhrase(top.kind)} with ${name}${more}.`, explained: false };
}

