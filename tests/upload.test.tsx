// Upload, Phase 2: the upload page's model (components/upload/upload-model.ts) and the intake report view.
// The page itself is checked in a browser; here: what gets sent, how every server answer is shown, and that the
// report says only what intake found (no tape values, no claims about steps that aren't built).
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { IntakeReportView } from "@/components/upload/intake-report";
import { checkFile, dateRange, MAX_UPLOAD_BYTES, REJECTED_SHOWN, reportFacts, sendTape } from "@/components/upload/upload-model";
import { intakeTape, type IntakeReport } from "@/lib/ingest/intake";
import { generate } from "@/data/generate";

let json: string, csv: string;
beforeAll(() => {
  const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
  const r = generate(join(import.meta.dir, "..", "data", "patterns", "seed13.json"), tmp(), tmp());
  json = readFileSync(join(r.outDir, "loans.json"), "utf8");
  csv = readFileSync(join(r.outDir, "loans.csv"), "utf8");
});

type Sent = { url: string; body: FormData };
const fakeFetch = (status: number, body: unknown, sent: Sent[] = []) =>
  (async (url: RequestInfo | URL, init?: RequestInit) => {
    sent.push({ url: String(url), body: init?.body as FormData });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as typeof fetch;
const blob = (text = "loan_id\nL0001\n") => new Blob([text], { type: "text/csv" });
const someReport = () => intakeTape(csv).report;

describe("what can be sent", () => {
  test("empty and too-large files are stopped before sending", () => {
    expect(checkFile({ name: "a.csv", size: 0 })).toBe("That file is empty.");
    expect(checkFile({ name: "a.csv", size: 15 * 1024 * 1024 })).toBe("That file is over the 10 MB limit (15.0 MB).");
    expect(checkFile({ name: "a.csv", size: MAX_UPLOAD_BYTES + 1 })).not.toBeNull();
    expect(checkFile({ name: "a.csv", size: 2_621_440 })).toBeNull();
  });

  test("a too-large file never reaches the server", async () => {
    const sent: Sent[] = [];
    const big = { size: MAX_UPLOAD_BYTES + 1 } as Blob;
    const state = await sendTape(big, "big.csv", fakeFetch(201, {}, sent));
    expect(state).toMatchObject({ kind: "failed", name: "big.csv" });
    expect(sent).toHaveLength(0);
  });

  test("the tape goes to POST /api/tapes as the multipart field \"tape\", with its file name", async () => {
    const sent: Sent[] = [];
    await sendTape(blob(), "my tape.csv", fakeFetch(201, { report: someReport() }, sent));
    expect(sent[0].url).toBe("/api/tapes");
    const file = sent[0].body.get("tape") as File;
    expect(file.name).toBe("my tape.csv");
    expect(await file.text()).toBe("loan_id\nL0001\n");
  });
});

describe("every server answer becomes something the page can show", () => {
  test("201: done and saved", async () => {
    const report = someReport();
    expect(await sendTape(blob(), "t.csv", fakeFetch(201, { report }))).toEqual({ kind: "done", name: "t.csv", report, saved: true });
  });

  test("422: done, nothing saved, the report still shown", async () => {
    const report = { ...someReport(), accepted: 0 };
    expect(await sendTape(blob(), "t.csv", fakeFetch(422, { error: "no loan in the tape could be accepted", report })))
      .toEqual({ kind: "done", name: "t.csv", report, saved: false });
  });

  test("400 and 413: the server's reason, as a sentence", async () => {
    expect(await sendTape(blob(), "t.csv", fakeFetch(400, { error: "none of the tape's columns were found; start from the template" })))
      .toEqual({ kind: "failed", name: "t.csv", message: "None of the tape's columns were found; start from the template." });
    expect(await sendTape(blob(), "t.csv", fakeFetch(413, { error: "the tape is larger than 10 MB" })))
      .toMatchObject({ message: "The tape is larger than 10 MB." });
  });

  test("a broken answer or no answer at all", async () => {
    expect(await sendTape(blob(), "t.csv", fakeFetch(500, "<html>Internal Server Error</html>")))
      .toEqual({ kind: "failed", name: "t.csv", message: "The server answered 500 without a report." });
    const down = (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch;
    expect(await sendTape(blob(), "t.csv", down)).toMatchObject({ kind: "failed", message: expect.stringContaining("didn't reach the server") });
  });
});

describe("the report in plain words", () => {
  test("headline numbers", () => {
    const facts = Object.fromEntries(reportFacts(intakeTape(json).report).map((f) => [f.label, f]));
    expect(facts["Loans accepted"]).toEqual({ label: "Loans accepted", value: "1,000 of 1,000", tone: "good" });
    expect(facts["Rows rejected"].value).toBe("0");
    expect(facts["Documents"].value).toBe("2,000");
    expect(facts["Instruction-like documents"]).toMatchObject({ value: "1", tone: "alert" });
    expect(Object.fromEntries(reportFacts(someReport()).map((f) => [f.label, f.value]))["Documents"]).toBe("none (CSV)");
  });

  test("date ranges", () => {
    expect(dateRange("2025-10-03T09:00:00Z", "2026-09-24T18:00:00Z")).toBe("Oct 3, 2025 – Sep 24, 2026");
    expect(dateRange("2026-08-11T09:00:00Z", "2026-08-11T17:00:00Z")).toBe("Aug 11, 2026");
  });
});

describe("the report view", () => {
  const withRejects = (n: number): IntakeReport => {
    const tape = JSON.parse(json);
    for (let i = 0; i < n; i++) tape[i].vehicle_and_loan_details.vin = "SHORT";
    tape[n].applicant_info.ssn = "123-45-6789"; // a possibly real SSN
    return intakeTape(JSON.stringify(tape)).report;
  };
  const render = (report: IntakeReport, saved = true) => renderToStaticMarkup(<IntakeReportView name="seller.json" report={report} saved={saved} />);

  test("a clean tape: accepted stamp, numbers, the flagged document; no placeholder for the investigation (the desk's actions start it)", () => {
    const html = render(intakeTape(json).report);
    expect(html).toContain("Tape received.");
    expect(html).toContain(">accepted<");
    expect(html).toContain("1,000 of 1,000");
    expect(html).toContain("L0445-PS");
    expect(html).not.toContain("isn&#x27;t built yet");
    expect(html).not.toContain("Open the case");
    expect(html).not.toContain("rows were rejected");
  });

  test("rejections are listed with reasons, capped with a count of the rest, and never show the SSN", () => {
    const report = withRejects(REJECTED_SHOWN + 4);
    const html = render(report);
    expect(html).toContain(`${REJECTED_SHOWN + 5} rows were rejected`);
    expect(html).toContain("accepted with exceptions");
    expect(html).toContain("vehicle_and_loan_details.vin:");
    expect(html).toContain("and 5 more");
    expect((html.match(/<tr>/g) ?? []).length).toBe(REJECTED_SHOWN + 1); // header + shown rows
    expect(html).not.toContain("123-45-6789");
    expect(html).not.toContain("123456789");
  });

  test("nothing accepted: says so, and offers no next step", () => {
    const report = intakeTape(JSON.stringify([{ loan_id: "L0001" }])).report;
    const html = render(report, false);
    expect(html).toContain("No loan could be accepted.");
    expect(html).toContain(">rejected<");
    expect(html).not.toContain("Open the case");
  });

  test("a CSV with missing and unknown columns lists both", () => {
    const report = intakeTape("loan_id,applicant_info.ssn,notes\nL0001,666701001,hello\n").report;
    const html = render(report, false);
    expect(html).toContain("Missing (");
    expect(html).toContain("submission.dealer_id");
    expect(html).toContain("Ignored, not tape columns");
    expect(html).toContain(">notes<");
  });
});

test("upload components import intake only as a type (intake is server code)", () => {
  for (const f of ["upload-model.ts", "intake-report.tsx", "upload-desk.tsx"]) {
    const src = readFileSync(join(import.meta.dir, "..", "components", "upload", f), "utf8");
    for (const line of src.split("\n").filter((l) => l.includes("@/lib/"))) expect(line).toMatch(/^import type /);
  }
});
