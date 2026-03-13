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
    // 1. Direct object inspection (robust)
    const e = err as any;
    const details = e?.details || e?.error?.details;
    if (Array.isArray(details)) {
      const info = details.find(
        (d: any) => d["@type"]?.includes("RetryInfo") || d.retryDelay
      );
      if (info?.retryDelay) {
        const match = String(info.retryDelay).match(/^([\d.]+)s$/);
        if (match) return Math.ceil(parseFloat(match[1]) * 1000);
      }
    }

    // 2. String fallback (fails for some Errors, but good for raw responses)
    const raw = JSON.stringify(err);
    const match = raw.match(/"retryDelay"\s*:\s*"([\d.]+)s"/);
    if (match) return Math.ceil(parseFloat(match[1]) * 1000);
  } catch {
    // ignore
  }
  return null;
}

export function is429(err: unknown): boolean {
  if (!err) return false;

  // 1. Check numeric status codes (common in SDK errors)
  const e = err as any;
  const status = e.status || e.code || e.error?.code || e.error?.status;
  if (status === 429 || status === "429" || status === "RESOURCE_EXHAUSTED") {
    return true;
  }

  // 2. Check message and name
  const msg = (e.message || "").toUpperCase();
  const name = (e.name || "").toUpperCase();
  if (
    msg.includes("RESOURCE_EXHAUSTED") ||
    msg.includes("429") ||
    name.includes("RESOURCE_EXHAUSTED")
  ) {
    return true;
  }

  // 3. String fallback (least reliable but covers raw JSON)
  try {
    const raw = JSON.stringify(err);
    return (
      raw.includes("RESOURCE_EXHAUSTED") ||
      raw.includes('"code":429') ||
      raw.includes('"code": 429')
    );
  } catch {
    return false;
  }
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
  const { maxAttempts = 10, baseDelayMs = 2_000, maxDelayMs = 300_000 } = opts;

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
      // If we have an API delay, we wait exactly that (plus a small buffer)
      const delayMs = apiDelay !== null ? apiDelay + 1000 : backoff + jitter;

      log.info(
        `[retry] ${label} — 429 rate limit (attempt ${attempt}/${maxAttempts}). ` +
        `Waiting ${(delayMs / 1000).toFixed(1)}s${apiDelay !== null ? " (API hint)" : " (backoff)"}...`
      );

      await sleep(delayMs);
    }
  }
}
