// CRS response cache (ticket 03): an identical request is answered from `crs_cache`, so repeated demo runs don't re-hit the sandbox.
// Server-only: the Supabase service-role key never reaches the browser. Without Supabase env it falls back to memory.
import { createHash } from "node:crypto";

export type CachedResponse = { request_id: string; body: unknown };
export type CrsCache = {
  get(key: string): Promise<CachedResponse | undefined>;
  set(key: string, endpoint: string, value: CachedResponse): Promise<void>;
};

/** Bodies come from the persona guard with a fixed key order, so the endpoint plus the JSON text identifies the request. */
export const cacheKey = (endpoint: string, body: unknown) => createHash("sha256").update(`${endpoint}:${JSON.stringify(body)}`).digest("hex");

export function memoryCache(): CrsCache {
  const rows = new Map<string, CachedResponse>();
  return { get: async (key) => rows.get(key), set: async (key, _endpoint, value) => void rows.set(key, value) };
}

/** `crs_cache` over Supabase's REST API (shortcut: no client library yet; swap for lib/db/server when it lands). A cache failure is a miss, never an error. */
export function supabaseCache(url: string, serviceKey: string, http: typeof fetch = fetch): CrsCache {
  const table = `${url.replace(/\/$/, "")}/rest/v1/crs_cache`;
  const auth = { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
  return {
    async get(key) {
      try {
        const res = await http(`${table}?cache_key=eq.${key}&select=request_id,response`, { headers: auth });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const [row] = (await res.json()) as { request_id: string; response: unknown }[];
        return row && { request_id: row.request_id, body: row.response };
      } catch (e) {
        console.warn(`crs_cache read failed, treated as a miss: ${e}`);
      }
    },
    async set(key, endpoint, value) {
      try {
        const res = await http(`${table}?on_conflict=cache_key`, {
          method: "POST",
          headers: { ...auth, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
          body: JSON.stringify({ cache_key: key, endpoint, request_id: value.request_id, response: value.body }),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
      } catch (e) {
        console.warn(`crs_cache write failed, response not cached: ${e}`);
      }
    },
  };
}

export function defaultCache(env: Record<string, string | undefined> = process.env): CrsCache {
  return env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY ? supabaseCache(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY) : memoryCache();
}
