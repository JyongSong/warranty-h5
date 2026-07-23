import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("./actions", () => ({
  signInBackofficeAction: vi.fn(),
}));

import { getSafeBackofficeNextPath } from "./BackofficeAuthClient";

describe("getSafeBackofficeNextPath", () => {
  it("falls back to the installation board for missing or unsafe next paths", () => {
    expect(getSafeBackofficeNextPath(null)).toBe("/backoffice/installations");
    expect(getSafeBackofficeNextPath("")).toBe("/backoffice/installations");
    expect(getSafeBackofficeNextPath("/auth")).toBe("/backoffice/installations");
    expect(getSafeBackofficeNextPath("https://example.com/backoffice")).toBe(
      "/backoffice/installations",
    );
  });

  it("does not redirect back to a login page after login", () => {
    expect(getSafeBackofficeNextPath("/login")).toBe("/backoffice/installations");
    expect(getSafeBackofficeNextPath("/login?redirect_url=%2Fbackoffice")).toBe(
      "/backoffice/installations",
    );
    expect(getSafeBackofficeNextPath("/backoffice/auth")).toBe("/backoffice/installations");
    expect(getSafeBackofficeNextPath("/backoffice/auth?next=%2Fbackoffice%2Fauth")).toBe(
      "/backoffice/installations",
    );
  });

  it("keeps safe backoffice destinations", () => {
    expect(getSafeBackofficeNextPath("/backoffice")).toBe("/backoffice");
    expect(getSafeBackofficeNextPath("/backoffice/installations")).toBe(
      "/backoffice/installations",
    );
    expect(getSafeBackofficeNextPath("/backoffice/installations?view=assignment-requests")).toBe(
      "/backoffice/installations?view=assignment-requests",
    );
  });
});

describe("BackofficeAuthClient navigation", () => {
  it("reads redirect_url as the login return parameter", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "app", "login", "BackofficeAuthClient.tsx"),
      "utf8",
    );

    expect(source).toContain('searchParams.get("redirect_url")');
    expect(source).not.toContain('searchParams.get("next")');
  });

  it("uses a single full document navigation after the session cookie is set", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "app", "login", "BackofficeAuthClient.tsx"),
      "utf8",
    );

    expect(source).toContain("window.location.assign(nextPath)");
    expect(source).not.toContain("router.refresh()");
  });

  it("uses the backoffice login server action", () => {
    const source = readFileSync(
      join(process.cwd(), "src", "app", "login", "BackofficeAuthClient.tsx"),
      "utf8",
    );

    expect(source).toContain("signInBackofficeAction(email, password)");
    expect(source).not.toContain("/api/login/password");
  });
});
