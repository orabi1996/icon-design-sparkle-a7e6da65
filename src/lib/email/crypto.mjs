import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;
const SALT = "hrms-email-secret-salt-2026";

function getMasterKey() {
  const secret = process.env["EMAIL_CONFIG_ENCRYPTION_KEY"];
  if (!secret || typeof secret !== "string" || secret.trim().length === 0) {
    throw new Error(
      "Missing required environment secret: EMAIL_CONFIG_ENCRYPTION_KEY. Encryption failed securely.",
    );
  }
  return scryptSync(secret, SALT, 32);
}

/**
 * Encrypt a secret string using AES-256-GCM.
 * Formatted as: `enc:v1:<iv-hex>:<tag-hex>:<ciphertext-hex>`
 */
export function encryptSecret(plaintext) {
  if (!plaintext || typeof plaintext !== "string") return "";
  const key = getMasterKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const tag = cipher.getAuthTag();
  return `enc:v1:${iv.toString("hex")}:${tag.toString("hex")}:${encrypted}`;
}

/**
 * Decrypt a secret string that was encrypted with `encryptSecret`.
 * If it's not encrypted (e.g. legacy plain text), returns as-is.
 */
export function decryptSecret(ciphertext) {
  if (!ciphertext || typeof ciphertext !== "string") return "";
  if (!ciphertext.startsWith("enc:v1:")) {
    return ciphertext; // plain text fallback
  }

  try {
    const parts = ciphertext.split(":");
    if (parts.length !== 5) return "";
    const iv = Buffer.from(parts[2], "hex");
    const tag = Buffer.from(parts[3], "hex");
    const encrypted = parts[4];

    const key = getMasterKey();
    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(encrypted, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
  } catch (error) {
    console.error("[EmailCrypto] Decryption failed:", error);
    return "";
  }
}

/**
 * Mask a secret string for display in UI (e.g. `••••••••`).
 */
export function maskSecret(secret) {
  if (!secret || typeof secret !== "string") return "";
  return "••••••••";
}

/**
 * Check whether a string is already encrypted.
 */
export function isEncrypted(value) {
  if (!value || typeof value !== "string") return false;
  return value.startsWith("enc:v1:");
}
