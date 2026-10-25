"use client";

// The intake desk: drop a tape on the envelope (or choose one, or send the sample), then read the report.
// The envelope is a real <label> around a file input, so it works with a keyboard and a screen reader as well as
// by drag and drop. Hazel watches with her own poses: thinking while the tape is read, discovery when a document
// carries instructions, resolved when it's in.
import Image from "next/image";
import { useRouter } from "next/navigation";
import { replayIntroNextTime } from "@/components/board/intro-seen";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { IntakeReportView } from "./intake-report";
import { JSON_SAMPLE_URL, sendTape, TEMPLATE_URL, type UploadState } from "./upload-model";
import { MAX_SAMPLE_SEED, SAMPLE_SIZES, sampleName, sampleProblem, sampleUrl } from "@/lib/ingest/sample";
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
  const [code, setCode] = useState("");

  // Investigate the accepted loans: the server starts Hazel on them, then the board follows the run live.
  const investigate = async (tapeId: string) => {
    setStarting(true);
    setRunError(null);
    try {
      const passcode = code.trim() || readCode();
      const res = await fetch(`/api/tapes/${encodeURIComponent(tapeId)}/runs`, { method: "POST",
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

        <p className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-3">
          <button type="button" className={s.paperButton} onClick={() => void sample(JSON_SAMPLE_URL, "sample-tape-1000-loans.json")} disabled={busy}>Use the sample portfolio (JSON, 1,000 loans)</button>
          <button type="button" className={s.paperButton} onClick={() => void sample(TEMPLATE_URL, "loan-tape-template.csv")} disabled={busy}>Use the CSV template (3 loans)</button>
          <a className={u.textLink} href={JSON_SAMPLE_URL} download="sample-tape-1000-loans.json">Download the JSON sample</a>
          <a className={u.textLink} href={TEMPLATE_URL} download>Download the CSV template</a>
        </p>

        <OwnPortfolio busy={busy} onUse={(seed, loans) => void sample(sampleUrl({ seed, loans }), sampleName({ seed, loans }))} />

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
              actions={<>
                {state.saved ? (
                  <button type="button" className={s.paperButton} onClick={() => void investigate(state.report.tape_id)} disabled={starting}>
                    {starting ? "Starting the investigation…" : `Investigate these ${state.report.accepted.toLocaleString("en-US")} loans`}
                  </button>) : null}
                <button type="button" className={s.paperButton} onClick={() => { setRunError(null); setState({ kind: "idle" }); }}>Upload another tape</button>
                {state.saved ? <p className="basis-full text-sm opacity-80">Hazel runs live on the CRS sandbox and Claude, within a 60-acorn budget; the board shows each step, and the CRO screen the decisions.</p> : null}
                {state.saved && needCode ? (
                  <label className="basis-full text-sm">Passcode for live runs (the team has it)
                    <input type="password" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off"
                      onKeyDown={(e) => { if (e.key === "Enter" && state.kind === "done") void investigate(state.report.tape_id); }}
                      className="ml-2 rounded-sm border border-walnut/30 bg-paper px-2 py-1 text-sm" />
                  </label>) : null}
                {runError ? <p role="alert" className="basis-full text-sm text-red-700">{runError}</p> : null}
              </>} />
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

// Pick a portfolio: the same kinds of planted cases (a ring, innocent lookalikes, review cases, an injected pay stub),
// generated for any seed and size, so nobody can say the demo only works on the tape we built it on.
function OwnPortfolio({ busy, onUse }: { busy: boolean; onUse: (seed: number, loans: number) => void }) {
  const [seedText, setSeedText] = useState("4242");
  const [loans, setLoans] = useState<number>(SAMPLE_SIZES[1]);
  const seed = Number(seedText.trim());
  const problem = seedText.trim() === "" ? "enter a seed" : sampleProblem(seed, loans);
  const roll = () => setSeedText(String(1 + Math.floor(Math.random() * MAX_SAMPLE_SEED)));
  return (
    <fieldset className="mt-6 rounded-sm border border-walnut/25 bg-[#fbf6ea]/70 p-4">
      <legend className="px-1 font-display text-lg font-semibold text-walnut">Or generate your own portfolio</legend>
      <p className="max-w-xl text-sm leading-relaxed text-walnut/85">
        Pick any seed and a size. You get a new synthetic tape with the same kinds of cases planted as our development set
        (a fraud ring, innocent lookalikes, review cases and one pay stub with instructions in it), but your seed decides
        the names, addresses, loan positions and every background loan.
      </p>
      <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-3">
        <label className="text-sm font-medium text-walnut">Seed
          <span className="mt-1 flex gap-1.5">
            <input inputMode="numeric" value={seedText} onChange={(e) => setSeedText(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
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
        <button type="button" className={s.paperButton} disabled={busy || problem !== null} onClick={() => onUse(seed, loans)}>
          Generate and use
        </button>
        {problem === null
          ? <a className={u.textLink} href={sampleUrl({ seed, loans })} download={sampleName({ seed, loans })}>Download it</a>
          : null}
      </div>
      <p id="seed-help" className={`mt-2 text-sm ${problem ? "text-terracotta" : "text-walnut/80"}`}>
        {problem ? problem.charAt(0).toUpperCase() + problem.slice(1) + "." : `Seed ${seed.toLocaleString("en-US")}, ${loans.toLocaleString("en-US")} loans. The same seed always gives the same tape.`}
      </p>
    </fieldset>
  );
}
