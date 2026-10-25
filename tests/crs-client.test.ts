// Ticket 03: CRS client (login once, cache, errors), the crs_identity_check tool, and the acorn ledger around it.
// The sandbox is a fake that replays the codes verified live on 2026-10-24 (SKELETON §7). The last block hits the real sandbox
// and only runs with CRS_LIVE=1, so a plain `bun test` never logs in or bills anything.
import { describe, expect, spyOn, test } from "bun:test";
import { CrsError, CrsUnreachable, createCrsClient, crsIdentityCheck, GuardRefused, memoryCache, supabaseCache, type CrsClientOptions, type CrsRecovery } from "@/lib/crs";
import { IdentityResponseSchema } from "@/lib/crs/identity";
import { bodyForLoan } from "@/lib/crs/persona-guard";
import { Ledger, type Spend } from "@/lib/ledger";

const loan = (loan_id: string, ssn: string) => ({ loan_id, applicant_info: { ssn } });
const p13 = loan("L0037", "666701013");
const p12 = loan("L0036", "666701012");
const background = loan("L0500", "123456789");

// Codes verified live on 2026-10-24, by sandbox SSN.
const LIVE: Record<string, string[]> = {
  "666701001": [], "666701012": ["2201", "2202", "2101"], "666701013": ["2201", "2202", "2101"],
  "666701014": ["2301", "2101"], "666701015": [], "666701016": ["2401"],
};

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
// The SSN-issuance block and riskIndicator are in every sandbox response, clean personas included: they must never count.
const identityBody = (messages: unknown[]) => ({
  riskIndicator: "MEDIUM", indicative: {}, fileSummary: {}, originalInputs: {},
  addOnProducts: [{ idManagerVerification: { messages }, ssnIssuance: { issued: "ISSUED_AFTER_21", code: "2001", state: "KY" } }],
});
const messagesFor = (codes: string[]) => codes.map((code) => ({ code, text: `message ${code}` }));

type Box = ReturnType<typeof sandbox>;
function sandbox(opts: { login?: () => Response; identity?: (ssn: string) => Response } = {}) {
  const box = {
    logins: 0,
    identity: [] as { path: string; auth: string | null; body: Record<string, unknown> }[],
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/users/login")) {
        box.logins++;
        return opts.login ? opts.login() : json({ token: "tok-1" });
      }
      const body = JSON.parse(String(init?.body));
      box.identity.push({ path: new URL(url).pathname, auth: new Headers(init?.headers).get("Authorization"), body });
      return opts.identity
        ? opts.identity(body.ssn)
        : json(identityBody(messagesFor(LIVE[body.ssn] ?? [])), 200, { RequestID: `req-${box.identity.length}` });
    }) as typeof fetch,
  };
  return box;
}
const noSleep = async () => {}; // no test ever really waits out a Retry-After
const clientFor = (box: Box, extra: CrsClientOptions = {}) =>
  createCrsClient({ fetch: box.fetch, cache: memoryCache(), username: "user", password: "pass", sleep: noSleep, ...extra });
const identityCall = (client: ReturnType<typeof clientFor>, l = p13) => client.call("tu_identity", bodyForLoan("tu_identity", l), IdentityResponseSchema);
const ledgerWithLog = (limit = 60) => {
  const spends: Spend[] = [];
  return { spends, ledger: new Ledger(limit, (s) => void spends.push(s)) };
};

