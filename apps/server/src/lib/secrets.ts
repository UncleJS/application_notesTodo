import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/** AES-256-GCM at-rest encryption for settings secrets (SMTP password, webhook secret). */

function key(): Buffer {
  const hex = process.env.SECRETS_ENC_KEY;
  if (!hex || hex.length !== 64) {
    throw new Error("SECRETS_ENC_KEY must be 64 hex chars (32 bytes)");
  }
  return Buffer.from(hex, "hex");
}

export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}.${ct.toString("base64")}.${tag.toString("base64")}`;
}

export function decryptSecret(enc: string): string {
  const [ivB64, ctB64, tagB64] = enc.split(".");
  if (!ivB64 || !ctB64 || !tagB64) throw new Error("malformed encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString("utf8");
}
