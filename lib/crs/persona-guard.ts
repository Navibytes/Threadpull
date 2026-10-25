// Persona guard (ticket 03). CRS request bodies come only from data/personas.json, matched by SSN
// (phone for a reverse lookup). A body that is not a full persona body goes to the real vendor and
// can fail or be billed, so anything else is refused before a request is made.
import file from "@/data/personas.json";

export type Persona = (typeof file.personas)[number];
export type CrsProduct = "tu_identity" | "credit_report" | "fraud_finder" | "reverse_phone";
type Body = Record<string, unknown>;

export class GuardRefused extends Error {}

const digits = (s: string) => s.replace(/\D/g, "");

const BUILD: Record<CrsProduct, (p: Persona) => Body> = {
  tu_identity: (p) => ({
    firstName: p.first_name, lastName: p.last_name, ssn: p.ssn, dob: p.dob,
    street1: p.street1, city: p.city, state: p.state, zip: p.zip,
  }),
  credit_report: (p) => ({
    firstName: p.first_name, lastName: p.last_name, ssn: p.ssn,
    addresses: [{ addressLine1: p.street1, city: p.city, state: p.state, postalCode: p.zip, borrowerResidencyType: "Current" }],
  }),
  fraud_finder: (p) => ({
    firstName: p.first_name, lastName: p.last_name, phoneNumber: p.phone, email: p.email, ipAddress: p.ip_address,
    address: { addressLine1: p.street1, city: p.city, state: p.state, postalCode: p.zip },
  }),
  reverse_phone: (p) => ({ phoneNumber: p.phone }),
};

// Key order must not matter, so bodies are compared as canonical strings.
const canon = (v: unknown): string =>
  Array.isArray(v) ? `[${v.map(canon).join(",")}]`
  : v && typeof v === "object"
    ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon((v as Body)[k])}`).join(",")}}`
    : JSON.stringify(v);

const KNOWN = Object.fromEntries(
  (Object.keys(BUILD) as CrsProduct[]).map((product) => [product, new Set(file.personas.map((p) => canon(BUILD[product](p))))]),
) as Record<CrsProduct, Set<string>>;

/** Throws unless `body` is exactly a sandbox persona's body for this product. The client calls it again right before fetch. */
export function assertSandboxBody(product: CrsProduct, body: unknown): void {
  if (!KNOWN[product].has(canon(body))) throw new GuardRefused(`${product}: body is not a sandbox persona body`);
}

type LoanRef = { loan_id: string; applicant_info: { ssn: string } };

/** Body for a CRS call about a loan, built from the persona whose SSN the loan carries, never from tape fields. */
export function bodyForLoan(product: Exclude<CrsProduct, "reverse_phone">, loan: LoanRef): Body {
  const ssn = digits(loan.applicant_info.ssn);
  const persona = file.personas.find((p) => p.ssn === ssn);
  if (!persona) throw new GuardRefused(`${loan.loan_id}: no sandbox persona for this loan`);
  const body = BUILD[product](persona);
  assertSandboxBody(product, body);
  return body;
}

/** Whether CRS can be asked about this loan at all: the sandbox has a file for it (a real deployment: every loan). */
export function canQuery(loan: LoanRef): boolean {
  const ssn = digits(loan.applicant_info.ssn);
  return file.personas.some((p) => p.ssn === ssn);
}

/** Body for a reverse lookup: only a persona's phone number is allowed. */
export function bodyForPhone(phone: string): Body {
  const persona = file.personas.find((p) => p.phone === digits(phone));
  if (!persona) throw new GuardRefused("reverse_phone: no sandbox persona has this phone number");
  const body = BUILD.reverse_phone(persona);
  assertSandboxBody("reverse_phone", body);
  return body;
}
