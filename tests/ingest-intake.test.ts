// Upload, Phase 1: loan-tape intake (lib/ingest/intake.ts, csv.ts, tapes.ts). A tape goes in as JSON or CSV; out come
// the same normalized loans the generator makes, row-level rejections with reasons, and a report. Real SSNs never pass.
import { beforeAll, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Loan, RawLoan } from "@/lib/contracts/loan";
import { createDataRoom, runTool } from "@/lib/agent/tools";
import { formatTapeCsv, parseCsv, rowToRawLoan, TAPE_COLUMNS } from "@/lib/ingest/csv";
import { IntakeError, intakeTape, isSyntheticSsn, MAX_TAPE_LOANS, referenceFromTape } from "@/lib/ingest/intake";
import { loadTape, saveTape, tapeDir } from "@/lib/ingest/tapes";
import { generate, type AnswerKey } from "@/data/generate";

const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
let tape: RawLoan[], normalized: Loan[], key: AnswerKey, json: string, csv: string;
beforeAll(() => {
  const r = generate(join(import.meta.dir, "..", "data", "patterns", "seed13.json"), tmp(), tmp());
  json = readFileSync(join(r.outDir, "loans.json"), "utf8");
  csv = readFileSync(join(r.outDir, "loans.csv"), "utf8");
  tape = JSON.parse(json);
  normalized = r.normalized;
  key = JSON.parse(readFileSync(join(r.keyDir, "answer_key.json"), "utf8"));
});
const noDocs = (l: Loan) => ({ ...l, documents: [] });
const edit = (i: number, f: (l: any) => void) => {
  const copy = structuredClone(tape);
  f(copy[i]);
  return copy;
};

describe("a generated tape round-trips", () => {
  test("JSON: every loan accepted, identical to the generator's own normalized loans", () => {
    const { loans, report } = intakeTape(json);
    expect([report.format, report.received, report.accepted, report.rejected]).toEqual(["json", 1000, 1000, []]);
    expect(loans).toEqual(normalized);
  });

  test("CSV: every loan accepted, identical except for documents (a row has none)", () => {
    const { loans, report } = intakeTape(csv);
    expect([report.format, report.accepted, report.rejected, report.documents]).toEqual(["csv", 1000, [], 0]);
    expect(loans).toEqual(normalized.map(noDocs));
    expect([report.unknown_columns, report.missing_columns]).toEqual([[], []]);
  });

  test("the CSV keeps every co-applicant (the generator used to drop them)", () => {
    const withCo = normalized.filter((l) => l.co_applicant_info).length;
    expect(withCo).toBeGreaterThan(50);
    expect(intakeTape(csv).loans.filter((l) => l.co_applicant_info).length).toBe(withCo);
  });

  test("the report: dealers, dates, sandbox identities, the planted injection", () => {
    const { report } = intakeTape(json);
    expect(report.dealers).toBe(new Set(normalized.map((l) => l.submission.dealer_id)).size);
    const times = normalized.map((l) => l.submission.submitted_at).sort();
    expect(report.submitted).toEqual({ first: times[0], last: times.at(-1)! });
    expect(report.sandbox_identities).toBe(normalized.filter((l) => l.persona_id).length); // case loans carry the 20 personas
    expect(report.flagged_documents).toEqual(key.injected_docs);
    expect(report.notes.join(" ")).toContain("no CRS sandbox identity");
  });

  test("the same tape always gets the same id; a changed tape gets another", () => {
    const a = intakeTape(json).report.tape_id;
    expect(a).toMatch(/^t-[0-9a-f]{12}$/);
    expect(intakeTape(json).report.tape_id).toBe(a);
    expect(intakeTape(JSON.stringify(edit(0, (l) => { l.funding_info.term_months = 61; }))).report.tape_id).not.toBe(a);
  });
});

