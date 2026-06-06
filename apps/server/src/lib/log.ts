/**
 * Minimal structured logging — one JSON line per event so journald/podman
 * logs stay grep- and jq-able. `event` is a stable machine key; put human
 * detail and context (userId, itemId, …) in fields.
 */

type Fields = Record<string, unknown>;

function line(level: "info" | "warn" | "error", event: string, fields: Fields): string {
  return JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields });
}

export function logInfo(event: string, fields: Fields = {}): void {
  console.log(line("info", event, fields));
}

export function logWarn(event: string, fields: Fields = {}): void {
  console.warn(line("warn", event, fields));
}

export function logError(event: string, fields: Fields = {}): void {
  const { error, ...rest } = fields;
  console.error(
    line("error", event, {
      ...rest,
      ...(error !== undefined
        ? { error: error instanceof Error ? error.message : String(error), stack: error instanceof Error ? error.stack : undefined }
        : {}),
    }),
  );
}
