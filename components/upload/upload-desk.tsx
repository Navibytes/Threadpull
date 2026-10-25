"use client";

// The intake desk: drop a tape on the envelope (or choose one, or send the sample), then read the report.
// The envelope is a real <label> around a file input, so it works with a keyboard and a screen reader as well as
// by drag and drop. Hazel watches with her own poses: thinking while the tape is read, discovery when a document
// carries instructions, resolved when it's in.
import Image from "next/image";
import { useRouter } from "next/navigation";
import { replayIntroNextTime } from "@/components/board/intro-seen";
import { useEffect, useRef, useState, type DragEvent, type ReactNode } from "react";
import { IntakeReportView } from "./intake-report";
import { JSON_SAMPLE_URL, PLANTED, sendTape, TEMPLATE_URL, type UploadState } from "./upload-model";
import { MAX_SAMPLE_SEED, SAMPLE_SIZES, sampleName, sampleProblem, sampleUrl } from "@/lib/ingest/sample";
import { DEFAULT_RUN_BUDGET, RUN_BUDGETS } from "@/lib/runs/budgets";
import s from "@/components/landing/landing.module.css";
import u from "./upload.module.css";

// the passcode, kept for this browser tab only
const readCode = () => { try { return sessionStorage.getItem("threadpull-passcode") ?? ""; } catch { return ""; } };
const saveCode = (c: string) => { try { sessionStorage.setItem("threadpull-passcode", c); } catch { /* private mode: ask again next time */ } };

