"use client";
// Questions the run asked a person (ticket 11): ask once, remember forever. Each shows who it is for, the confidence and
// reason code computed (never the model), the evidence both ways and the scope a yes would save. A yes saves a rule the
// next run applies on its own, citing it; a no saves nothing. GET / POST /api/runs/{id}/questions.
import { useCallback, useEffect, useState } from "react";
import type { Question, Rule, RuleWhen } from "@/lib/contracts/rule";
import type { Mirror } from "@/lib/deal/dispositions-db";
import { plural } from "./format";

type RunQuestions = { questions: Question[]; rules: Rule[] };

export const scopeText = (w: RuleWhen) => [
  `a shared ${w.link_kind.replace("_", " ")}`,
  w.min_group_size !== undefined ? `with ${w.min_group_size.toLocaleString("en-US")}+ staff` : null,
  w.max_group_size !== undefined ? `with at most ${w.max_group_size.toLocaleString("en-US")} staff` : null,
  w.tenure_on_credit_file ? "and tenure on the credit file" : null,
].filter(Boolean).join(" ");

const copyNote = (m?: Mirror) =>
  m?.status === "saved" ? " The board has it too." : m?.status === "failed" ? ` Saved in the run's event log; the Supabase copy failed: ${m.error}.` : "";

function Evidence({ q }: { q: Question }) {
  const list = (label: string, items: Question["confidence_basis"]["for"]) => items.length ? (
    <div><div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <ul className="mt-1 list-disc pl-5 text-sm text-slate-700">{items.map((x) => <li key={x.label}>{x.label}</li>)}</ul></div>) : null;
  return <div className="grid gap-3 sm:grid-cols-2">{list("Points to an ordinary explanation", q.confidence_basis.for)}{list("Points the other way", q.confidence_basis.against)}</div>;
}

function AnswerForm({ q, who, busy, onAnswer }: { q: Question; who: string; busy: boolean; onAnswer: (a: { decision: "yes" | "no"; text: string; min_group_size?: number }) => Promise<string | null> }) {
  const [text, setText] = useState("");
  const [staff, setStaff] = useState(String(q.proposed_rule?.min_group_size ?? ""));
  const [error, setError] = useState<string | null>(null);
  const staffOk = /^\d+$/.test(staff.trim()) && Number(staff) > 0;
  const ready = text.trim().length >= 10 && !busy;
  const send = async (decision: "yes" | "no") => {
    const size = q.proposed_rule?.min_group_size !== undefined && decision === "yes" ? Number(staff) : undefined;
    setError(await onAnswer({ decision, text: text.trim(), ...(size !== undefined ? { min_group_size: size } : {}) }));
  };
  return (
    <form className="mt-4 space-y-3 rounded-md bg-slate-50 p-3" onSubmit={(e) => e.preventDefault()}>
      <label className="block text-sm font-medium text-slate-800">Your answer, in your words (required, at least 10 characters)
        <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} className="mt-1 block w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm" />
      </label>
      {q.proposed_rule?.min_group_size !== undefined ? (
        <label className="block text-sm font-medium text-slate-800">A yes covers employers with at least this many staff
          <input inputMode="numeric" value={staff} onChange={(e) => setStaff(e.target.value)} className="mt-1 block w-32 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm tabular-nums" />
        </label>) : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" disabled={!ready || (q.proposed_rule?.min_group_size !== undefined && !staffOk)} onClick={() => void send("yes")}
          className="rounded-md bg-slate-900 px-3.5 py-2 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50">{q.proposed_rule ? "Yes, save it as a rule" : "Yes"}</button>
        <button type="button" disabled={!ready} onClick={() => void send("no")}
          className="rounded-md border border-slate-300 bg-white px-3.5 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50">No</button>
      </div>
      <p className="text-xs text-slate-500">Answering as {who.trim() || "CRO"}. {q.proposed_rule
        ? "A yes is applied by later runs on their own, citing the rule; a no saves no rule."
        : "This question is not about a shared link, so your answer is recorded and no rule is saved."}</p>
      {error ? <p role="alert" className="text-sm text-red-700">{error}</p> : null}
    </form>
  );
}

export function QuestionsPanel({ runId, who, onAnswered }: { runId: string; who: string; onAnswered: () => void }) {
  const [data, setData] = useState<RunQuestions | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/questions`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      setData(body);
      setError(null);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }, [runId]);
  useEffect(() => { setNotice(null); void load(); }, [load]);

  const answer = (q: Question) => async (a: { decision: "yes" | "no"; text: string; min_group_size?: number }) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/runs/${encodeURIComponent(runId)}/questions`, { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question_id: q.id, answered_by: who.trim() || "CRO", ...a }) });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) return (body as { error?: string }).error ?? `The server answered HTTP ${res.status}.`;
      const rule = (body as { rule?: Rule | null }).rule;
      setNotice(`${q.id}: ${rule ? `saved as ${rule.id} v${rule.version}` : "answered no, no rule saved"}.${copyNote((body as { mirror?: Mirror }).mirror)}`);
      await load();
      onAnswered();
      return null;
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    } finally { setBusy(false); }
  };

  if (error) return <p role="alert" className="text-sm text-red-700">{error}</p>;
  if (!data) return <p className="text-sm text-slate-600">Loading questions…</p>;
  return (
    <div className="space-y-4">
      <div aria-live="polite" className="min-h-5 text-sm">{notice ? <span className="text-emerald-800">{notice}</span> : null}</div>
      {!data.questions.length ? <p className="text-sm text-slate-600">This run asked nobody anything.</p> : null}
      {data.questions.map((q) => (
        <article key={q.id} className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="text-base font-semibold text-slate-900">{q.question}</h3>
            <span className="text-xs text-slate-500">{q.id} · {plural(q.loan_ids.length, "loan")}: {q.loan_ids.slice(0, 6).join(", ")}{q.loan_ids.length > 6 ? "…" : ""}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">For the <b>{q.to}</b> · confidence in the ordinary explanation <b className="tabular-nums">{q.confidence}%</b> · reason: <b>{q.reason}</b> <span className="text-xs text-slate-500">(code computes these from the evidence, not the model)</span></p>
          <div className="mt-3"><Evidence q={q} /></div>
          {q.proposed_rule ? <p className="mt-3 text-sm text-slate-700">A yes saves: <b>{scopeText(q.proposed_rule)}</b> is an ordinary explanation for the link.</p> : null}
          {q.status === "pending"
            ? <AnswerForm q={q} who={who} busy={busy} onAnswer={answer(q)} />
            : <p className="mt-3 text-sm font-medium text-emerald-800">Answered {q.answer!.decision} by {q.answer!.answered_by}{q.answer!.rule_id ? `, saved as ${q.answer!.rule_id}` : ""}: “{q.answer!.text}”</p>}
        </article>))}
      {data.rules.length ? (
        <div className="rounded-lg border border-slate-200 bg-white p-4 text-sm shadow-sm">
          <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Rules in force (applied by every later run)</div>
          <ul className="mt-2 space-y-1">{data.rules.map((r) => <li key={r.id}><b>{r.id} v{r.version}</b>: {scopeText(r.when)}. {r.reason_text} <span className="text-slate-500">({r.created_from})</span></li>)}</ul>
        </div>) : null}
    </div>
  );
}
