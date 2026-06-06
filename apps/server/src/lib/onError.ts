import { IdParamError } from "./params";

type ErrorCtx = { code: unknown; error: unknown; set: { status?: number | string } };

/**
 * Shared global error handler — used by the app in index.ts and by route tests,
 * so thrown errors (validation, IdParamError) map identically in both.
 */
export function onAppError({ code, error, set }: ErrorCtx) {
  if (code === "VALIDATION") {
    set.status = 422;
    return { error: "validation failed" };
  }
  if (code === "NOT_FOUND" || error instanceof IdParamError) {
    set.status = 404;
    return { error: "not found" };
  }
  console.error(error);
  set.status = 500;
  return { error: "internal error" };
}
