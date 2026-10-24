// Ticket 04: evidence graph, weights, clusters and find_connections (SKELETON §6, §7).
import { beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LoanSchema, type Loan } from "@/lib/contracts/loan";
import { GraphEdgeSchema, type Explanation } from "@/lib/contracts/graph";
import { ToolResultSchema } from "@/lib/contracts/tool-result";
import { buildGraph, findConnections, HOUSEHOLD_FADE, type LoanConnections } from "@/lib/graph";
import { generate, type AnswerKey } from "@/data/generate";

type Over = {
  applicant?: Partial<Loan["applicant_info"]>; residential?: Partial<Loan["residential_info"]>;
  employer?: string; submission?: Partial<Loan["submission"]>; bank?: string; template?: string;
  co?: Loan["co_applicant_info"];
};

/** A loan whose every shareable value is unique unless overridden. */
function loan(n: number, o: Over = {}): Loan {
  const id = `L${String(n).padStart(4, "0")}`;
  const street = o.residential?.street_address ?? `${100 + n} ELM ST`;
  const zip = o.residential?.zip_code ?? "94110";
  return LoanSchema.parse({
    loan_id: id, kind: "background", persona_id: null,
    submission: {
      dealer_id: `DX${n}`, dealer_name: `DEALER ${n}`, broker_id: null, submitted_at: "2026-08-01T10:00:00Z",
      channel: "RouteOne", device_id: `dev-${n}`, ip_address: `203.0.113.${n}`, ...o.submission,
    },
    applicant_info: {
      first_name: `FIRST${n}`, last_name: `LAST${n}`, date_of_birth: "1990-01-01", ssn: `66670${String(n).padStart(4, "0")}`,
      email: `p${n}@example.com`, phone: `555000${String(n).padStart(4, "0")}`, ...o.applicant,
    },
    co_applicant_info: o.co ?? null,
    residential_info: {
      street_address: street, city: "SAN FRANCISCO", state: "CA", zip_code: zip, housing_status: "Rent",
      monthly_housing_payment: 1500, months_at_address: 24, ...o.residential,
    },
    employment_info: { employer_name: o.employer ?? `EMPLOYER ${n}`, job_title: "Clerk", time_at_employer_months: 24, gross_monthly_income: 5000 },
    vehicle_and_loan_details: {
      vehicle_condition: "Used", year_make_model: "2020 TOYOTA CAMRY", vin: "4T1B11HK5LU000001",
      purchase_price: 20000, down_payment: 2000, requested_loan_amount: 18000,
    },
    funding_info: {
      amount_financed: 18000, apr: 7.9, term_months: 60, monthly_payment: 364, first_payment_date: "2026-09-01",
      current_balance: 17500, ach_bank_account: o.bank ?? String(1000000000 + n),
    },
    documents: [{ doc_id: `${id}-PS`, type: "pay_stub", template_id: o.template ?? `T-${n}`, font: "Arial", creating_tool: "x", text: "" }],
    derived: { address_key: `${street.replace(/\s+(APT|UNIT)\s*\S+$/, "")}|${zip}`, dealer_name_raw: `Dealer ${n}`, vehicle_year: 2020, make: "TOYOTA", model_trim: "CAMRY" },
    status: "Not reviewed",
  });
}

const kinds = (es: { kind: string }[]) => es.map((e) => e.kind).sort();
const lookup = (key: string): Explanation["sources"] => [{ kind: "lookup", name: "address_type", key, simulated: true }];

