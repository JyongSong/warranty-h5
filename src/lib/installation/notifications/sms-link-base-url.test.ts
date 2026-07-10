import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSmsLinkBaseUrl } from "@/lib/installation/notifications/sms-link-base-url";

describe("getSmsLinkBaseUrl", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    delete process.env.NEXT_PUBLIC_BASE_URL;
  });

  it("uses NEXT_PUBLIC_BASE_URL for links embedded in SMS", () => {
    process.env.NEXT_PUBLIC_BASE_URL = " https://sms.example.com/ ";

    expect(getSmsLinkBaseUrl()).toBe("https://sms.example.com");
  });

  it("fails when SMS link base URL is not set in development", () => {
    vi.stubEnv("NODE_ENV", "development");
    process.env.NEXT_PUBLIC_BASE_URL = " ";

    expect(() => getSmsLinkBaseUrl()).toThrow("NEXT_PUBLIC_BASE_URL_MISSING");
  });

  it("fails when NEXT_PUBLIC_BASE_URL is not set in production", () => {
    vi.stubEnv("NODE_ENV", "production");
    process.env.NEXT_PUBLIC_BASE_URL = " ";

    expect(() => getSmsLinkBaseUrl()).toThrow("NEXT_PUBLIC_BASE_URL_MISSING");
  });
});
