import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("DeleteBackofficeUserForm", () => {
  it("submits the target user id", () => {
    const source = readFileSync(
      join(process.cwd(), "src/app/backoffice/settings/users/DeleteBackofficeUserForm.tsx"),
      "utf8",
    );

    expect(source).toContain('name="id" value={userId}');
    expect(source).toContain('title="유저 삭제"');
    expect(source).toContain('tone="danger"');
    expect(source).not.toContain("window.confirm");
  });
});