describe("weights", () => {
  test("a personal value shared by strangers is a full-strength link", () => {
    const g = buildGraph([loan(1, { applicant: { phone: "5559990000" } }), loan(2, { applicant: { phone: "5559990000" } })]);
    const [e] = g.edgesOf("L0001");
    expect([e.kind, e.weight, e.shared_by, e.household]).toEqual(["phone", 1, 2, false]);
    expect(GraphEdgeSchema.parse(e)).toEqual(e);
    expect(e.sources).toEqual([
      { kind: "row", loan_id: "L0001", field: "applicant_info.phone" },
      { kind: "row", loan_id: "L0002", field: "applicant_info.phone" },
    ]);
  });

  test("shared-by-nature values weigh 1/n: a 4-loan employer gives 1/4, a 40-loan one 1/40", () => {
    const small = buildGraph([1, 2, 3, 4].map((n) => loan(n, { employer: "Brightside Freight LLC" })));
    expect(small.edgesOf("L0001").map((e) => e.weight)).toEqual([0.25, 0.25, 0.25]);
    const big = buildGraph(Array.from({ length: 40 }, (_, i) => loan(i + 1, { employer: "Mercy Hospital" })));
    expect(big.edgesOf("L0001")[0].weight).toBe(0.025);
  });

  test("a personal value shared by many loans dilutes", () => {
    const g = buildGraph(Array.from({ length: 6 }, (_, i) => loan(i + 1, { submission: { ip_address: "10.0.0.1" } })));
    expect(g.edgesOf("L0001")[0].weight).toBe(0.5);
  });

  test("an employer's spelling (LLC, punctuation, case) does not split it", () => {
    const g = buildGraph([loan(1, { employer: "Brightside Freight LLC" }), loan(2, { employer: "brightside freight" })]);
    expect(kinds(g.edgesOf("L0001"))).toEqual(["employer"]);
  });
});

describe("household fade", () => {
  const home = { street_address: "12 OAK LN", zip_code: "30301" };
  test("same phone + same address + same last name fades the link", () => {
    const g = buildGraph([
      loan(1, { applicant: { phone: "5551112222", last_name: "ABERNATHY" }, residential: home }),
      loan(2, { applicant: { phone: "5551112222", last_name: "ABERNATHY" }, residential: home }),
    ]);
    const phone = g.edgesOf("L0001").find((e) => e.kind === "phone")!;
    expect([phone.weight, phone.household]).toEqual([HOUSEHOLD_FADE, true]);
    expect(phone.sources).toContainEqual({ kind: "row", loan_id: "L0002", field: "applicant_info.last_name" });
    expect(g.edgesOf("L0001").find((e) => e.kind === "address")!.household).toBe(true);
  });

  test("a listed co-applicant counts as the household even with a different last name", () => {
    const g = buildGraph([
      loan(1, { applicant: { phone: "5551112222", first_name: "DENISE", last_name: "MORALES" }, residential: home }),
      loan(2, { applicant: { phone: "5551112222" }, residential: home, co: { first_name: "DENISE", last_name: "MORALES", relationship: "Spouse" } }),
    ]);
    expect(g.edgesOf("L0001").find((e) => e.kind === "phone")!.weight).toBe(HOUSEHOLD_FADE);
  });

  test("strangers sharing a phone at different addresses do not fade", () => {
    const g = buildGraph([
      loan(1, { applicant: { phone: "5551112222", last_name: "SMITH" } }),
      loan(2, { applicant: { phone: "5551112222", last_name: "SMITH" } }),
    ]);
    expect(g.edgesOf("L0001")[0].weight).toBe(1);
  });
});

describe("origin grouping", () => {
  test("device and IP from the same submission count once", () => {
    const sub = { device_id: "dev-shared", ip_address: "10.9.9.9" };
    const g = buildGraph([loan(1, { submission: sub }), loan(2, { submission: sub })]);
    expect(kinds(g.edgesOf("L0001"))).toEqual(["device", "ip_address"]);
    expect(g.pairScore("L0001", "L0002")).toBe(1);
    expect(g.score("L0001").origins).toEqual({ submission: 1 });
  });

  test("independent borrower facts add up", () => {
    const g = buildGraph([loan(1, { applicant: { phone: "5550000999" }, bank: "42" }), loan(2, { applicant: { phone: "5550000999" }, bank: "42" })]);
    expect(g.pairScore("L0001", "L0002")).toBe(2);
  });
});

