// Credit report facts (ticket 06). Pure functions: one bureau's raw CRS Standard Format JSON in, plain facts out.
// Nothing here decides a status or a score of suspicion: it reports what each bureau returned and where they disagree.
import { z } from "zod";

export const BUREAUS = ["transunion", "equifax", "experian"] as const;
export type Bureau = (typeof BUREAUS)[number];

// Only the fields we read; everything is optional because error responses are HTTP 200 with a different body.
const Rows = <T extends z.ZodType>(row: T) => z.array(row).nullish();
export const CreditResponseSchema = z
  .object({
    errorMessages: Rows(z.object({ creditErrorMessageCode: z.string().nullish(), creditErrorMessageText: z.string().nullish() }).loose()),
    creditFiles: Rows(
      z
        .object({
          creditFileDetail: z.object({ creditFileInfileDate: z.string().nullish(), creditFileResultStatusType: z.string().nullish() }).loose().nullish(),
          addresses: Rows(z.object({ addressLine1: z.string().nullish(), postalCode: z.string().nullish() }).loose()),
        })
        .loose(),
    ),
    tradelines: Rows(z.object({ accountOwnershipType: z.string().nullish(), derogatoryDataIndicator: z.boolean().nullish() }).loose()),
    inquiries: Rows(z.object({ inquiryDate: z.string().nullish() }).loose()),
    publicRecords: Rows(z.object({}).loose()),
    scores: Rows(z.object({ scoreValue: z.union([z.string(), z.number()]).nullish(), noScoreReasonType: z.string().nullish() }).loose()),
    responseDetail: z.object({ dateOrdered: z.string().nullish() }).loose().nullish(),
  })
  .loose();
export type CreditResponse = z.infer<typeof CreditResponseSchema>;

/** How a bureau answered. `error` covers anything we cannot read as a file or a plain no-hit, so it is never taken for a clean file. */
export type BureauStatus = "file_returned" | "no_file" | "frozen" | "deceased" | "error";

export type BureauView = {
  bureau: Bureau;
  status: BureauStatus;
  score: number | null;
  no_score_reason: string | null;
  file_open_date: string | null;
  addresses: string[]; // "street|zip", for counting distinct addresses across bureaus
  tradelines: number;
  authorized_user_tradelines: number;
  derogatory: number; // tradelines flagged derogatory plus public records
  inquiries_60d: number;
  errors: string[];
};

const STATUS_BY_RESULT: Record<string, BureauStatus> = {
  FileReturned: "file_returned",
  NoFileReturnedNoHit: "no_file",
  NoFileReturnedCreditFreeze: "frozen",
};

const day = (s?: string | null) => {
  const t = s ? Date.parse(s) : NaN;
  return Number.isNaN(t) ? null : t;
};
const DAY_MS = 86_400_000;

/** One bureau's response, read for facts. `asOf` is the date the report was pulled; inquiries are counted back from it. */
export function bureauView(bureau: Bureau, raw: CreditResponse, asOf: number): BureauView {
  const errors = (raw.errorMessages ?? []).map((e) => [e.creditErrorMessageCode, e.creditErrorMessageText].filter(Boolean).join(" "));
  const file = raw.creditFiles?.[0];
  const result = file?.creditFileDetail?.creditFileResultStatusType;
  let status: BureauStatus = result ? (STATUS_BY_RESULT[result] ?? "error") : "error";
  if (errors.some((e) => /deceas/i.test(e))) status = "deceased";
  else if (errors.length && status === "file_returned") status = "error";

  const tradelines = raw.tradelines ?? [];
  // Number(null) and Number("") are 0, so an absent score must be skipped before converting.
  const score = raw.scores?.flatMap((s) => (s.scoreValue == null || s.scoreValue === "" ? [] : [Number(s.scoreValue)])).find((n) => Number.isFinite(n)) ?? null;
  const inquiries = (raw.inquiries ?? []).filter((q) => {
    const t = day(q.inquiryDate);
    return t !== null && t <= asOf && asOf - t <= 60 * DAY_MS;
  });
  return {
    bureau,
    status,
    score,
    no_score_reason: raw.scores?.find((s) => s.noScoreReasonType)?.noScoreReasonType ?? null,
    file_open_date: file?.creditFileDetail?.creditFileInfileDate ?? null,
    addresses: (file?.addresses ?? []).map((a) => `${a.addressLine1 ?? ""}|${(a.postalCode ?? "").slice(0, 5)}`),
    tradelines: tradelines.length,
    authorized_user_tradelines: tradelines.filter((t) => t.accountOwnershipType === "AuthorizedUser").length,
    derogatory: tradelines.filter((t) => t.derogatoryDataIndicator).length + (raw.publicRecords?.length ?? 0),
    inquiries_60d: inquiries.length,
    errors,
  };
}

export type CreditFeatures = {
  file_age_months: number | null; // oldest bureau file, from its infile date
  borrower_age_years: number | null;
  addresses_on_file: number; // distinct across bureaus
  tradeline_depth: number; // most tradelines any one bureau shows
  authorized_user_share: number | null; // authorized-user tradelines / all tradelines, over the bureaus that returned a file
  inquiries_60d: number; // most any one bureau shows
};

export type CreditSummary = {
  bureaus: BureauView[];
  partial: boolean; // a bureau could not be read (frozen or error): the picture is incomplete
  divergent: boolean; // bureaus that answered disagree on whether a file exists, or on whether anything derogatory is on it
  no_file_anywhere: boolean;
  deceased: boolean;
  features: CreditFeatures;
};

/** Merge the three bureau views. Rules are generic: nothing here knows which test person it is looking at. */
export function mergeBureaus(bureaus: BureauView[], opts: { asOf: number; dateOfBirth?: string | null }): CreditSummary {
  const answered = bureaus.filter((b) => b.status === "file_returned" || b.status === "no_file");
  const files = bureaus.filter((b) => b.status === "file_returned");
  const filePresenceDiffers = files.length > 0 && files.length < answered.length;
  const derogatoryDiffers = files.length > 1 && files.some((b) => b.derogatory > 0) && files.some((b) => b.derogatory === 0);

  const opened = files.map((b) => day(b.file_open_date)).filter((t): t is number => t !== null);
  const dob = day(opts.dateOfBirth);
  const tradelines = files.reduce((n, b) => n + b.tradelines, 0);
  const authorizedUser = files.reduce((n, b) => n + b.authorized_user_tradelines, 0);

  return {
    bureaus,
    partial: bureaus.some((b) => b.status === "frozen" || b.status === "error"),
    divergent: filePresenceDiffers || derogatoryDiffers,
    no_file_anywhere: bureaus.length > 0 && bureaus.every((b) => b.status === "no_file"),
    deceased: bureaus.some((b) => b.status === "deceased"),
    features: {
      file_age_months: opened.length ? Math.round((opts.asOf - Math.min(...opened)) / (DAY_MS * 30.4375)) : null,
      borrower_age_years: dob === null ? null : Math.floor((opts.asOf - dob) / (DAY_MS * 365.25)),
      addresses_on_file: new Set(files.flatMap((b) => b.addresses)).size,
      tradeline_depth: Math.max(0, ...files.map((b) => b.tradelines)),
      authorized_user_share: tradelines ? authorizedUser / tradelines : null,
      inquiries_60d: Math.max(0, ...files.map((b) => b.inquiries_60d)),
    },
  };
}
