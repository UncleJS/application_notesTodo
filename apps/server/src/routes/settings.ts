import { Elysia, t } from "elysia";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { settings } from "../db/schema/settings";
import { requireAdmin } from "../middleware/auth";
import { encryptSecret } from "../lib/secrets";
import { nowUtcSql } from "../lib/time";
import { buildTransport } from "../services/dispatch";
import { getSmtpConfig, getWebhookConfig, loadSettingsRow } from "../services/appSettings";

// Secrets are write-only: PUT accepts them, GET only reports presence.

export const settingsRoutes = new Elysia({ prefix: "/api/v1/settings" })
  .use(requireAdmin)
  .get("/smtp", async () => {
    const row = await loadSettingsRow();
    return {
      host: row.smtpHost,
      port: row.smtpPort,
      user: row.smtpUser,
      from: row.smtpFrom,
      tls: row.smtpTls,
      hasPassword: !!row.smtpPassEnc,
    };
  })
  .put(
    "/smtp",
    async ({ body }) => {
      await db
        .update(settings)
        .set({
          smtpHost: body.host,
          smtpPort: body.port,
          smtpUser: body.user ?? null,
          smtpFrom: body.from,
          smtpTls: body.tls,
          // undefined = keep existing, null/"" = clear, string = replace
          ...(body.password !== undefined
            ? { smtpPassEnc: body.password ? encryptSecret(body.password) : null }
            : {}),
          updatedAtUTC: nowUtcSql(),
        })
        .where(eq(settings.id, 1));
      return { ok: true };
    },
    {
      body: t.Object({
        host: t.Nullable(t.String({ maxLength: 255 })),
        port: t.Nullable(t.Number()),
        user: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
        password: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
        from: t.Nullable(t.String({ maxLength: 255 })),
        tls: t.Union([t.Literal("none"), t.Literal("starttls"), t.Literal("tls")]),
      }),
    },
  )
  .post(
    "/smtp/test",
    async ({ user, body, set }) => {
      const cfg = await getSmtpConfig();
      if (!cfg) {
        set.status = 422;
        return { error: "SMTP is not configured — save host, port and from first" };
      }
      const to = body.to || user!.email;
      if (!to) {
        set.status = 422;
        return { error: "no recipient — provide 'to' or set your account email" };
      }
      try {
        await buildTransport(cfg).sendMail({
          from: cfg.from,
          to,
          subject: "NotesTodo SMTP test",
          text: "SMTP is configured correctly. — NotesTodo",
        });
        return { ok: true, to };
      } catch (err) {
        set.status = 502;
        return { error: err instanceof Error ? err.message : "send failed" };
      }
    },
    { body: t.Object({ to: t.Optional(t.String({ maxLength: 255 })) }) },
  )
  .get("/webhook", async () => {
    const row = await loadSettingsRow();
    return {
      url: row.webhookUrl,
      enabled: row.webhookEnabled,
      hasSecret: !!row.webhookSecretEnc,
    };
  })
  .put(
    "/webhook",
    async ({ body }) => {
      await db
        .update(settings)
        .set({
          webhookUrl: body.url,
          webhookEnabled: body.enabled,
          ...(body.secret !== undefined
            ? { webhookSecretEnc: body.secret ? encryptSecret(body.secret) : null }
            : {}),
          updatedAtUTC: nowUtcSql(),
        })
        .where(eq(settings.id, 1));
      return { ok: true };
    },
    {
      body: t.Object({
        url: t.Nullable(t.String({ maxLength: 1024 })),
        enabled: t.Boolean(),
        secret: t.Optional(t.Nullable(t.String({ maxLength: 255 }))),
      }),
    },
  )
  .post("/webhook/test", async ({ set }) => {
    const cfg = await getWebhookConfig();
    if (!cfg) {
      set.status = 422;
      return { error: "webhook is not configured/enabled" };
    }
    const payload = JSON.stringify({ type: "test", message: "NotesTodo webhook test" });
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (cfg.secret) {
      headers["x-notestodo-signature"] = createHmac("sha256", cfg.secret).update(payload).digest("hex");
    }
    try {
      const res = await fetch(cfg.url, {
        method: "POST",
        headers,
        body: payload,
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        set.status = 502;
        return { error: `webhook responded ${res.status}` };
      }
      return { ok: true };
    } catch (err) {
      set.status = 502;
      return { error: err instanceof Error ? err.message : "request failed" };
    }
  });
