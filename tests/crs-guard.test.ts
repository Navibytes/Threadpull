// Ticket 03: the persona guard builds CRS bodies only from data/personas.json and refuses everything else.
import { describe, expect, test } from "bun:test";
import { assertSandboxBody, bodyForLoan, bodyForPhone, GuardRefused } from "@/lib/crs/persona-guard";

const p13 = { loan_id: "L0037", applicant_info: { ssn: "666701013" } };
const background = { loan_id: "L0500", applicant_info: { ssn: "123456789" } };

// P13 bodies exactly as the CRS sandbox test data (get_test_data) lists them.
const IDENTITY = {
  firstName: "KAYLA", lastName: "BRENNAN", ssn: "666701013", dob: "1999-12-24",
  street1: "9021 KINGSTON PIKE", city: "KNOXVILLE", state: "TN", zip: "37923",
};
const CREDIT = {
  firstName: "KAYLA", lastName: "BRENNAN", ssn: "666701013",
  addresses: [{ addressLine1: "9021 KINGSTON PIKE", city: "KNOXVILLE", state: "TN", postalCode: "37923", borrowerResidencyType: "Current" }],
};
const FRAUD = {
  firstName: "KAYLA", lastName: "BRENNAN", phoneNumber: "5550101013", email: "kb.9921x@example.com", ipAddress: "198.51.100.13",
  address: { addressLine1: "9021 KINGSTON PIKE", city: "KNOXVILLE", state: "TN", postalCode: "37923" },
};

describe("bodies come from the persona, matched by SSN", () => {
  test("a case loan gets the persona's exact bodies", () => {
    expect(bodyForLoan("tu_identity", p13)).toEqual(IDENTITY);
    expect(bodyForLoan("credit_report", p13)).toEqual(CREDIT);
    expect(bodyForLoan("fraud_finder", p13)).toEqual(FRAUD);
  });
  test("an SSN written with dashes still matches", () => {
    expect(bodyForLoan("tu_identity", { ...p13, applicant_info: { ssn: "666-70-1013" } })).toEqual(IDENTITY);
  });
  test("a loan without a persona SSN is refused for every product", () => {
    for (const product of ["tu_identity", "credit_report", "fraud_finder"] as const)
      expect(() => bodyForLoan(product, background)).toThrow(GuardRefused);
  });
  test("the refusal does not echo the SSN", () => {
    expect(() => bodyForLoan("tu_identity", background)).toThrow("L0500: no sandbox persona for this loan");
  });
});

describe("reverse lookup", () => {
  test("a persona's phone, in any format, builds the body", () => {
    expect(bodyForPhone("5550101013")).toEqual({ phoneNumber: "5550101013" });
    expect(bodyForPhone("(555) 010-1013")).toEqual({ phoneNumber: "5550101013" });
  });
  test("any other phone is refused", () => {
    expect(() => bodyForPhone("2085551234")).toThrow(GuardRefused);
  });
});

describe("assertSandboxBody", () => {
  test("accepts an exact persona body, whatever the key order", () => {
    expect(() => assertSandboxBody("tu_identity", IDENTITY)).not.toThrow();
    expect(() => assertSandboxBody("tu_identity", Object.fromEntries(Object.entries(IDENTITY).reverse()))).not.toThrow();
  });
  test("refuses a changed, extra or missing field", () => {
    expect(() => assertSandboxBody("tu_identity", { ...IDENTITY, dob: "1990-01-01" })).toThrow(GuardRefused);
    expect(() => assertSandboxBody("tu_identity", { ...IDENTITY, phone: "5550101013" })).toThrow(GuardRefused);
    const { zip: _zip, ...missing } = IDENTITY;
    expect(() => assertSandboxBody("tu_identity", missing)).toThrow(GuardRefused);
  });
  test("a body is only valid for its own product", () => {
    expect(() => assertSandboxBody("credit_report", IDENTITY)).toThrow(GuardRefused);
  });
  test("refuses real-looking identities", () => {
    expect(() => assertSandboxBody("tu_identity", { ...IDENTITY, firstName: "JANE", lastName: "DOE", ssn: "123456789" })).toThrow(GuardRefused);
  });
});
