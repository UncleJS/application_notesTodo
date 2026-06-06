import { IdParamError } from "./params";
import { logError } from "./log";

type ErrorCtx = { code: unknown; error: unknown; set: { status?: number | string }; request?: Request };

/**
 * Shared global error handler — used by the app in index.ts and by route tests,
 * so thrown errors (validation, IdParamError) map identically in both.
 */
export function onAppError({ code, error, set, request }: ErrorCtx) {
  if (code === "VALIDATION") {
    set.status = 422;
    return { error: "validation failed" };
  }
  if (code === "NOT_FOUND" || error instanceof IdParamError) {
    set.status = 404;
    return { error: "not found" };
  }
  logError("request.unhandled", {
    method: request?.method,
    path: request ? new URL(request.url).pathname : undefined,
    error,
  });
  set.status = 500;
  return { error: "internal error" };
}
