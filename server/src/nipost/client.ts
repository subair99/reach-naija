// Server-side HTTP client for the NIPOST Postcode API.
// The secret key is only ever sent from here; nothing in web/ may call NIPOST with it.
import { config } from "../config.ts";
import { log } from "../lib/log.ts";
import { NipostError } from "./types.ts";

const MAX_RETRIES = 3;

export async function nipostRequest<T>(
  method: "GET" | "POST",
  path: string,
  opts: { query?: Record<string, string | number | undefined>; body?: unknown } = {},
): Promise<T> {
  const url = new URL(config.nipost.baseUrl + path);
  for (const [k, v] of Object.entries(opts.query ?? {})) {
    if (v !== undefined && v !== "") url.searchParams.set(k, String(v));
  }

  const headers: Record<string, string> = { Accept: "application/json" };
  if (config.nipost.secretKey) headers["X-API-Key"] = config.nipost.secretKey;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  for (let attempt = 0; ; attempt++) {
    const started = Date.now();
    const res = await fetch(url, {
      method,
      headers,
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(10_000),
    });
    log.info("nipost", {
      path, status: res.status, ms: Date.now() - started,
      remaining: res.headers.get("x-ratelimit-remaining") ?? undefined,
    });

    if (res.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(res.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, waitMs));
      continue;
    }

    const payload: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = payload?.error ?? {};
      throw new NipostError(res.status, err.code ?? `http_${res.status}`, err.message ?? res.statusText);
    }
    return (payload?.data ?? payload) as T;
  }
}
