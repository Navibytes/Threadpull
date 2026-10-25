"use client";

// The intake desk: drop a tape on the envelope (or choose one, or send the sample), then read the report.
// The envelope is a real <label> around a file input, so it works with a keyboard and a screen reader as well as
// by drag and drop. Hazel watches with her own poses: thinking while the tape is read, discovery when a document
// carries instructions, resolved when it's in.
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type DragEvent } from "react";
import { IntakeReportView } from "./intake-report";
import { sendTape, TEMPLATE_URL, type UploadState } from "./upload-model";
import s from "@/components/landing/landing.module.css";
import u from "./upload.module.css";

export function UploadDesk() {
  const [state, setState] = useState<UploadState>({ kind: "idle" });
  const [over, setOver] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const result = useRef<HTMLHeadingElement>(null);
  const busy = state.kind === "sending";
  const router = useRouter();
  const [starting, setStarting] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);

  // Investigate the accepted loans: the server starts Hazel on them, then the board follows the run live.
  const investigate = async (tapeId: string) => {
    setStarting(true);
    setRunError(null);
    try {
      const res = await fetch(`/api/tapes/${encodeURIComponent(tapeId)}/runs`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error((body as { error?: string }).error ?? `The server answered HTTP ${res.status}.`);
      router.push(`/?run=${encodeURIComponent((body as { run_id: string }).run_id)}`);
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
    setState({ kind: "sending", name });
    setState(await sendTape(file, name));
    if (input.current) input.current.value = ""; // choosing the same file again still fires a change
  };

  const sample = async () => {
    setState({ kind: "sending", name: "loan-tape-template.csv" });
    try {
      const res = await fetch(TEMPLATE_URL);
      if (!res.ok) throw new Error();
      await send(await res.blob(), "loan-tape-template.csv");
    } catch {
      setState({ kind: "failed", name: "loan-tape-template.csv", message: "The sample tape couldn't be loaded." });
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
          <button type="button" className={s.paperButton} onClick={sample} disabled={busy}>Use the sample tape</button>
          <a className={u.textLink} href={TEMPLATE_URL} download>Download the CSV template</a>
        </p>

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
