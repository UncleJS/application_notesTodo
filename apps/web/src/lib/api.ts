export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Called on any 401 outside the login flow — wired up in main.tsx to clear
 * the cached user and bounce to /login, so a dead/missing session can never
 * strand the user inside a half-working app.
 */
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler;
}

/**
 * Bearer-token fallback for browsers whose privacy settings/extensions block
 * the session cookie (observed on plain-HTTP LAN-IP origins). The token is
 * the same server-side session id the cookie would carry; LoginPage stores it
 * only after detecting that the cookie round-trip failed.
 */
const TOKEN_KEY = "notestodo.sessionToken";
export function setSessionToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearSessionToken() {
  localStorage.removeItem(TOKEN_KEY);
}
function sessionToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export async function api<T>(
  path: string,
  init?: Omit<RequestInit, "body"> & { json?: unknown },
): Promise<T> {
  const { json, ...rest } = init ?? {};
  const token = sessionToken();
  const res = await fetch(path, {
    ...rest,
    headers: {
      ...(json !== undefined ? { "content-type": "application/json" } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(rest.headers as Record<string, string> | undefined),
    },
    body: json !== undefined ? JSON.stringify(json) : undefined,
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      msg = ((await res.json()) as { error?: string }).error ?? msg;
    } catch {
      /* non-JSON error body */
    }
    if (res.status === 401 && !path.startsWith("/api/v1/auth/")) {
      onUnauthorized?.();
    }
    throw new ApiError(res.status, msg);
  }
  return res.json() as Promise<T>;
}
