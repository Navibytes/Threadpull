// CRS sandbox client (ticket 03). Server-only: reads CRS_USERNAME / CRS_PASSWORD, never imported by components.
// Login happens once per process and its outcome is kept: a failed login is never retried, it disables the shared account.
import { z } from "zod";
import { cacheKey, defaultCache, type CrsCache } from "./cache";
import { assertSandboxBody, type CrsProduct } from "./persona-guard";

export const CRS_BASE_URL = "https://api-sandbox.stitchcredit.com/api";
// Endpoint name -> path, and the persona-guard product that builds its body. A credit report is three endpoints that share one
// body, so the cache and the path are keyed by endpoint, never by guard product. Only tu_identity has a tool so far (ticket 06
// adds the rest and checks their paths live).
const ENDPOINTS = {
  tu_identity: { path: "/transunion/identity-manager-verification/basic", guard: "tu_identity" },
  credit_tu: { path: "/transunion/credit-report/standard/tu-prequal-fico9", guard: "credit_report" },
  credit_efx: { path: "/equifax/credit-report/standard/efx-prequal-vantage4", guard: "credit_report" },
  credit_exp: { path: "/experian/credit-report/standard/exp-prequal-vantage4", guard: "credit_report" },
  fraud_finder: { path: "/fraud-finder/fraud-finder", guard: "fraud_finder" },
  reverse_phone: { path: "/accurate-append/reverse", guard: "reverse_phone" },
} as const satisfies Record<string, { path: string; guard: CrsProduct }>;
export type CrsEndpoint = keyof typeof ENDPOINTS;
const TIMEOUT_MS = 15_000;
const MAX_429_RETRIES = 2;
const DEFAULT_RETRY_AFTER_S = 5;
const MAX_RETRY_AFTER_S = 30;
const JSON_HEADERS = { "Content-Type": "application/json", Accept: "application/json" };
const LoginSchema = z.object({ token: z.string().min(1) });

export class CrsError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
  }
}
/** No usable answer from the sandbox (network failure, timeout or 5xx): the only case where a flagged simulated response is allowed. */
export class CrsUnreachable extends CrsError {}

/** A rate-limited call that is about to wait and retry: the Hazel loop turns this into a `recovery` event row. */
export type CrsRecovery = { endpoint: CrsEndpoint; status: 429; wait_ms: number; attempt: number };
export type CrsClientOptions = {
  fetch?: typeof fetch; cache?: CrsCache; username?: string; password?: string; baseUrl?: string;
  onRecovery?: (info: CrsRecovery) => void | Promise<void>; // called before each wait
  sleep?: (ms: number) => Promise<void>; // tests pass a fake so nothing really waits
};
export type CrsCall<T> = { request_id: string; body: T; cached: boolean };
export type CrsClient = ReturnType<typeof createCrsClient>;

/** Retry-After in milliseconds. Seconds only (an HTTP date counts as missing), 5s when missing, capped at 30s. */
const retryAfterMs = (res: Response) => {
  const raw = res.headers.get("Retry-After")?.trim();
  const seconds = raw ? Number(raw) : NaN;
  return Math.min(Number.isFinite(seconds) && seconds >= 0 ? seconds : DEFAULT_RETRY_AFTER_S, MAX_RETRY_AFTER_S) * 1000;
};

export function createCrsClient(opts: CrsClientOptions = {}) {
  const http = opts.fetch ?? globalThis.fetch;
  const baseUrl = opts.baseUrl ?? CRS_BASE_URL;
  const cache = opts.cache ?? defaultCache();
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));

  async function send(path: string, init: RequestInit): Promise<Response> {
    try {
      return await http(`${baseUrl}${path}`, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
    } catch (e) {
      throw new CrsUnreachable(`CRS sandbox unreachable: ${e instanceof Error ? e.message : e}`);
    }
  }

  async function doLogin(): Promise<string> {
    const username = opts.username ?? process.env.CRS_USERNAME;
    const password = opts.password ?? process.env.CRS_PASSWORD;
    if (!username || !password) throw new CrsError("CRS_USERNAME and CRS_PASSWORD must be set in .env.local");
    const res = await send("/users/login", { method: "POST", headers: JSON_HEADERS, body: JSON.stringify({ username, password }) });
    if (!res.ok) throw new CrsError(`CRS login failed (HTTP ${res.status}); not retried, fix the credentials and restart`, res.status);
    const parsed = LoginSchema.safeParse(await res.json().catch(() => null));
    if (!parsed.success) throw new CrsError("CRS login response carried no token");
    return parsed.data.token;
  }

  // One login promise per client, shared by parallel calls. shortcut: the token is never refreshed (expiry is undocumented), restart on a 401.
  let token: Promise<string> | undefined;
  const login = () =>
    (token ??= doLogin().catch((e) => {
      if (e instanceof CrsUnreachable) token = undefined; // no HTTP response came back, so no login attempt was counted: the next call may try again
      throw e;
    }));

  /** POST one persona body to a CRS endpoint and validate the response with `schema`. Throws CrsError / CrsUnreachable / GuardRefused. */
  async function call<S extends z.ZodType>(endpoint: CrsEndpoint, body: unknown, schema: S): Promise<CrsCall<z.infer<S>>> {
    assertSandboxBody(ENDPOINTS[endpoint].guard, body); // nothing but a sandbox persona body gets past here: before the cache, before login, before fetch
    const key = cacheKey(endpoint, body);
    const hit = await cache.get(key);
    if (hit) {
      const cached = schema.safeParse(hit.body);
      if (cached.success) return { request_id: hit.request_id, body: cached.data, cached: true };
    }
    const { path } = ENDPOINTS[endpoint];
    const init = { method: "POST", headers: { ...JSON_HEADERS, Authorization: `Bearer ${await login()}` }, body: JSON.stringify(body) };
    let res = await send(path, init);
    // 429: wait out Retry-After and send the same request again, at most twice; the login call never gets here, so a login 429 stays terminal.
    for (let attempt = 1; res.status === 429 && attempt <= MAX_429_RETRIES; attempt++) {
      const wait_ms = retryAfterMs(res);
      await opts.onRecovery?.({ endpoint, status: 429, wait_ms, attempt });
      await sleep(wait_ms);
      res = await send(path, init);
    }
    if (res.status >= 500) throw new CrsUnreachable(`CRS sandbox error (HTTP ${res.status})`);
    if (!res.ok) {
      const codes = ((await res.json().catch(() => null)) as { codes?: unknown } | null)?.codes;
      throw new CrsError(`CRS ${endpoint} failed (HTTP ${res.status}${Array.isArray(codes) ? `, ${codes.join(" ")}` : ""})`, res.status);
    }
    const request_id = res.headers.get("RequestID");
    if (!request_id) throw new CrsError(`CRS ${endpoint} response carried no RequestID header`);
    // Success is decided by `schema`, not by the status: a credit report answers HTTP 200 with errorMessages for no file / frozen / deceased.
    const raw = await res.json().catch(() => null);
    const parsed = schema.safeParse(raw);
    if (!parsed.success) throw new CrsError(`CRS ${endpoint} response did not match the expected shape`);
    await cache.set(key, endpoint, { request_id, body: raw });
    return { request_id, body: parsed.data, cached: false };
  }

  return { call };
}

let shared: CrsClient | undefined;
/** The process-wide client, so the login really happens once per process. */
export const defaultCrsClient = () => (shared ??= createCrsClient());
