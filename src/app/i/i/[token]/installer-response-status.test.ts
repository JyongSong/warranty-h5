import { describe, expect, it } from "vitest";
import {
  INSTALLER_RESPONSE_UNAVAILABLE_STATUS,
  getInitialInstallerResponseStatus,
  isInstallerResponseUnavailableError,
  isInstallerResponseUnavailableStatus,
} from "./installer-response-status";

describe("INSTALLER_RESPONSE_UNAVAILABLE_STATUS", () => {
  it("keeps the current explanation and adds customer center guidance in one line", () => {
    expect(INSTALLER_RESPONSE_UNAVAILABLE_STATUS.description).toEqual([
      "응답 링크를 다시 확인해 주세요. 이미 응답한 경우 추가 입력은 필요하지 않습니다. 응답 내용을 변경해야 하는 경우 고객센터로 문의해 주세요.",
    ]);
  });
});

describe("getInitialInstallerResponseStatus", () => {
  it("keeps a valid installer assignment in the response step", () => {
    expect(
      getInitialInstallerResponseStatus({
        tokenStatus: "VALID",
      }),
    ).toBe("pending");
  });

  it("groups reloaded accepted and rejected assignments as unavailable", () => {
    expect(
      getInitialInstallerResponseStatus({
        tokenStatus: "RESPONDED",
      }),
    ).toBe("completed");

    expect(
      getInitialInstallerResponseStatus({
        tokenStatus: "RESPONDED",
      }),
    ).toBe("completed");
  });

  it("groups expired, cancelled, responded, and missing states as unavailable", () => {
    for (const status of [
      getInitialInstallerResponseStatus({ tokenStatus: "EXPIRED" }),
      getInitialInstallerResponseStatus({ tokenStatus: "CANCELLED" }),
      getInitialInstallerResponseStatus({ tokenStatus: "RESPONDED" }),
      getInitialInstallerResponseStatus({ tokenStatus: null }),
    ]) {
      expect(isInstallerResponseUnavailableStatus(status)).toBe(true);
    }
  });
});

describe("isInstallerResponseUnavailableError", () => {
  it("groups procedural response states separately from system errors", () => {
    expect(isInstallerResponseUnavailableError("TOKEN_NOT_FOUND")).toBe(true);
    expect(isInstallerResponseUnavailableError("TOKEN_EXPIRED")).toBe(true);
    expect(isInstallerResponseUnavailableError("ALREADY_RESPONDED")).toBe(true);
    expect(isInstallerResponseUnavailableError("ASSIGNMENT_NOT_WAITING_INSTALLER_RESPONSE")).toBe(true);
    expect(isInstallerResponseUnavailableError("INSTALLER_RESPONSE_FAILED")).toBe(false);
  });
});
