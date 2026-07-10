import { describe, expect, it } from "vitest";
import { buildBackofficeNextPath } from "./route";

describe("buildBackofficeNextPath", () => {
  it("returns the backoffice path when there are no query parameters", () => {
    expect(buildBackofficeNextPath("/backoffice")).toBe("/backoffice");
  });

  it("preserves the current page query parameters for login return", () => {
    expect(
      buildBackofficeNextPath("/backoffice/installations", {
        view: "assignment-requests",
        status: "SMS_FAILED",
        q: "ORD-100",
      }),
    ).toBe("/backoffice/installations?view=assignment-requests&status=SMS_FAILED&q=ORD-100");
  });

  it("preserves repeated query parameters", () => {
    expect(
      buildBackofficeNextPath("/backoffice/installations", {
        issue: ["INSTALLER_NOT_ASSIGNED", "SMS_FAILED"],
      }),
    ).toBe("/backoffice/installations?issue=INSTALLER_NOT_ASSIGNED&issue=SMS_FAILED");
  });
});