describe("login", () => {
  test("happens once, and the token is sent as a Bearer header", async () => {
    const box = sandbox();
    const client = clientFor(box);
    await identityCall(client, p13);
    await identityCall(client, p12);
    expect(box.logins).toBe(1);
    expect(box.identity.map((r) => r.auth)).toEqual(["Bearer tok-1", "Bearer tok-1"]);
  });
  test("parallel calls share the one login", async () => {
    const box = sandbox();
    const client = clientFor(box);
    await Promise.all([identityCall(client, p13), identityCall(client, p12)]);
    expect(box.logins).toBe(1);
  });
  test("a failed login is terminal: later calls fail without logging in again", async () => {
    const box = sandbox({ login: () => json({ message: "bad credentials" }, 401) });
    const client = clientFor(box);
    await expect(identityCall(client)).rejects.toThrow("CRS login failed (HTTP 401)");
    await expect(identityCall(client)).rejects.toThrow("CRS login failed (HTTP 401)");
    expect(box.logins).toBe(1);
    expect(box.identity).toHaveLength(0);
  });
  test("a login that never got an HTTP answer is not a failed login attempt, so the next call may try again", async () => {
    let attempts = 0;
    const box = sandbox({ login: () => { if (attempts++ === 0) throw new TypeError("fetch failed"); return json({ token: "tok-2" }); } });
    const client = clientFor(box);
    await expect(identityCall(client)).rejects.toBeInstanceOf(CrsUnreachable);
    expect((await identityCall(client)).request_id).toBe("req-1");
    expect(box.logins).toBe(2);
  });
  test("missing credentials stop before any request", async () => {
    const box = sandbox();
    const client = createCrsClient({ fetch: box.fetch, cache: memoryCache(), username: "", password: "" });
    await expect(identityCall(client)).rejects.toThrow("CRS_USERNAME and CRS_PASSWORD must be set");
    expect(box.logins).toBe(0);
  });
});

describe("the persona guard runs before anything is sent", () => {
  test("a body that is not a persona body is refused with no login and no request", async () => {
    const box = sandbox();
    const body = { ...bodyForLoan("tu_identity", p13), ssn: "123456789" };
    await expect(clientFor(box).call("tu_identity", body, IdentityResponseSchema)).rejects.toBeInstanceOf(GuardRefused);
    expect(box.logins).toBe(0);
    expect(box.identity).toHaveLength(0);
  });
  test("the guard product comes from the endpoint: an identity body is refused for a credit-report endpoint", async () => {
    const box = sandbox();
    const body = bodyForLoan("tu_identity", p13);
    await expect(clientFor(box).call("credit_tu", body, IdentityResponseSchema)).rejects.toBeInstanceOf(GuardRefused);
    expect(box.logins).toBe(0);
  });
});

describe("responses", () => {
  test("endpoints that share one body do not share a cache entry", async () => {
    const box = sandbox();
    const client = clientFor(box);
    const body = bodyForLoan("credit_report", p13);
    const tu = await client.call("credit_tu", body, IdentityResponseSchema); // stand-in schema: the sandbox fake answers every path alike
    const efx = await client.call("credit_efx", body, IdentityResponseSchema);
    const again = await client.call("credit_tu", body, IdentityResponseSchema);
    expect(box.identity.map((r) => r.path)).toEqual([
      "/api/transunion/credit-report/standard/tu-prequal-fico9",
      "/api/equifax/credit-report/standard/efx-prequal-vantage4",
    ]);
    expect([tu.request_id, efx.request_id, again.request_id]).toEqual(["req-1", "req-2", "req-1"]);
    expect(again.cached).toBe(true);
  });
  test("an identical request is answered from the cache with the original RequestID", async () => {
    const box = sandbox();
    const client = clientFor(box);
    const first = await identityCall(client);
    const second = await identityCall(client);
    expect(box.identity).toHaveLength(1);
    expect([first.cached, second.cached]).toEqual([false, true]);
    expect(second.request_id).toBe(first.request_id);
  });
  test("a response of the wrong shape is an error and is not cached", async () => {
    const box = sandbox({ identity: () => json({ nope: 1 }, 200, { RequestID: "req-x" }) });
    const client = clientFor(box);
    await expect(identityCall(client)).rejects.toThrow("did not match the expected shape");
    await expect(identityCall(client)).rejects.toThrow("did not match the expected shape");
    expect(box.identity).toHaveLength(2);
  });
  test("a response without a RequestID cannot be cited, so it is an error", async () => {
    const box = sandbox({ identity: () => json(identityBody([])) });
    await expect(identityCall(clientFor(box))).rejects.toThrow("no RequestID header");
  });
  test("5xx means unreachable, 429 and 4xx do not, and a 4xx names the CRS codes", async () => {
    const status = (code: number, body: unknown = {}) =>
      identityCall(clientFor(sandbox({ identity: () => json(body, code) }))).then(
        () => { throw new Error(`expected HTTP ${code} to fail`); },
        (e) => e as CrsError,
      );
    expect(await status(503)).toBeInstanceOf(CrsUnreachable);
    const limited = await status(429, { codes: ["CRS962"] });
    expect(limited).not.toBeInstanceOf(CrsUnreachable);
    expect(limited.status).toBe(429);
    expect((await status(400, { codes: ["CRS200"] })).message).toBe("CRS tu_identity failed (HTTP 400, CRS200)");
  });
});

