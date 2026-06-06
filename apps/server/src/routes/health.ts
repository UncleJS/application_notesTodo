import { Elysia } from "elysia";
import { pingDb } from "../db/client";

export const health = new Elysia().get("/api/v1/health", async () => ({
  status: "ok" as const,
  db: (await pingDb()) ? ("ok" as const) : ("down" as const),
  time_UTC: new Date().toISOString(),
}));
