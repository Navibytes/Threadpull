// Ticket 14: the never-claim list as code. A person is never a fraudster or innocent; a score is never a probability of fraud.
import { describe, expect, test } from "bun:test";
import { breaksWording } from "@/lib/deal/wording";

describe("wording a model must not use", () => {
  test.each([
    "The borrower on L0037 is a fraudster.",
    "These fraudsters share one phone.",
    "L0190 is innocent of any link.",
    "The innocent borrowers were cleared.",
    "Fraud is proven for the ring.",
    "This is proof of fraud.",
    "The priority score gives a 90% chance of fraud.",
    "The probability that the loan is fraud follows from its score.",
    "Its rank is the likelihood of fraud.",
  ])("%s", (text) => expect(breaksWording(text)).toBe(true));

  test.each([
    "The run found two shared identifiers and no longer treats the address as a reason to suspect.",
    "L0037 scored 660 with a credit bureau, which puts it in the 5.0% default tier (assumed).",
    "The price assumes a probability of default by credit-score tier.",
    "A fraud alert on file means the lender must take extra steps to verify the applicant.",
    "The rank put L0037 first, so Hazel looked there first.",
    "Hazel held L0445 out of the bid until a person answers.",
  ])("%s", (text) => expect(breaksWording(text)).toBe(false));
});
