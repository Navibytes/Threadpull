// The memorandum's furniture: a numbered part, the footnote reference that points at the source ledger, and the basis word.
// Replaces the stacked bordered sections: a part is a heading beside a margin numeral, separated from the next by one rule.
import type { ReactNode } from "react";
import styles from "./cro.module.css";

export function Part({ n, id, title, lead, first, children }: { n: string; id: string; title: string; lead?: ReactNode; first?: boolean; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={styles.part} data-first={first || undefined}>
      <div aria-hidden className={styles.numeral}>{n}</div>
      <div className="min-w-0">
        <h2 id={id} className={styles.h2}>{title}</h2>
        {lead ? <p className={styles.lead}>{lead}</p> : null}
        <div className="mt-6">{children}</div>
      </div>
    </section>
  );
}

/** A footnote mark. It points at the source ledger entry for a number, and asks the ledger to open it (a repeat click works too). */
export function Ref({ id, n, label }: { id: string; n: number; label: string }) {
  return (
    <a
      href={`#src-${id}`}
      className={styles.ref}
      aria-label={`Source and calculation for ${label}`}
      onClick={() => window.dispatchEvent(new CustomEvent("cro:open-source", { detail: id }))}
    >
      {n}
    </a>
  );
}

const BASIS_TONE: Record<string, string> = { "From the run": "text-walnut/85", Derived: "text-walnut/85", Assumed: "font-bold text-[#8a5f10]", Estimate: "font-bold text-[#8a5f10]" };
/** The basis of a number, in words. Assumed and estimated figures are the only ones that stand out. */
export const Basis = ({ basis }: { basis: string }) => <span className={`${styles.caps} ${BASIS_TONE[basis] ?? ""}`}>{basis}</span>;
