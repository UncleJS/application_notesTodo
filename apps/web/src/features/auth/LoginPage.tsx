import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError, clearSessionToken, setSessionToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Me } from "./useMe";

export default function LoginPage() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const qc = useQueryClient();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    clearSessionToken();
    try {
      const login = await api<Me & { token: string }>("/api/v1/auth/login", {
        method: "POST",
        json: { username, password },
      });
      // Round-trip the session before entering the app. Preferred: the
      // httpOnly cookie. If the browser blocked it (privacy settings or
      // extensions — seen on plain-HTTP LAN-IP origins), fall back to the
      // bearer token transparently.
      let me: Me;
      try {
        me = await api<Me>("/api/v1/auth/me");
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 401)) throw err;
        setSessionToken(login.token);
        me = await api<Me>("/api/v1/auth/me"); // now via Authorization header
      }
      qc.setQueryData(["me"], me);
      navigate("/");
    } catch (err) {
      clearSessionToken();
      if (err instanceof ApiError && err.status === 401 && err.message === "unauthorized") {
        setError(
          "Login succeeded but no session could be established (cookie blocked and token fallback failed). " +
            "Check browser privacy settings or extensions.",
        );
      } else {
        setError(err instanceof ApiError ? err.message : "login failed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle className="text-xl">NotesTodo</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoFocus
                autoComplete="username"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
            <Button type="submit" disabled={busy || !username || !password}>
              {busy ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
