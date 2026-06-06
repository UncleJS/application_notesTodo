/**
 * In-memory fixed-window rate limiter for login brute-force protection.
 * Keyed per username (works behind any proxy and in tests — no IP needed
 * for a small local-first app). Failed attempts count; success resets.
 */

const WINDOW_MS = 15 * 60_000;
const MAX_FAILURES = 10;

interface Window {
  count: number;
  startedAt: number;
}

const windows = new Map<string, Window>();

function windowFor(key: string, now: number): Window {
  const w = windows.get(key);
  if (!w || now - w.startedAt >= WINDOW_MS) {
    const fresh = { count: 0, startedAt: now };
    windows.set(key, fresh);
    return fresh;
  }
  return w;
}

/** True when the key has exhausted its failure budget for this window. */
export function isRateLimited(key: string, now = Date.now()): boolean {
  return windowFor(key.toLowerCase(), now).count >= MAX_FAILURES;
}

export function recordFailure(key: string, now = Date.now()): void {
  windowFor(key.toLowerCase(), now).count++;
}

export function recordSuccess(key: string): void {
  windows.delete(key.toLowerCase());
}

/** Test hook. */
export function resetRateLimits(): void {
  windows.clear();
}

// Hourly sweep so abandoned keys don't accumulate forever.
setInterval(() => {
  const now = Date.now();
  for (const [k, w] of windows) {
    if (now - w.startedAt >= WINDOW_MS) windows.delete(k);
  }
}, 3600_000).unref?.();
