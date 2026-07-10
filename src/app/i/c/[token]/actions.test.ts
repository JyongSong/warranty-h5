import { beforeEach, describe, expect, it, vi } from "vitest";
import { submitCustomerRequestAction } from "@/app/i/c/[token]/actions";
import {
  InstallationCustomerRequestError,
  submitInstallationCustomerRequest,
} from "@/lib/installation/customer/request";
import { getInstallationCustomerRequestErrorMessage } from "@/lib/installation/customer/error-message";

vi.mock("@/lib/installation/customer/request", () => {
  class MockInstallationCustomerRequestError extends Error {
    constructor(message: string) {
      super(message);
      this.name = "InstallationCustomerRequestError";
    }
  }

  return {
    InstallationCustomerRequestError: MockInstallationCustomerRequestError,
    submitInstallationCustomerRequest: vi.fn(),
  };
});

vi.mock("@/lib/installation/customer/error-message", () => {
  const errorMessages: Record<string, string> = {
    ALREADY_SUBMITTED: "이미 설치 요청 정보가 접수되었습니다.",
    MISSING_TOKEN: "링크 토큰이 없습니다. 문자로 받은 링크를 다시 열어 주세요.",
    TOKEN_EXPIRED: "입력 링크가 만료되었습니다. 고객센터 안내를 기다려 주세요.",
  };

  return {
    getInstallationCustomerRequestErrorMessage: vi.fn(
      (error: string) => errorMessages[error] ?? error,
    ),
  };
});

const submitInstallationCustomerRequestMock = vi.mocked(submitInstallationCustomerRequest);
const getInstallationCustomerRequestErrorMessageMock = vi.mocked(
  getInstallationCustomerRequestErrorMessage,
);

describe("submitCustomerRequestAction", () => {
  beforeEach(() => {
    submitInstallationCustomerRequestMock.mockReset();
    getInstallationCustomerRequestErrorMessageMock.mockClear();
  });

  it("passes customer submit fields to the service", async () => {
    submitInstallationCustomerRequestMock.mockResolvedValue({
      id: "request-1",
      installationOrderId: "order-1",
      status: "SUBMITTED",
    } as never);

    const result = await submitCustomerRequestAction({
      token: " raw-token ",
      installAddress: "서울 강남구 봉은사로 10",
      installDate: "2026-06-20",
      customerPhone: "010-9999-0000",
      customerNote: "오후 희망",
    });

    expect(result).toEqual({
      ok: true,
      installationId: "order-1",
      status: "READY_FOR_CANDIDATE_SELECTION",
    });
    expect(submitInstallationCustomerRequestMock).toHaveBeenCalledWith("raw-token", {
      installAddress: "서울 강남구 봉은사로 10",
      installDate: "2026-06-20",
      customerPhone: "010-9999-0000",
      customerNote: "오후 희망",
    });
  });

  it("passes the selected base address without the postcode to the existing customer request contract", async () => {
    submitInstallationCustomerRequestMock.mockResolvedValue({
      id: "request-1",
      installationOrderId: "order-1",
      status: "SUBMITTED",
    } as never);

    const result = await submitCustomerRequestAction({
      token: "raw-token",
      zonecode: "06164",
      address: "서울특별시 강남구 테헤란로 521",
      addressDetail: "12층 1201호",
      installDate: "2026-06-20",
      installTimeSlot: "오후 12:00 - 15:00",
      customerPhone: "010-9999-0000",
      customerNote: "공동현관 호출",
    });

    expect(result.ok).toBe(true);
    expect(submitInstallationCustomerRequestMock).toHaveBeenCalledWith("raw-token", {
      installAddress: "서울특별시 강남구 테헤란로 521",
      installAddressDetail: "12층 1201호",
      installDate: "2026-06-20",
      installTimeSlot: "오후 12:00 - 15:00",
      customerPhone: "010-9999-0000",
      customerNote: "공동현관 호출",
    });
  });

  it("returns a customer-friendly message when the token is missing", async () => {
    const result = await submitCustomerRequestAction({
      token: "",
      installAddress: "서울 강남구 봉은사로 10",
      installDate: "2026-06-20",
      customerPhone: "010-9999-0000",
    });

    expect(result).toEqual({
      ok: false,
      error: "MISSING_TOKEN",
      message: "링크 토큰이 없습니다. 문자로 받은 링크를 다시 열어 주세요.",
    });
    expect(submitInstallationCustomerRequestMock).not.toHaveBeenCalled();
  });

  it("returns a customer-friendly message when the token is expired", async () => {
    submitInstallationCustomerRequestMock.mockRejectedValue(
      new InstallationCustomerRequestError("TOKEN_EXPIRED"),
    );

    const result = await submitCustomerRequestAction({
      token: "raw-token",
      installAddress: "서울 강남구 봉은사로 10",
      installDate: "2026-06-20",
      customerPhone: "010-9999-0000",
    });

    expect(result).toEqual({
      ok: false,
      error: "TOKEN_EXPIRED",
      message: "입력 링크가 만료되었습니다. 고객센터 안내를 기다려 주세요.",
    });
  });

  it("returns a customer-friendly message when the request was already submitted", async () => {
    submitInstallationCustomerRequestMock.mockRejectedValue(
      new InstallationCustomerRequestError("ALREADY_SUBMITTED"),
    );

    const result = await submitCustomerRequestAction({
      token: "raw-token",
      installAddress: "서울 강남구 봉은사로 10",
      installDate: "2026-06-20",
      customerPhone: "010-9999-0000",
    });

    expect(result).toEqual({
      ok: false,
      error: "ALREADY_SUBMITTED",
      message: "이미 설치 요청 정보가 접수되었습니다.",
    });
  });

  it("normalizes validation error codes to the public action contract", async () => {
    submitInstallationCustomerRequestMock.mockRejectedValue(
      new InstallationCustomerRequestError("INSTALL_ADDRESS_UNPARSEABLE"),
    );

    const addressResult = await submitCustomerRequestAction({
      token: "raw-token",
      installAddress: "주소 모름",
      installDate: "2026-06-20",
      customerPhone: "010-9999-0000",
    });

    expect(addressResult).toMatchObject({
      ok: false,
      error: "INVALID_INSTALL_ADDRESS",
    });

    submitInstallationCustomerRequestMock.mockRejectedValue(
      new InstallationCustomerRequestError("INSTALL_DATE_OUT_OF_RANGE"),
    );

    const dateResult = await submitCustomerRequestAction({
      token: "raw-token",
      installAddress: "서울 강남구 봉은사로 10",
      installDate: "2026-07-30",
      customerPhone: "010-9999-0000",
    });

    expect(dateResult).toMatchObject({
      ok: false,
      error: "INVALID_INSTALL_DATE",
    });

    submitInstallationCustomerRequestMock.mockRejectedValue(
      new InstallationCustomerRequestError("CUSTOMER_PHONE_REQUIRED"),
    );

    const phoneResult = await submitCustomerRequestAction({
      token: "raw-token",
      installAddress: "서울 강남구 봉은사로 10",
      installDate: "2026-06-20",
      customerPhone: "",
    });

    expect(phoneResult).toMatchObject({
      ok: false,
      error: "INVALID_CUSTOMER_PHONE",
    });
  });
});