export function UploadDesk() {
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const result = useRef<HTMLHeadingElement>(null);
  const busy = state.kind === "sending";
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const tapeFile = useRef<Blob | null>(null); // the tape as uploaded, sent again with Investigate (a serverless host keeps no upload)
  const [needCode, setNeedCode] = useState(false);
  const [budget, setBudget] = useState<number>(DEFAULT_RUN_BUDGET);
  const [code, setCode] = useState("");

  // Investigate the accepted loans: the server starts Hazel on them, then the board follows the run live.
  const investigate = async (tapeId: string) => {
    setStarting(true);
    setRunError(null);
    try {
      const passcode = code.trim() || readCode();
      const res = await fetch(`/api/tapes/${encodeURIComponent(tapeId)}/runs?budget=${budget}`, { method: "POST",
        headers: { "Content-Type": "text/plain", ...(passcode ? { "x-threadpull-passcode": passcode } : {}) },
        body: tapeFile.current ? await tapeFile.current.text() : undefined });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401 && (body as { passcode_required?: boolean }).passcode_required) {
        setNeedCode(true);
        throw new Error(passcode ? "That passcode isn't right." : (body as { error?: string }).error ?? "A passcode is needed.");
      }
      if (!res.ok) throw new Error((body as { error?: string }).error ?? `The server answered HTTP ${res.status}.`);
      if (passcode) saveCode(passcode);
      replayIntroNextTime(); // arriving from an upload always opens on the opening scene
      router.push(`/board?run=${encodeURIComponent((body as { run_id: string }).run_id)}`);
    } catch (e) {
      setRunError(e instanceof Error ? e.message : String(e));
      setStarting(false);
    }
  };

  // after an answer, move focus to it so keyboard and screen-reader users land on the result
  useEffect(() => {
    if (state.kind === "done" || state.kind === "failed") result.current?.focus();
  }, [state]);

  const send = async (file: Blob, name: string) => {
    tapeFile.current = file;
    setState({ kind: "sending", name });
    setState(await sendTape(file, name));
    if (input.current) input.current.value = ""; // choosing the same file again still fires a change
  };

  const sample = async (url: string, name: string) => {
    setState({ kind: "sending", name });
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error();
      await send(await res.blob(), name);
    } catch {
      setState({ kind: "failed", name, message: "The sample tape couldn't be loaded." });
    }
  };

  const drop = (e: DragEvent<HTMLLabelElement>) => {
    e.preventDefault();
    setOver(false);
    const file = e.dataTransfer.files[0];
    if (file && !busy) void send(file, file.name);
  };

  const pose = state.kind === "sending" ? "thinking"
    : state.kind === "done" && state.report.flagged_documents.length ? "discovery"
    : state.kind === "done" && state.saved ? "resolved" : "idle";

  // Two grid items for the page: the desk, and (once there is an answer) the report across the full width.
  return (
    <>
      <div>
        <div className={u.deskRow}>
          <label
            className={`folder worn-2 ${u.envelope}`}
            data-over={over || undefined}
            data-busy={busy || undefined}
            onDragOver={(e) => { e.preventDefault(); if (!busy) setOver(true); }}
            onDragLeave={() => setOver(false)}
            onDrop={drop}
          >
            <span className={`folder-tab ${u.envelopeTab}`} aria-hidden>INTAKE</span>
            <input
              ref={input}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              className="sr-only"
              disabled={busy}
              onChange={(e) => { const f = e.target.files?.[0]; if (f) void send(f, f.name); }}
            />
            <span className={u.envelopeInner}>
              <span className={u.envelopeTitle}>{busy ? "Reading the tape…" : over ? "Let go to hand it over" : "Drop the loan tape here"}</span>
              <span className={u.envelopeHint}>
                {busy ? `${state.name}` : <>or <span className={u.fakeLink}>choose a file</span> · JSON or CSV · up to 10 MB</>}
              </span>
            </span>
          </label>

          <div className={u.hazel} aria-hidden>
            {(["idle", "thinking", "discovery", "resolved"] as const).map((p) => (
              <Image key={p} src={`/hazel/hazel-${p}.png`} alt="" width={1219} height={1290} sizes="150px"
                className="hazel-pose absolute inset-0 h-full w-full" data-active={p === pose} />
            ))}
          </div>
        </div>

        <TryOurs busy={busy} onUse={(url, name) => void sample(url, name)} />

        <p className="sr-only" role="status" aria-live="polite">
          {state.kind === "sending" ? `Reading ${state.name}.`
            : state.kind === "done" ? `${state.report.accepted} of ${state.report.received} loans accepted.`
            : state.kind === "failed" ? `Upload failed: ${state.message}` : ""}
        </p>
      </div>

      {(state.kind === "done" || state.kind === "failed") && (
        <div className="lg:col-span-2">
          {state.kind === "done" && (
            <IntakeReportView name={state.name} report={state.report} saved={state.saved} headingRef={result}
              actions={state.saved ? (
                <InvestigatePanel loans={state.report.accepted} budget={budget} onBudget={setBudget} starting={starting}
                  onInvestigate={() => void investigate(state.report.tape_id)} onAnother={() => { setRunError(null); setState({ kind: "idle" }); }}
                  passcode={needCode ? (
                    <label className="block text-sm font-medium text-walnut">Passcode for live runs (the team has it)
                      <input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off"
                        onKeyDown={(e) => { if (e.key === "Enter" && state.kind === "done") void investigate(state.report.tape_id); }}
                        className="ml-2 rounded-sm border border-walnut/30 bg-paper px-2 py-1 text-sm" />
                    </label>) : null}
                  error={runError} />
              ) : (
                <button type="button" className={s.paperButton} onClick={() => { setRunError(null); setState({ kind: "idle" }); }}>Upload another tape</button>
              )} />
          )}
          {state.kind === "failed" && (
            <div className={`${u.failure} panel-paper worn-0`} role="alert">
              <h2 ref={result} tabIndex={-1} className={u.resultTitle}>The tape couldn&apos;t be read.</h2>
              <p className="mt-2">{state.name && <><span className="font-semibold">{state.name}</span>: </>}{state.message}</p>
              <button type="button" className={`${s.paperButton} mt-4`} onClick={() => setState({ kind: "idle" })}>Try another file</button>
            </div>
          )}
        </div>
      )}
    </>
  );
}