describe("429 recovery", () => {
  const rateLimited = (retryAfter?: string) => json({ codes: ["CRS962"] }, 429, retryAfter === undefined ? {} : { "Retry-After": retryAfter });
  /** A sandbox that answers with the given responses in order, then with a good one. */
  const after = (...first: Response[]) => {
    let n = 0;
    return sandbox({ identity: (ssn) => first[n++] ?? json(identityBody(messagesFor(LIVE[ssn] ?? [])), 200, { RequestID: "req-ok" }) });
  };
  const watch = () => {
    const sleeps: number[] = [];
    const recoveries: CrsRecovery[] = [];
    const extra: CrsClientOptions = { sleep: async (ms) => void sleeps.push(ms), onRecovery: (info) => void recoveries.push(info) };
    return { sleeps, recoveries, extra };
  };

  test("waits the Retry-After seconds, tells the caller, and sends the same request again", async () => {
    const box = after(rateLimited("2"));
    const w = watch();
    const r = await identityCall(clientFor(box, w.extra));
    expect(r.request_id).toBe("req-ok");
    expect(w.sleeps).toEqual([2000]);
    expect(w.recoveries).toEqual([{ endpoint: "tu_identity", status: 429, wait_ms: 2000, attempt: 1 }]);
    expect(box.identity).toHaveLength(2);
    expect(box.identity[1]).toEqual(box.identity[0]); // same path, token and body
    expect(box.logins).toBe(1);
  });
  test.each([
    [undefined, 5000],
    ["0", 0],
    ["3", 3000],
    ["120", 30000],
    ["Wed, 21 Oct 2026 07:28:00 GMT", 5000],
  ] as [string | undefined, number][])("Retry-After %p waits %p ms", async (header, ms) => {
    const w = watch();
    await identityCall(clientFor(after(rateLimited(header)), w.extra));
    expect(w.sleeps).toEqual([ms]);
  });
  test("gives up after two retries with the 429 and its CRS code", async () => {
    const box = after(rateLimited("1"), rateLimited("1"), rateLimited("1"));
    const w = watch();
    const err = await identityCall(clientFor(box, w.extra)).then(
      () => { throw new Error("expected a 429"); },
      (e) => e as CrsError,
    );
    expect(err).not.toBeInstanceOf(CrsUnreachable);
    expect(err.status).toBe(429);
    expect(err.message).toBe("CRS tu_identity failed (HTTP 429, CRS962)");
    expect(box.identity).toHaveLength(3);
    expect(w.sleeps).toEqual([1000, 1000]);
    expect(w.recoveries.map((r) => r.attempt)).toEqual([1, 2]);
  });
  test("a 429 on login is terminal: no wait, no retry", async () => {
    const box = sandbox({ login: () => json({}, 429, { "Retry-After": "1" }) });
    const w = watch();
    await expect(identityCall(clientFor(box, w.extra))).rejects.toThrow("CRS login failed (HTTP 429)");
    expect(box.logins).toBe(1);
    expect(w.sleeps).toEqual([]);
    expect(w.recoveries).toEqual([]);
  });
  test("crs_identity_check: a recovered call is charged once, an exhausted one not at all", async () => {
    const recovered = ledgerWithLog();
    const ok = await crsIdentityCheck(p13, recovered.ledger, clientFor(after(rateLimited("1")), watch().extra));
    expect(ok.ok).toBe(true);
    expect(recovered.ledger.spent).toBe(3);
    expect(recovered.spends).toHaveLength(1);
    const exhausted = ledgerWithLog();
    const failed = await crsIdentityCheck(p13, exhausted.ledger, clientFor(after(rateLimited(), rateLimited(), rateLimited()), watch().extra));
    expect(failed.error).toBe("CRS tu_identity failed (HTTP 429, CRS962)");
    expect(exhausted.ledger.spent).toBe(0);
  });
});

