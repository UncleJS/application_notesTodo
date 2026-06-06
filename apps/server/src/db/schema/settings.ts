import {
  boolean,
  datetime,
  int,
  mysqlEnum,
  mysqlTable,
  text,
  tinyint,
  varchar,
} from "drizzle-orm/mysql-core";

// Singleton row (id = 1). Secrets are AES-256-GCM encrypted with SECRETS_ENC_KEY.
export const settings = mysqlTable("settings", {
  id: tinyint("id", { unsigned: true }).primaryKey(),
  smtpHost: varchar("smtp_host", { length: 255 }),
  smtpPort: int("smtp_port"),
  smtpUser: varchar("smtp_user", { length: 255 }),
  smtpPassEnc: text("smtp_pass_enc"),
  smtpFrom: varchar("smtp_from", { length: 255 }),
  smtpTls: mysqlEnum("smtp_tls", ["none", "starttls", "tls"]).notNull().default("starttls"),
  webhookUrl: varchar("webhook_url", { length: 1024 }),
  webhookSecretEnc: text("webhook_secret_enc"),
  webhookEnabled: boolean("webhook_enabled").notNull().default(false),
  createdAtUTC: datetime("created_at_UTC", { mode: "string" }).notNull(),
  updatedAtUTC: datetime("updated_at_UTC", { mode: "string" }).notNull(),
});