// Starting the run: how many acorns it may spend, then Investigate. Code enforces the budget (lib/ledger.ts); Hazel
// can't raise it. Every measured result on this site was run with 60, so the other two say they are not measured.
const BUDGET_CHOICES: Record<number, { name: string; line: string; measured?: true }> = {
  30: { name: "Tight", line: "Less left for checking the largest balances once the threads run out." },
  60: { name: "Standard", line: "The budget every measured result on this site was run with.", measured: true },
  120: { name: "Thorough", line: "More of the largest balances checked once the threads run out. Takes longer." },
};

function InvestigatePanel({ loans, budget, onBudget, starting, onInvestigate, onAnother, passcode, error }: {
  loans: number; budget: number; onBudget: (n: number) => void; starting: boolean;
  onInvestigate: () => void; onAnother: () => void; passcode: ReactNode; error: string | null;
}) {
  return (
    <div className="w-full">
      <fieldset disabled={starting}>
        <legend className="font-display text-xl font-semibold text-walnut">How much may Hazel spend on checks?</legend>
        <p className="mt-1 max-w-2xl text-sm text-walnut/85">
          Acorns are Threadpull&apos;s unit for checking cost: one loan through all four CRS checks costs 12. The limit is
          enforced in code, and Hazel can&apos;t raise it.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {RUN_BUDGETS.map((n) => {
            const c = BUDGET_CHOICES[n], on = budget === n;
            return (
              <label key={n} className={`relative flex cursor-pointer flex-col rounded-sm border p-3 transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-walnut ${on ? "border-walnut bg-walnut/[0.07] shadow-[inset_0_0_0_1px_var(--color-walnut)]" : "border-walnut/30 bg-paper hover:border-walnut/60"}`}>
                <input type="radio" name="run-budget" value={n} checked={on} onChange={() => onBudget(n)} className="sr-only" />
                <span className="flex items-baseline justify-between gap-2">
                  <span className="font-display text-2xl font-semibold tabular-nums text-walnut">{n}<span className="ml-1 font-sans text-sm font-medium">acorns</span></span>
                  <span aria-hidden className={`size-4 shrink-0 rounded-full border-2 ${on ? "border-walnut bg-walnut shadow-[inset_0_0_0_2px_#fbf6ea]" : "border-walnut/40"}`} />
                </span>
                <span className="mt-1 text-sm font-semibold text-walnut">{c.name}{c.measured ? " · measured" : " · not measured"}</span>
                <span className="mt-1 text-sm leading-snug text-walnut/85">{c.line}</span>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="mt-5 flex flex-wrap items-center gap-x-5 gap-y-3">
        <button type="button" className={`brass-plate ${s.brass}`} onClick={onInvestigate} disabled={starting}>
          {starting ? "Starting the investigation…" : `Investigate these ${loans.toLocaleString("en-US")} loans · ${budget} acorns`}
        </button>
        <button type="button" className={u.textLink} onClick={onAnother}>Upload another tape</button>
      </div>
      <p className="mt-2 text-sm text-walnut/80">Runs live on Claude and the CRS sandbox. The board shows each step as it happens; the CRO screen shows the decisions.</p>
      {passcode ? <div className="mt-3">{passcode}</div> : null}
      {error ? <p role="alert" className="mt-2 text-sm text-red-700">{error}</p> : null}
    </div>
  );
}

// No tape of their own: three ready ones, each saying exactly what is in it.
function Option({ title, meta, children, actions }: { title: string; meta: string; children: ReactNode; actions: ReactNode }) {
  return (
    <li className="rounded-sm border border-walnut/25 bg-[#fbf6ea]/70 p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h3 className="font-display text-lg font-semibold text-walnut">{title}</h3>
        <span className="text-sm font-medium text-walnut/80">{meta}</span>
      </div>
      <div className="mt-1 max-w-xl text-sm leading-relaxed text-walnut/85">{children}</div>
      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">{actions}</div>
    </li>
  );
}

function TryOurs({ busy, onUse }: { busy: boolean; onUse: (url: string, name: string) => void }) {
  const [seedText, setSeedText] = useState("4242");
  const [loans, setLoans] = useState<number>(SAMPLE_SIZES[1]);
  const seed = Number(seedText);
  const problem = seedText === "" ? "enter a seed" : sampleProblem(seed, loans);
  const roll = () => setSeedText(String(1 + Math.floor(Math.random() * MAX_SAMPLE_SEED)));
  const own = { seed, loans };
  return (
    <section aria-labelledby="try-ours" className="mt-8">
      <h2 id="try-ours" className="font-display text-xl font-semibold text-walnut">No tape of your own? Use one of ours.</h2>
      <p className="mt-1 text-sm text-walnut/85">All synthetic: generated loans and CRS sandbox identities. Using one uploads it here; downloading only saves the file.</p>
      <ol className="mt-4 grid list-none gap-4 p-0">
        <Option title="1. Our sample portfolio" meta="1,000 loans · JSON"
          actions={<>
            <button type="button" className={s.paperButton} disabled={busy} onClick={() => onUse(JSON_SAMPLE_URL, "sample-tape-1000-loans.json")}>Use this tape</button>
            <a className={u.textLink} href={JSON_SAMPLE_URL} download="sample-tape-1000-loans.json">Download (JSON)</a>
          </>}>
          Seed 13, the portfolio we built Threadpull on. Planted in it: {PLANTED}.
        </Option>

        <Option title="2. A new portfolio from your seed" meta="300 to 1,000 loans · JSON"
          actions={<>
            <label className="text-sm font-medium text-walnut">Seed
              <span className="mt-1 flex gap-1.5">
                <input inputMode="numeric" value={seedText} onChange={(e) => setSeedText(e.target.value.replace(/[^0-9]/g, "").replace(/^0+/, "").slice(0, 6))}
                  aria-invalid={problem !== null} aria-describedby="seed-help"
                  className="block w-28 rounded-sm border border-walnut/35 bg-paper px-2 py-1.5 tabular-nums" />
                <button type="button" onClick={roll} className="rounded-sm border border-walnut/35 bg-paper px-2.5 text-sm font-semibold text-walnut hover:bg-white">Random</button>
              </span>
            </label>
            <fieldset className="text-sm font-medium text-walnut">
              <legend>Loans</legend>
              <span className="mt-1 flex overflow-hidden rounded-sm border border-walnut/35">
                {SAMPLE_SIZES.map((n) => (
                  <label key={n} className={`cursor-pointer px-3 py-1.5 tabular-nums has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-amber ${loans === n ? "bg-walnut font-semibold text-white" : "bg-paper text-walnut hover:bg-white"}`}>
                    <input type="radio" name="sample-loans" value={n} checked={loans === n} onChange={() => setLoans(n)} className="sr-only" />
                    {n.toLocaleString("en-US")}
                  </label>
                ))}
              </span>
            </fieldset>
            <button type="button" className={s.paperButton} disabled={busy || problem !== null} onClick={() => onUse(sampleUrl(own), sampleName(own))}>Generate and use</button>
            {problem === null ? <a className={u.textLink} href={sampleUrl(own)} download={sampleName(own)}>Download (JSON)</a> : null}
            <p id="seed-help" className={`basis-full text-sm ${problem ? "text-terracotta" : "text-walnut/80"}`}>
              {problem ? problem.charAt(0).toUpperCase() + problem.slice(1) + "." : `Seed ${seed}, ${loans.toLocaleString("en-US")} loans. The same seed and size always give the same tape.`}
            </p>
          </>}>
          The same planted cases as the sample, generated fresh: your seed (any number from 1 to {MAX_SAMPLE_SEED.toLocaleString("en-US")})
          picks every name, address and background loan, and where in the tape the cases sit. Use it to check that the results don&apos;t
          depend on the tape we built on.
        </Option>

        <Option title="3. CSV column template" meta="3 loans · CSV"
          actions={<>
            <button type="button" className={s.paperButton} disabled={busy} onClick={() => onUse(TEMPLATE_URL, "loan-tape-template.csv")}>Use this tape</button>
            <a className={u.textLink} href={TEMPLATE_URL} download>Download (CSV)</a>
          </>}>
          Shows the columns a CSV tape needs, for formatting your own. Nothing is planted in it, so an investigation finds nothing.
        </Option>
      </ol>
    </section>
  );
}