describe("crs_cache over Supabase", () => {
  const url = "https://example.supabase.co";
  test("a hit returns the stored RequestID and response", async () => {
    const seen: string[] = [];
    const http = (async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push(`${String(input)} ${new Headers(init?.headers).get("apikey")}`);
      return json([{ request_id: "req-9", response: { a: 1 } }]);
    }) as typeof fetch;
    expect(await supabaseCache(url, "service-key", http).get("abc")).toEqual({ request_id: "req-9", body: { a: 1 } });
    expect(seen).toEqual([`${url}/rest/v1/crs_cache?cache_key=eq.abc&select=request_id,response service-key`]);
  });
  test("a miss is undefined", async () => {
    expect(await supabaseCache(url, "k", (async () => json([])) as unknown as typeof fetch).get("abc")).toBeUndefined();
  });
  test("a set upserts one row", async () => {
    let sent: { url: string; body: unknown; prefer: string | null } | undefined;
    const http = (async (input: RequestInfo | URL, init?: RequestInit) => {
      sent = { url: String(input), body: JSON.parse(String(init?.body)), prefer: new Headers(init?.headers).get("Prefer") };
      return new Response(null, { status: 201 });
    }) as typeof fetch;
    await supabaseCache(url, "k", http).set("abc", "tu_identity", { request_id: "req-9", body: { a: 1 } });
    expect(sent).toEqual({
      url: `${url}/rest/v1/crs_cache?on_conflict=cache_key`,
      body: { cache_key: "abc", endpoint: "tu_identity", request_id: "req-9", response: { a: 1 } },
      prefer: "resolution=merge-duplicates,return=minimal",
    });
  });
  test("a broken cache is a miss and a skipped write, never an error", async () => {
    const warn = spyOn(console, "warn").mockImplementation(() => {});
    const cache = supabaseCache(url, "k", (async () => json({}, 500)) as unknown as typeof fetch);
    expect(await cache.get("abc")).toBeUndefined();
    await cache.set("abc", "tu_identity", { request_id: "r", body: {} });
    expect(warn).toHaveBeenCalledTimes(2);
    warn.mockRestore();
  });
});

