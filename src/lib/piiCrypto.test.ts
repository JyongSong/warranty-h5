import { afterEach, describe, expect, it } from "vitest";
import {
  decryptNullablePii,
  decryptPii,
  encryptNullablePii,
  encryptPii,
  hmacPii,
  normalizeEmailForHash,
  normalizeNameForHash,
  normalizePhone11,
  phoneLast4Hash,
} from "@/lib/piiCrypto";

const originalKey = process.env.PII_ENCRYPTION_KEY;

afterEach(() => {
  process.env.PII_ENCRYPTION_KEY = originalKey;
});

describe("piiCrypto", () => {
  it("encrypts personal data with an authenticated envelope and decrypts it", () => {
    process.env.PII_ENCRYPTION_KEY = "test-pii-key";

    const encrypted = encryptPii("홍길동");

    expect(encrypted).toMatch(/^enc:v1:/);
    expect(encrypted).not.toContain("홍길동");
    expect(decryptPii(encrypted)).toBe("홍길동");
  });

  it("keeps null values null and accepts legacy plaintext reads", () => {
    process.env.PII_ENCRYPTION_KEY = "test-pii-key";

    expect(encryptNullablePii(null)).toBeNull();
    expect(decryptNullablePii(null)).toBeNull();
    expect(decryptPii("010-1234-5678")).toBe("010-1234-5678");
  });

  it("does not double-encrypt encrypted values", () => {
    process.env.PII_ENCRYPTION_KEY = "test-pii-key";

    const encrypted = encryptPii("서울 강남구 테헤란로 1");

    expect(encryptPii(encrypted)).toBe(encrypted);
  });

  it("builds stable HMAC hashes from normalized personal data", () => {
    process.env.PII_ENCRYPTION_KEY = "test-pii-key";

    expect(normalizeNameForHash(" 홍 길동 ")).toBe("홍길동");
    expect(normalizeEmailForHash(" USER@Example.COM ")).toBe("user@example.com");
    expect(normalizePhone11("010-1234-5678")).toBe("01012345678");
    expect(normalizePhone11("0503-1111-2222")).toBe("050311112222");

    expect(hmacPii("01012345678")).toBe(hmacPii("01012345678"));
    expect(hmacPii("01012345678")).not.toBe("01012345678");
    expect(phoneLast4Hash("01012345678")).toBe(hmacPii("5678"));
  });

  it("rejects phone values that are not supported SMS recipient numbers", () => {
    expect(() => normalizePhone11("02-123-4567")).toThrow("PHONE_11_DIGITS_REQUIRED");
    expect(() => normalizePhone11("010-1234-567")).toThrow("PHONE_11_DIGITS_REQUIRED");
  });
});
