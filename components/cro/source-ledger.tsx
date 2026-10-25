"use client";
// The last part: where every printed number comes from. One entry per figure, numbered to match the footnote marks on the
// page. A footnote asks this ledger to open its entry (or the URL's #src-… hash does); each entry gives what the number
// means, its formula, the source fields, the audit-log event rows and the loans behind it, and says plainly when a source
// is not recorded. The numbers themselves are never repeated here, so the page cannot disagree with its own footnotes.
import { useEffect, useRef } from "react";
import type { DealReport } from "@/lib/deal";
import { eventRefsShort } from "./format";
import { ledgerEntries } from "./findings";
import { Basis, Part } from "./part";
import styles from "./cro.module.css";

export function SourceLedger({ r }: { r: DealReport }) {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const open = (id: string | null) => {
      const el = id ? root.current?.querySelector<HTMLDetailsElement>(`#src-${CSS.escape(id)}`) : null;
      if (el) { el.open = true; el.scrollIntoView({ block: "center", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }); }
    };
    const fromHash = () => { const m = /^#src-(.+)$/.exec(window.location.hash); if (m) open(decodeURIComponent(m[1])); };
    const fromRef = (e: Event) => open((e as CustomEvent<string>).detail);
    fromHash();
    window.addEventListener("hashchange", fromHash);
    window.addEventListener("cro:open-source", fromRef);
    return () => { window.removeEventListener("hashchange", fromHash); window.removeEventListener("cro:open-source", fromRef); };
  }, []);

  return (
    <Part n="09" id="sources-title" title="Sources and assumptions" lead="Where each figure comes from, what it assumes, and the audit-log rows behind it. The small numbers on the page point here.">
      <div ref={root} className="border-b border-walnut/25">
        {ledgerEntries(r).map((e) => (
          <details key={e.id} id={`src-${e.id}`} className={`${styles.entry} scroll-mt-24 border-t border-walnut/25`}>
            <summary className="grid min-h-12 grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-x-3 py-2.5 text-[16px]">
              <span className="font-display font-semibold tabular-nums text-terracotta">{e.n}</span>
              <span className="font-semibold"><span aria-hidden className={`${styles.chev} mr-2 text-walnut/70`}>▸</span>{e.title}</span>
              <Basis basis={e.basis} />
            </summary>
            <dl className={`${styles.entryBody} grid gap-x-6 gap-y-2 pb-5 pl-8 pr-2 text-[15px] leading-snug sm:grid-cols-[8rem_minmax(0,1fr)]`}>
              <dt className="font-semibold text-walnut/85">Means</dt><dd>{e.meaning}</dd>
              <dt className="font-semibold text-walnut/85">Formula</dt><dd>{e.formula}</dd>
              <dt className="font-semibold text-walnut/85">Source fields</dt><dd>{e.fields}</dd>
              <dt className="font-semibold text-walnut/85">Audit-log rows</dt>
              <dd className="tabular-nums">{e.seqs.length ? `${eventRefsShort(e.seqs, 12)}` : "Source unavailable: no event row is recorded for this figure."}</dd>
              {e.loanIds.length ? <><dt className="font-semibold text-walnut/85">Loans</dt><dd className="tabular-nums">{e.loanIds.join(", ")}</dd></> : null}
              {e.note ? <><dt className="font-semibold text-walnut/85">Note</dt><dd>{e.note}</dd></> : null}
            </dl>
          </details>
        ))}
      </div>
    </Part>
  );
}