describe("crs_identity_check", () => {
  test("loan #37 (P13) comes back with 2201, 2202 and 2101, cited to its RequestID, for 3 acorns", async () => {
    const { ledger, spends } = ledgerWithLog();
    const r = await crsIdentityCheck(p13, ledger, clientFor(sandbox()));
    expect(r.ok).toBe(true);
    expect(r.simulated).toBe(false);
    expect(r.result).toMatchObject({ loan_id: "L0037", verified: false });
    expect(r.result?.messages.map((m) => m.code)).toEqual(["2201", "2202", "2101"]);
    expect(r.sources).toEqual([{ kind: "crs", product: "tu_identity", request_id: "req-1" }]);
    expect(r.cost).toEqual({ acorns: 3, unit: "1 CRS call" });
    expect(ledger.spent).toBe(3);
    expect(spends).toHaveLength(1); // the budget_spent event
    expect(spends[0].sources).toEqual(r.sources);
  });
  test.each([
    ["P12", "666701012", ["2201", "2202", "2101"]],
    ["P14", "666701014", ["2301", "2101"]],
    ["P16", "666701016", ["2401"]],
    ["P01", "666701001", []],
    ["P15", "666701015", []],
  ])("%s gets the codes verified live", async (_persona, ssn, codes) => {
    const r = await crsIdentityCheck(loan("L1", ssn), new Ledger(), clientFor(sandbox()));
    expect(r.result?.messages.map((m) => m.code)).toEqual(codes);
    expect(r.result?.verified).toBe(codes.length === 0);
  });
  test("a code that arrives as a number is read as text", async () => {
    const box = sandbox({ identity: () => json(identityBody([{ code: 2201 }]), 200, { RequestID: "req-n" }) });
    const r = await crsIdentityCheck(p13, new Ledger(), clientFor(box));
    expect(r.result?.messages).toEqual([{ code: "2201" }]);
  });
  test("a response without a verification block is an error, not a clean file", async () => {
    for (const addOnProducts of [[], [{}]]) {
      const box = sandbox({ identity: () => json({ addOnProducts }, 200, { RequestID: "req-e" }) });
      const { ledger } = ledgerWithLog();
      const r = await crsIdentityCheck(p13, ledger, clientFor(box));
      expect(r.ok).toBe(false);
      expect(r.error).toBe("CRS response had no idManagerVerification block");
      expect(ledger.spent).toBe(0);
    }
  });

  describe("refusals send nothing and cost nothing", () => {
    test("a background loan", async () => {
      const box = sandbox();
      const { ledger, spends } = ledgerWithLog();
      const r = await crsIdentityCheck(background, ledger, clientFor(box));
      expect(r.ok).toBe(false);
      expect(r.error).toBe("refused, nothing sent: L0500: no sandbox persona for this loan");
      expect(box.logins).toBe(0);
      expect(box.identity).toHaveLength(0);
      expect(ledger.spent).toBe(0);
      expect(spends).toHaveLength(0);
    });
    test("a check over budget", async () => {
      const box = sandbox();
      const ledger = new Ledger(2);
      const r = await crsIdentityCheck(p13, ledger, clientFor(box));
      expect(r.ok).toBe(false);
      expect(r.error).toBe("over budget: crs_identity_check costs 3 acorns, 2 of 2 left");
      expect(box.logins).toBe(0);
      expect(ledger.spent).toBe(0);
    });
    test("a CRS error is not charged", async () => {
      const { ledger, spends } = ledgerWithLog();
      const r = await crsIdentityCheck(p13, ledger, clientFor(sandbox({ identity: () => json({ codes: ["CRS111"] }, 401) })));
      expect(r.error).toBe("CRS tu_identity failed (HTTP 401, CRS111)");
      expect(ledger.spent).toBe(0);
      expect(spends).toHaveLength(0);
    });
  });

  test("a repeated check is answered from the cache, cites the same RequestID, and is still charged", async () => {
    const box = sandbox();
    const ledger = new Ledger();
    const client = clientFor(box);
    const a = await crsIdentityCheck(p13, ledger, client);
    const b = await crsIdentityCheck(p13, ledger, client);
    expect(box.identity).toHaveLength(1);
    expect(b.sources).toEqual(a.sources);
    expect(ledger.spent).toBe(6);
  });

  describe("sandbox unreachable", () => {
    const down = () => createCrsClient({ fetch: (async () => { throw new TypeError("fetch failed"); }) as unknown as typeof fetch, cache: memoryCache(), username: "u", password: "p" });
    test("a loan with a live-verified answer gets a recorded one, flagged simulated everywhere", async () => {
      const { ledger, spends } = ledgerWithLog();
      const r = await crsIdentityCheck(p13, ledger, down());
      expect(r.ok).toBe(true);
      expect(r.simulated).toBe(true);
      expect(r.result?.messages.map((m) => m.code)).toEqual(["2201", "2202", "2101"]);
      expect(r.sources).toEqual([{ kind: "lookup", name: "crs_identity_recorded", key: "L0037", simulated: true }]);
      expect(spends[0].simulated).toBe(true);
    });
    test("a loan that was never verified live is an error, not an invented answer", async () => {
      const { ledger } = ledgerWithLog();
      const r = await crsIdentityCheck(loan("L5", "666701005"), ledger, down());
      expect(r.ok).toBe(false);
      expect(r.error).toContain("no recorded answer for this loan");
      expect(ledger.spent).toBe(0);
    });
    test("bad credentials are not 'unreachable': no simulated answer hides them", async () => {
      const client = clientFor(sandbox({ login: () => json({}, 401) }));
      const r = await crsIdentityCheck(p13, new Ledger(), client);
      expect(r.ok).toBe(false);
      expect(r.simulated).toBe(false);
    });
  });
});

// Real sandbox: `CRS_LIVE=1 bun test tests/crs-client.test.ts`. Logs in once; results are cached by CRS, so repeats are free.
describe.skipIf(process.env.CRS_LIVE !== "1")("live sandbox", () => {
  const client = createCrsClient({ cache: memoryCache() });
  test.each(Object.entries(LIVE))("SSN %s returns the verified codes", async (ssn, codes) => {
    const r = await crsIdentityCheck(loan("LLIVE", ssn), new Ledger(), client);
    expect(r.error).toBeUndefined();
    expect(r.simulated).toBe(false);
    expect(r.result?.messages.map((m) => m.code).sort()).toEqual([...codes].sort());
    expect(r.sources[0]).toMatchObject({ kind: "crs", product: "tu_identity" });
  });
});
