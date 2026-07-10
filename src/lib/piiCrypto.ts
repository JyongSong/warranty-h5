import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from "crypto";

const ENCRYPTION_PREFIX = "enc:v1:";
const IV_BYTES = 12;
const TAG_BYTES = 16;

export function encryptPii(value: string) {
  if (!value || isEncryptedPii(value)) return value;

  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv("aes-256-gcm", getEncryptionKey(), iv, {
    authTagLength: TAG_BYTES,
  });
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return [
    ENCRYPTION_PREFIX.slice(0, -1),
    iv.toString("base64url"),
    tag.toString("base64url"),
    ciphertext.toString("base64url"),
  ].join(":");
}

export function encryptNullablePii(value: string | null | undefined) {
  return value == null ? null : encryptPii(value);
}

export function decryptPii(value: string) {
  if (!isEncryptedPii(value)) return value;

  const [, , ivValue, tagValue, ciphertextValue] = value.split(":");
  if (!ivValue || !tagValue || !ciphertextValue) {
    throw new Error("INVALID_ENCRYPTED_PII");
  }

  const decipher = createDecipheriv(
    "aes-256-gcm",
    getEncryptionKey(),
    Buffer.from(ivValue, "base64url"),
    { authTagLength: TAG_BYTES },
  );
  decipher.setAuthTag(Buffer.from(tagValue, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertextValue, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

export function decryptNullablePii(value: string | null | undefined) {
  return value == null ? null : decryptPii(value);
}

export function isEncryptedPii(value: string | null | undefined) {
  return typeof value === "string" && value.startsWith(ENCRYPTION_PREFIX);
}

export function isPiiEncryptionConfigured() {
  return Boolean(process.env.PII_ENCRYPTION_KEY?.trim());
}

export function isPiiHashConfigured() {
  return Boolean(process.env.PII_HASH_KEY?.trim() || process.env.PII_ENCRYPTION_KEY?.trim());
}

export function hmacPii(value: string) {
  const normalized = value.trim();
  if (!normalized) return "";

  return createHmac("sha256", getHashKey()).update(normalized).digest("hex");
}

export function normalizeNameForHash(value: string) {
  return value.replace(/\s+/g, "").trim();
}

export function normalizeEmailForHash(value: string) {
  return value.trim().toLowerCase();
}

export function normalizePhone11(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!/^01\d{9}$/.test(digits) && !/^050\d{8,9}$/.test(digits)) {
    throw new Error("PHONE_11_DIGITS_REQUIRED");
  }

  return digits;
}

export function phoneLast4Hash(normalizedPhone: string) {
  if (!/^\d{11}$/.test(normalizedPhone)) {
    throw new Error("PHONE_11_DIGITS_REQUIRED");
  }

  return hmacPii(normalizedPhone.slice(-4));
}

function getEncryptionKey() {
  const secret = process.env.PII_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("PII_ENCRYPTION_KEY_MISSING");
  }

  return createHash("sha256").update(secret).digest();
}

function getHashKey() {
  const secret = process.env.PII_HASH_KEY ?? process.env.PII_ENCRYPTION_KEY;
  if (!secret) {
    throw new Error("PII_HASH_KEY_MISSING");
  }

  return secret;
}
