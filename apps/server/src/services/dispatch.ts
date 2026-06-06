import { createHmac } from "node:crypto";
import nodemailer from "nodemailer";
import { getSmtpConfig, getWebhookConfig, type SmtpConfig } from "./appSettings";

export interface ReminderPayload {
  reminderId: number;
  itemId: number;
  itemType: string;
  title: string;
  occurrenceAtUTC: string;
  recipientUsername: string;
}

export function buildTransport(cfg: SmtpConfig) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.tls === "tls",
    requireTLS: cfg.tls === "starttls",
    ignoreTLS: cfg.tls === "none",
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass ?? "" } : undefined,
    connectionTimeout: 10_000,
  });
}

export async function sendReminderEmail(toEmail: string | null, payload: ReminderPayload): Promise<void> {
  const cfg = await getSmtpConfig();
  if (!cfg) throw new Error("SMTP is not configured in settings");
  if (!toEmail) throw new Error("recipient user has no email address");
  const transport = buildTransport(cfg);
  await transport.sendMail({
    from: cfg.from,
    to: toEmail,
    subject: `Reminder: ${payload.title}`,
    text: [
      `Reminder for ${payload.itemType}: ${payload.title}`,
      `Occurrence (UTC): ${payload.occurrenceAtUTC}`,
      "",
      "— NotesTodo",
    ].join("\n"),
  });
}

export async function sendReminderWebhook(payload: ReminderPayload): Promise<void> {
  const cfg = await getWebhookConfig();
  if (!cfg) throw new Error("webhook is not configured/enabled in settings");
  const body = JSON.stringify({ type: "reminder", ...payload });
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cfg.secret) {
    headers["x-notestodo-signature"] = createHmac("sha256", cfg.secret).update(body).digest("hex");
  }
  const res = await fetch(cfg.url, {
    method: "POST",
    headers,
    body,
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`webhook responded ${res.status}`);
}
