import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("BackofficeUserPasswordResetForm", () => {
  it("uses new-password inputs and supports a disabled trigger", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/backoffice/settings/users/BackofficeUserPasswordResetForm.tsx"),
      "utf8",
    );

    expect(source).toContain('name="newPassword"');
    expect(source).toContain('name="confirmPassword"');
    expect(source).toContain('autoComplete="new-password"');
    expect(source).toContain("disabled={disabled}");
  });
});