describe("halt one loan, never the batch", () => {
  test("bad rows are rejected with reasons; the rest go through", () => {
    const bad = edit(4, (l) => { l.vehicle_and_loan_details.vin = "SHORT"; });
    (bad[9].residential_info as { housing_status: string }).housing_status = "Castle";
    bad[20].submission.submitted_at = "yesterday-ish";
    const { report } = intakeTape(JSON.stringify(bad));
    expect(report.accepted).toBe(997);
    expect(report.rejected.map((r) => [r.row, r.loan_id])).toEqual([[5, bad[4].loan_id], [10, bad[9].loan_id], [21, bad[20].loan_id]]);
    expect(report.rejected[0].reasons[0]).toStartWith("vehicle_and_loan_details.vin:");
    expect(report.rejected[1].reasons[0]).toStartWith("residential_info.housing_status:");
    expect(report.rejected[2].reasons).toEqual(["submission.submitted_at: unrecognized timestamp format"]);
  });

  test("CSV rows are counted as spreadsheet lines (the header is line 1)", () => {
    const lines = csv.trimEnd().split("\n");
    lines[3] = lines[3].replace(/,(New|Used),/, ",Hovercraft,");
    const { report } = intakeTape(lines.join("\n"));
    expect(report.rejected.map((r) => r.row)).toEqual([4]);
    expect(report.rejected[0].reasons[0]).toStartWith("vehicle_and_loan_details.vehicle_condition:");
  });

  test("a repeated loan_id keeps the first row and rejects the later one", () => {
    const dup = [...tape, structuredClone(tape[7])];
    const { report } = intakeTape(JSON.stringify(dup));
    expect(report.accepted).toBe(1000);
    expect(report.rejected).toEqual([{ row: 1001, loan_id: tape[7].loan_id, reasons: ["loan_id: already used at array position 8"] }]);
  });

  test("a tape where nothing is acceptable still reports, with zero accepted", () => {
    const { report, loans } = intakeTape(JSON.stringify([{ loan_id: "L0001" }, 42]));
    expect([report.accepted, loans.length, report.rejected.length]).toEqual([0, 0, 2]);
    expect(report.rejected[1].reasons).toEqual(["not a loan record"]);
  });
});

describe("synthetic and sandbox data only", () => {
  test("only never-issued SSN area numbers pass", () => {
    for (const ok of ["666701001", "666-70-1001", "935 40 8294", "000123456", "999999999"]) expect(isSyntheticSsn(ok)).toBe(true);
    for (const no of ["123456789", "665-12-3456", "899123456", "12345678", "1234567890", ""]) expect(isSyntheticSsn(no)).toBe(false);
  });

  test("a row with a possibly real SSN is refused, and the SSN appears nowhere in the report", () => {
    const real = "123-45-6789";
    const { report, loans } = intakeTape(JSON.stringify(edit(2, (l) => { l.applicant_info.ssn = real; })));
    expect(report.accepted).toBe(999);
    expect(report.rejected[0].reasons).toEqual([expect.stringContaining("not a synthetic or sandbox SSN")]);
    const out = JSON.stringify({ report, loans });
    expect(out).not.toContain(real);
    expect(out).not.toContain("123456789");
  });

  test("no rejection reason quotes a value from the tape", () => {
    const secret = edit(0, (l) => { l.applicant_info.date_of_birth = "SECRET-DOB-1999"; l.vehicle_and_loan_details.vin = "SECRETVIN"; });
    const { report } = intakeTape(JSON.stringify(secret));
    expect(JSON.stringify(report.rejected)).not.toContain("SECRET");
  });
});

describe("unreadable tapes are refused as a whole", () => {
  test.each([
    ["", "the file is empty"],
    ["[", "isn't valid JSON"],
    ["{\"rows\": []}", "an array of loans"],
    ["[]", "no loans"],
    ["name,age\nAda,36\n", "none of the tape's columns"],
    ["loan_id,kind\n", "no loans"],
    ["loan_id\n\"L0001", "ends inside a quoted cell"],
  ])("%p", (text, message) => {
    expect(() => intakeTape(text)).toThrow(IntakeError);
    expect(() => intakeTape(text)).toThrow(message);
  });

  test(`more than ${MAX_TAPE_LOANS} loans`, () => {
    expect(() => intakeTape(JSON.stringify(Array.from({ length: MAX_TAPE_LOANS + 1 }, () => ({}))))).toThrow("the limit is");
  });
});

