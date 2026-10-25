// CRS sandbox access (ticket 03). Import from "@/lib/crs", not from the files inside. Server-only.
export { CRS_BASE_URL, CrsError, CrsUnreachable, createCrsClient, defaultCrsClient, type CrsCall, type CrsClient, type CrsClientOptions, type CrsEndpoint, type CrsRecovery } from "./client";
export { memoryCache, supabaseCache, type CrsCache } from "./cache";
export { crsIdentityCheck, type IdentityCheck, type IdentityMessage } from "./identity";
export { creditEventFacts, crsCreditReport, type CreditReport } from "./credit-report";
export { crsFraudFinder, type FraudFinder } from "./fraud-finder";
export { crsReversePhone, type ReversePhone, type ReversePhoneRecord } from "./reverse-phone";
export { canQuery, GuardRefused } from "./persona-guard";
