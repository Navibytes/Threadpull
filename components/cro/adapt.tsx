"use client";
// Adapting to a client: what a bank changes to fit Threadpull to its own policies, tapes and documents, without
// retraining a model. Each card says whether it is live in this build or only in code, and shows this run's own values
// where there are any (the rules in force, the budget, the tool prices, the portfolio). Neutral styling, like the rest
// of the CRO screen.
import { useEffect, useState } from "react";
import { NODE_KINDS } from "@/lib/contracts/graph";
import type { Rule } from "@/lib/contracts/rule";
import { TOOL_SPECS } from "@/lib/contracts/tool-result";
import type { ReportBundle } from "@/lib/deal/service";

type Status = "live" | "in code" | "next";
const Tag = ({ status }: { status: Status }) => (
  <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${status === "live" ? "bg-emerald-50 text-emerald-800 ring-1 ring-emerald-200" : status === "next" ? "bg-sky-50 text-sky-800 ring-1 ring-sky-200" : "bg-slate-100 text-slate-600 ring-1 ring-slate-200"}`}>
    {status === "live" ? "live in this build" : status === "next" ? "next step" : "in code, not yet a setting"}
  </span>
);

function Card({ title, status, children, now }: { title: string; status: Status; children: React.ReactNode; now?: React.ReactNode }) {
  return (
    <div className="flex flex-col rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-base font-semibold text-slate-900">{title}</h3>
        <Tag status={status} />
      </div>
      <div className="mt-2 flex-1 text-sm leading-relaxed text-slate-700">{children}</div>
      {now ? <div className="mt-3 border-t border-slate-100 pt-3 text-sm text-slate-600">{now}</div> : null}
    </div>
  );
}

// the attributes the evidence graph links loans by (everything but the loan and the person themselves)
const LINK_KINDS = NODE_KINDS.filter((k) => k !== "loan" && k !== "person").map((k) => (k === "doc_template" ? "document template" : k === "ip_address" ? "IP address" : k.replace("_", " ")));
const CRS_PRICES = (["crs_identity_check", "crs_credit_report", "crs_fraud_finder", "crs_reverse_phone"] as const)
  .map((t) => ({ tool: t.replace("crs_", "").replace("_", " "), acorns: TOOL_SPECS[t].acorns, unit: TOOL_SPECS[t].unit }));

export function AdaptPanel({ bundle }: { bundle: ReportBundle }) {
  const runId = bundle.report.run_id;
  const [rules, setRules] = useState<Rule[] | null>(null);
  useEffect(() => {
    let live = true;
    fetch(`/api/runs/${encodeURIComponent(runId)}/questions`).then((r) => (r.ok ? r.json() : null))
      .then((b: { rules?: Rule[] } | null) => { if (live) setRules(b?.rules ?? []); }).catch(() => live && setRules([]));
    return () => { live = false; };
  }, [runId]);
  const limit = bundle.report.spend.limit;
  const portfolio = bundle.run.tape_id ? `the uploaded tape ${bundle.run.tape_id}` : `the generated portfolio, seed ${bundle.run.seed}`;

  return (
    <div className="space-y-4">
      <p className="max-w-4xl text-sm text-slate-700">
        A bank fits Threadpull to its own book by configuring it, not by retraining a model. Every change below is a
        record a person can read, approve and roll back; a fine-tuned model would carry the same policy hidden in its
        weights, which a risk officer can&apos;t show a regulator. (The Claude API offers no fine-tuning today, and this
        design does not need it.)
      </p>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Card title="Your policies become rules" status="live"
          now={rules === null ? "Reading the rules in force…" : rules.length
            ? <>In force now: {rules.map((r) => <b key={r.id} className="mr-2">{r.id} v{r.version}</b>)}</>
            : "No rulings yet: the first answer to a question above becomes R-001."}>
          When the run can&apos;t decide and nobody has ruled on a case like it, it asks the right person once. A yes is saved as a
          versioned rule naming who approved it; later runs apply it on their own and cite it. A case outside the rule asks again.
        </Card>
        <Card title="Your loan tape, as it comes" status="live" now={<>This run read {portfolio}. <a className="font-medium text-slate-900 underline" href="/upload">Upload a tape</a></>}>
          JSON or CSV in the dealer-application shape, validated row by row, with a report of every rejected row and why.
          An SSN that could belong to a real person is refused at the door.
        </Card>
        <Card title="Your documents, any layout" status="live">
          Pay stubs are read by a fixed parser first. A layout it can&apos;t read goes to Claude Haiku, and code accepts the
          answer only if every value is printed on the line Haiku cites; otherwise the stub is reported unreadable. Lines with
          instructions in them never reach the model.
        </Card>
        <Card title="Your budget and prices" status="in code"
          now={<>This run: {limit ?? "?"} acorns. CRS prices: {CRS_PRICES.map((p) => `${p.tool} ${p.acorns} (${p.unit})`).join(" · ")}.</>}>
          The run spends no more than the budget, and the ledger reserves each check's listed price before it runs and refunds a check that fails.
          The budget is set per run (<code className="text-xs">bun run hazel --budget</code>); prices live in one table in code.
        </Card>
        <Card title="What counts as a connection" status="in code" now={<>Linked by: {LINK_KINDS.join(", ")}.</>}>
          A shared attribute counts in proportion to how rare it is across the tape, so a big employer or a busy dealer barely
          moves a loan and a shared bank account does. Location alone never counts. The weights are code, tested, in one place.
        </Card>
        <Card title="Beyond auto loans" status="next">
          Auto-specific today: the vehicle block, VIN checks and dealer month-end bursts. The rest, from the identity graph,
          CRS checks and innocent-explanation checks to rules, the budget, the injection guard and this screen, applies to any
          consumer lending tape: personal loans, buy-now-pay-later, cards, small-business loans. A new product means a new tape
          mapping and its own explanation checks, not a new model.
        </Card>
      </div>
    </div>
  );
}