describe("no location-only links", () => {
  test("same ZIP, city and state on different streets link nothing", () => {
    const g = buildGraph([1, 2, 3].map((n) => loan(n)));
    for (const id of g.loanIds) expect(g.edgesOf(id)).toEqual([]);
    expect(g.rankLeads().every((l) => l.score === 0)).toBe(true);
  });

  test("a shared building links by street address, not by area", () => {
    const g = buildGraph([
      loan(1, { residential: { street_address: "500 MARKET ST APT 4B" } }),
      loan(2, { residential: { street_address: "500 MARKET ST APT 9C" } }),
    ]);
    expect(kinds(g.edgesOf("L0001"))).toEqual(["address"]);
  });

  test("no link is built from city, state or ZIP (the household check may compare a full address)", () => {
    const dir = join(import.meta.dir, "..", "lib", "graph"), loc = /\b(city|state|zip_code)\b/;
    const weights = readFileSync(join(dir, "weights.ts"), "utf8");
    const extractor = weights.slice(weights.indexOf("export function attributesOf"), weights.indexOf("export function householdEvidence"));
    expect(extractor).toContain("address_key");
    expect(loc.test(extractor)).toBe(false);
    for (const f of readdirSync(dir).filter((f) => f !== "weights.ts"))
      expect(loc.test(readFileSync(join(dir, f), "utf8")) ? f : "").toBe("");
  });
});

describe("explained links come down, never disappear", () => {
  const building = () => buildGraph([
    loan(1, { residential: { street_address: "500 MARKET ST APT 4B" } }),
    loan(2, { residential: { street_address: "500 MARKET ST APT 9C" } }),
  ]);
  const why: Explanation = { check: "check_address", reason: "212-unit apartment building", sources: lookup("500 MARKET ST|94110") };

  test("explaining an attribute zeroes its links, keeps them and cites the check", () => {
    const g = building(), entity = g.edgesOf("L0001")[0].entity_id;
    expect(g.score("L0001").score).toBe(0.5);
    const [e] = g.explainEntity(entity, why);
    expect([e.weight, e.explained, e.explanation_ref]).toEqual([0, true, why]);
    expect(g.edgesOf("L0001")).toHaveLength(1);
    expect(g.score("L0001").score).toBe(0);
    expect(g.rawWeight(entity, "L0001", "L0002")).toBe(0.5);
  });

  test("an explanation without a cited check or source is refused", () => {
    const g = building(), entity = g.edgesOf("L0001")[0].entity_id;
    expect(() => g.explainEntity(entity, { ...why, sources: [] })).toThrow();
    expect(() => g.explainEntity(entity, { ...why, check: "vibes" } as unknown as Explanation)).toThrow();
    expect(g.edgesOf("L0001")[0].explained).toBe(false);
  });

  test("one pair's link can be explained alone", () => {
    const g = buildGraph([1, 2, 3].map((n) => loan(n, { applicant: { phone: "5554443333" } })));
    const target = g.edgesOf("L0001").find((e) => e.b === "L0002")!;
    g.explainEdge(target.edge_id, { check: "check_household", reason: "spouses", sources: target.sources });
    expect(g.edgeById(target.edge_id)!.explained).toBe(true);
    expect(g.edgesOf("L0001").find((e) => e.b === "L0003")!.explained).toBe(false);
    expect(() => g.explainEdge("e-phone-nope-L0001-L0002", { check: "rule", reason: "x", sources: target.sources })).toThrow();
  });
});

describe("clusters", () => {
  const chain = () => buildGraph([
    loan(1, { applicant: { phone: "5550000001" } }),
    loan(2, { applicant: { phone: "5550000001" }, bank: "77" }),
    loan(3, { bank: "77" }),
    loan(4, { employer: "Tiny Co" }), loan(5, { employer: "Tiny Co" }), // 0.5: below the bar alone
  ]);

  test("personal links chain loans into one cluster; a lone shared employer does not", () => {
    const [c, ...rest] = chain().clusters();
    expect(c.loan_ids).toEqual(["L0001", "L0002", "L0003"]);
    expect(c.edge_ids).toHaveLength(2);
    expect(rest).toEqual([]);
  });

  test("explaining a link can split a cluster", () => {
    const g = chain(), bank = g.edgesOf("L0003")[0];
    g.explainEdge(bank.edge_id, { check: "crs_reverse_phone", reason: "x", sources: bank.sources });
    expect(g.clusters().map((c) => c.loan_ids)).toEqual([["L0001", "L0002"]]);
  });
});

