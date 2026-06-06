/**
 * Parse a route param as a positive integer ID.
 * Returns null for anything else (NaN, 0, negatives, floats, empty).
 */
export function parseId(raw: unknown): number | null {
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0 || n > Number.MAX_SAFE_INTEGER) return null;
  return n;
}

/** Thrown by idParam(); the global error handler maps it to a 404 response. */
export class IdParamError extends Error {
  constructor() {
    super("not found");
  }
}

/** Parse a route param as a positive integer ID, throwing IdParamError (→ 404) otherwise. */
export function idParam(raw: unknown): number {
  const n = parseId(raw);
  if (n === null) throw new IdParamError();
  return n;
}
