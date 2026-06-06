import { eq } from "drizzle-orm";
import { db } from "../db/client";
import { settings } from "../db/schema/settings";
import { decryptSecret } from "../lib/secrets";

export interface SmtpConfig {
  host: string;
  port: number;
  user: string | null;
  pass: string | null;
  from: string;
  tls: "none" | "starttls" | "tls";
}

export interface WebhookConfig {
  url: string;
  secret: string | null;
}

export async function loadSettingsRow() {
  const row = (await db.select().from(settings).where(eq(settings.id, 1)))[0];
  if (!row) throw new Error("settings row missing — run migrations");
  return row;
}

/** Decrypted SMTP config, or null when not configured. */
export async function getSmtpConfig(): Promise<SmtpConfig | null> {
  const row = await loadSettingsRow();
  if (!row.smtpHost || !row.smtpPort || !row.smtpFrom) return null;
  return {
    host: row.smtpHost,
    port: row.smtpPort,
    user: row.smtpUser,
    pass: row.smtpPassEnc ? decryptSecret(row.smtpPassEnc) : null,
    from: row.smtpFrom,
    tls: row.smtpTls,
  };
}

/** Decrypted webhook config, or null when disabled/not configured. */
export async function getWebhookConfig(): Promise<WebhookConfig | null> {
  const row = await loadSettingsRow();
  if (!row.webhookEnabled || !row.webhookUrl) return null;
  return {
    url: row.webhookUrl,
    secret: row.webhookSecretEnc ? decryptSecret(row.webhookSecretEnc) : null,
  };
}