describe("find_connections", () => {
  const g = () => buildGraph([
    loan(1, { applicant: { phone: "5550000001" } }), loan(2, { applicant: { phone: "5550000001" } }), loan(3),
  ]);

  test("returns cited links at 0 acorns in the tool-result shape", () => {
    const r = findConnections(g(), "L0001");
    expect(ToolResultSchema.parse(r)).toBeTruthy();
    expect([r.ok, r.cost.acorns, r.simulated]).toEqual([true, 0, false]);
    const res = r.result as LoanConnections;
    expect(res.neighbors).toEqual([{ loan_id: "L0002", score: 1, edge_ids: [res.edges[0].edge_id] }]);
    expect(r.sources).toContainEqual({ kind: "row", loan_id: "L0002", field: "applicant_info.phone" });
    expect(res.attributes.find((a) => a.kind === "phone")!.shared_by).toBe(2);
  });

  test("a loan with no links still cites its record; an attribute lists its loans", () => {
    const graph = g();
    expect(findConnections(graph, "L0003").sources).toEqual([{ kind: "row", loan_id: "L0003", field: "loan_id" }]);
    const phone = (findConnections(graph, "L0001").result as LoanConnections).edges[0].entity_id;
    expect(findConnections(graph, phone).result).toMatchObject({ kind: "phone", shared_by: 2, loan_ids: ["L0001", "L0002"], weight: 1 });
  });

  test("unknown ids fail without charging", () => {
    const r = findConnections(g(), "L9999");
    expect([r.ok, r.cost.acorns]).toEqual([false, 0]);
  });

  test("a withdrawn link is still listed, marked explained", () => {
    const graph = g(), e = graph.edgesOf("L0001")[0];
    graph.explainEdge(e.edge_id, { check: "crs_reverse_phone", reason: "x", sources: e.sources });
    const res = findConnections(graph, "L0001").result as LoanConnections;
    expect(res.edges.map((x) => [x.edge_id, x.explained, x.weight])).toEqual([[e.edge_id, true, 0]]);
  });
});

describe("seed 13", () => {
  let key: AnswerKey, graph: ReturnType<typeof buildGraph>;
  beforeAll(() => {
    const tmp = () => mkdtempSync(join(tmpdir(), "tp-"));
    const r = generate(join(import.meta.dir, "..", "data", "patterns", "seed13.json"), tmp(), tmp());
    key = JSON.parse(readFileSync(join(r.keyDir, "answer_key.json"), "utf8"));
    graph = buildGraph(r.normalized);
  });

  test("the top five leads are all ring members", () => {
    const ring = new Set(key.rings[0].loan_ids);
    expect(graph.rankLeads().slice(0, 5).filter((l) => !ring.has(l.loan_id))).toEqual([]);
  });

  test("the strongest cluster is the ring", () => {
    expect(graph.clusters()[0].loan_ids).toEqual([...key.rings[0].loan_ids].sort());
  });

  test("the lead's phone thread reaches exactly one other loan", () => {
    const res = findConnections(graph, "L0037").result as LoanConnections;
    const phone = res.edges.filter((e) => e.kind === "phone");
    expect(phone).toHaveLength(1);
    expect(key.rings[0].loan_ids).toContain(phone[0].b);
  });

  test("the hospital's 40 coworkers are weak links, not a cluster", () => {
    const [hospital] = key.lookalikes.filter((x) => x.loan_ids.length === 40);
    const e = graph.edgesOf(hospital.loan_ids[0]).find((x) => x.kind === "employer")!;
    expect(e.weight).toBe(0.025);
    expect(graph.clusters().some((c) => c.loan_ids.includes(hospital.loan_ids[0]))).toBe(false);
  });
});

test("lib/graph names no planted case, persona or value", () => {
  const dir = join(import.meta.dir, "..", "lib", "graph");
  for (const f of readdirSync(dir)) {
    const hits = readFileSync(join(dir, f), "utf8").match(/\bL\d{4}\b|\bP\d{2}\b|T-7F3A|\bD0\d\b|Brightline|Meridian|R-001/g);
    expect([f, hits]).toEqual([f, null]);
  }
});
