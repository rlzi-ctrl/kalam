// Server-side: retry a request that was rate limited (HTTP 429), e.g. Azure Speech F0's one-request-at-a-time limit.

export type RetryOptions = {
  /** Extra attempts after the first (default 3). */
  retries?: number;
  /** First backoff when the response has no Retry-After header (doubles each time). */
  baseDelayMs?: number;
  /** Never wait longer than this for one retry. */
  maxDelayMs?: number;
  /** Test hook. */
  sleep?: (ms: number) => Promise<void>;
  /** Called before each retry (for logging). */
  onRetry?: (attempt: number, waitMs: number) => void;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Seconds or an HTTP date, as Retry-After allows; undefined if absent or unreadable. */
export function retryAfterMs(header: string | null, now = Date.now()): number | undefined {
  if (!header) return undefined;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(header);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/** fetch(), retried on 429 with Retry-After or exponential backoff. Other statuses are returned as-is. */
export async function fetchWithRetry(url: string, init: RequestInit, opts: RetryOptions = {}): Promise<Response> {
  const { retries = 3, baseDelayMs = 1000, maxDelayMs = 8000, sleep = defaultSleep, onRetry } = opts;
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt >= retries) return res;
    const wait = Math.min(maxDelayMs, retryAfterMs(res.headers.get("retry-after")) ?? baseDelayMs * 2 ** attempt);
    await res.body?.cancel().catch(() => {});
    onRetry?.(attempt + 1, wait);
    await sleep(wait);
  }
}
