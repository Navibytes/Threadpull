// Number and text formats for the CRO screen (ticket 10). Pure, so the screen's figures are tested and not eyeballed.
export const usd = (n: number, cents = false) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }).format(n);

/** 0.1347 -> "13.5%". */
export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits)}%`;

/** Event numbers as the audit log shows them: "events #3, #14". */
export const eventRefs = (seqs: readonly number[]) => (seqs.length ? `${seqs.length === 1 ? "event" : "events"} ${seqs.map((s) => `#${s}`).join(", ")}` : "no events");

/** A long list of event numbers, shortened for a card: "events #3, #14, #16 and 4 more". */
export const eventRefsShort = (seqs: readonly number[], max = 3) =>
  seqs.length <= max ? eventRefs(seqs) : `${eventRefs(seqs.slice(0, max))} and ${seqs.length - max} more`;

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
