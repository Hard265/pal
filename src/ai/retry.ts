import { log } from "../logger";

export interface RetryOptions {
  maxAttempts?: number;   // default 4
  baseDelayMs?: number;   // default 2000 — used when no retryDelay in response
  maxDelayMs?: number;    // default 120_000 (2 min)
}

/**
 * Parse the `retryDelay` field from a Gemini 429 error body.
 * The API returns it as e.g. "14s" or "14.061884831s".
 * Returns milliseconds, or null if unparseable.
 */
export function parseRetryDelay(err: unknown): number | null {
  try {
    // The SDK wraps the raw response — walk the error to find retryDelay
    const raw = JSON.stringify(err);
    const match = raw.match(/"retryDelay"\s*:\s*"([\d.]+)s"/);
    if (match) return Math.ceil(parseFloat(match[1]) * 1000);
  } catch {
    // ignore
  }
  return null;
}

function is429(err: unknown): boolean {
  const raw = JSON.stringify(err);
  return (
    raw.includes("RESOURCE_EXHAUSTED") ||
    raw.includes('"code":429') ||
    raw.includes('"code": 429')
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((res) => setTimeout(res, ms) as unknown);
}

/**
 * Wrap an async call with 429-aware retry logic.
 * On RESOURCE_EXHAUSTED: honours the API's `retryDelay` if present,
 * otherwise uses exponential backoff with jitter.
 */
export async function withRetry<T>(
  label: string,
  fn: () => Promise<T>,
  opts: RetryOptions = {}
): Promise<T> {
  const { maxAttempts = 4, baseDelayMs = 2_000, maxDelayMs = 120_000 } = opts;

  let attempt = 0;

  while (true) {
    attempt++;
    try {
      return await fn();
    } catch (err) {
      if (!is429(err) || attempt >= maxAttempts) throw err;

      // Prefer the API-supplied delay, fall back to exponential backoff + jitter
      const apiDelay = parseRetryDelay(err);
      const backoff = Math.min(baseDelayMs * 2 ** (attempt - 1), maxDelayMs);
      const jitter = Math.random() * 1_000;
      const delayMs = apiDelay !== null ? apiDelay + 500 : backoff + jitter;

      log.info(
        `[retry] ${label} — 429 rate limit (attempt ${attempt}/${maxAttempts}). ` +
        `Waiting ${(delayMs / 1000).toFixed(1)}s${apiDelay !== null ? " (API hint)" : " (backoff)"}...`
      );

      await sleep(delayMs);
    }
  }
}