describe("CSV details", () => {
  test("quoted cells keep commas, quotes and line breaks; a BOM is ignored", () => {
    expect(parseCsv('﻿a,b,c\r\n"x, y","say ""hi""","two\nlines"\n\n')).toEqual([["a", "b", "c"], ["x, y", 'say "hi"', "two\nlines"]]);
  });

  test("formatTapeCsv and parseCsv agree on every generated row", () => {
    const [header, ...rows] = parseCsv(formatTapeCsv(tape));
    expect(header).toEqual([...TAPE_COLUMNS]);
    expect(rows.length).toBe(1000);
  });

  test("unknown headers are ignored and reported; none can write outside the loan", () => {
    const lines = csv.trimEnd().split("\n");
    lines[0] += ",__proto__.polluted,constructor.prototype.polluted,notes";
    for (let i = 1; i < lines.length; i++) lines[i] += ",yes,yes,hello";
    const { report } = intakeTape(lines.join("\n"));
    expect(report.unknown_columns).toEqual(["__proto__.polluted", "constructor.prototype.polluted", "notes"]);
    expect(report.accepted).toBe(1000);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(rowToRawLoan(["__proto__.x"], ["1"])).not.toHaveProperty("x");
  });

  test("a seller's tape without kind, persona_id or co-applicant columns is fine", () => {
    const drop = new Set(["kind", "persona_id", "co_applicant_info.first_name", "co_applicant_info.last_name", "co_applicant_info.relationship"]);
    const rows = parseCsv(csv);
    const keep = rows[0].map((c, i) => (drop.has(c) ? -1 : i)).filter((i) => i >= 0);
    const q = (c: string) => `"${c.replace(/"/g, '""')}"`;
    const { loans, report } = intakeTape(rows.map((r) => keep.map((i) => q(r[i])).join(",")).join("\n"));
    expect([report.accepted, report.missing_columns]).toEqual([1000, []]);
    expect(loans.every((l) => l.kind === "background" && l.persona_id === null && l.co_applicant_info === null)).toBe(true);
  });

  test("the published template is accepted as is", () => {
    const { report } = intakeTape(readFileSync(join(import.meta.dir, "..", "public", "templates", "loan-tape-template.csv"), "utf8"));
    expect([report.accepted, report.rejected, report.unknown_columns, report.missing_columns]).toEqual([3, [], [], []]);
  });
});

describe("an accepted tape is ready for Hazel", () => {
  test("the reference only says what the street text says; checks report unknowns honestly", () => {
    const { loans, reference } = intakeTape(csv);
    expect(reference.simulated).toBe(true);
    expect(reference.employers).toEqual({});
    expect(Object.values(reference.addresses).every((a) => a.units === null)).toBe(true);
    const twins = key.lookalikes.find((x) => x.proving_check === "check_address")!.loan_ids;
    const room = createDataRoom(loans, reference);
    const address = room.byId.get(twins[0])!.derived.address_key;
    const check = runTool(room, "check_address", { address }) as { ok: boolean; result: { address_type: string; explains: boolean } };
    expect(check.ok).toBe(true);
    expect(check.result).toMatchObject({ address_type: "multi_unit", explains: false }); // units unknown: no thread comes down
    expect(referenceFromTape([]).addresses).toEqual({});
  });

  test("save and load round-trip; an id that isn't a tape id is refused", () => {
    const root = tmp(), intake = intakeTape(json);
    const dir = saveTape(root, intake);
    expect(existsSync(join(dir, "reference", "public_lookups.json"))).toBe(true);
    const back = loadTape(root, intake.report.tape_id);
    expect(back.loans).toEqual(intake.loans);
    expect(back.report).toEqual(intake.report);
    for (const id of ["../keys", "t-../../x", "seed13", "t-ABCDEF123456"]) expect(() => tapeDir(root, id)).toThrow("not a tape id");
  });
});
