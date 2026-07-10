import { describe, expect, it } from "vitest";
import {
  CUSTOMER_REQUEST_UNAVAILABLE_STATUS,
  formatOrderProductSummary,
  getInitialCustomerInputValues,
  getSubmittedStatusScreenContent,
  isCustomerRequestUnavailableError,
} from "./customer-input";

type TestRequest = {
  id: string;
  customerName: string | null;
  customerPhone: string | null;
  installAddress: string | null;
  installDate: string | null;
  customerNote: string | null;
  installationOrder: {
    sourceErpOrderNo: string;
    sourceMemo: string | null;
    sourceCustomerName: string | null;
    sourcePhone: string | null;
    sourceAddress: string | null;
  };
};

function createRequest(overrides: Partial<TestRequest> = {}): TestRequest {
  return {
    id: "request-1",
    customerName: "홍길동",
    customerPhone: null,
    installAddress: null,
    installDate: null,
    customerNote: null,
    installationOrder: {
      sourceErpOrderNo: "ORDER-001",
      sourceMemo: "[잇섭PICK_앱 설치] 스마트 도어락 L100 x1 / 용역 출장비 x1",
      sourceCustomerName: "홍길동",
      sourcePhone: "010-1234-5678",
      sourceAddress: "서울 강남구 테헤란로 123",
    },
    ...overrides,
  };
}

describe("CUSTOMER_REQUEST_UNAVAILABLE_STATUS", () => {
  it("keeps the current explanation and adds customer center guidance in one line", () => {
    expect(CUSTOMER_REQUEST_UNAVAILABLE_STATUS.description).toBe(
      "입력 링크를 다시 확인해 주세요. 이미 정보를 접수한 경우 추가 입력은 필요하지 않습니다. 예약 정보를 변경해야 하는 경우 고객센터로 문의해 주세요.",
    );
  });
});

describe("CustomerRequestClient initial inputs", () => {
  it("does not prefill customer-editable inputs from source order information", () => {
    expect(getInitialCustomerInputValues(createRequest(), "VALID")).toEqual({
      address: "",
      phone: "",
    });
  });

  it("does not prefill unsubmitted inputs from order values copied onto the customer request", () => {
    expect(
      getInitialCustomerInputValues(
        createRequest({
          customerPhone: "010-1234-5678",
          installAddress: "서울 강남구 테헤란로 123",
        }),
        "VALID",
      ),
    ).toEqual({
      address: "",
      phone: "",
    });
  });

  it("keeps values already submitted on the customer request", () => {
    expect(
      getInitialCustomerInputValues(
        createRequest({
          customerPhone: "010-9999-0000",
          installAddress: "서울 강남구 봉은사로 10",
        }),
        "SUBMITTED",
      ),
    ).toEqual({
      address: "서울 강남구 봉은사로 10",
      phone: "010-9999-0000",
    });
  });
});

describe("formatOrderProductSummary", () => {
  it("keeps a single order product unchanged", () => {
    expect(formatOrderProductSummary("스마트 도어락 L100 x1")).toBe("스마트 도어락 L100 x1");
  });

  it("summarizes multiple slash-separated order products with 외", () => {
    expect(
      formatOrderProductSummary(
        "[스마트홈 여름 준비 패키지_앱+허브 설치] 스마트 도어락 L100 x1 / 허브 M100 x1 / 5V 2A 저속 충전 어댑터 x2",
      ),
    ).toBe("[스마트홈 여름 준비 패키지_앱+허브 설치] 스마트 도어락 L100 x1 외");
  });
});

describe("getSubmittedStatusScreenContent", () => {
  it("shows the completion copy immediately after the customer submits", () => {
    expect(
      getSubmittedStatusScreenContent({
        justSubmitted: true,
        serverStatus: "SUBMITTED",
      }),
    ).toEqual({
      title: "예약 정보가 접수되었습니다",
      description: "입력하신 설치 장소와 희망 일정 기준으로 담당자가 확인 후 안내드리겠습니다.",
      showSummary: true,
      tone: "success",
    });
  });

  it("shows the already-submitted copy when reopening a submitted link", () => {
    expect(
      getSubmittedStatusScreenContent({
        justSubmitted: false,
        serverStatus: "SUBMITTED",
      }),
    ).toEqual({
      title: "유효하지 않거나 이미 접수된 정보입니다",
      description:
        "입력 링크를 다시 확인해 주세요. 이미 정보를 접수한 경우 추가 입력은 필요하지 않습니다. 예약 정보를 변경해야 하는 경우 고객센터로 문의해 주세요.",
      showSummary: false,
      tone: "warning",
    });
  });

  it("does not return submitted copy for an unsubmitted valid request", () => {
    expect(
      getSubmittedStatusScreenContent({
        justSubmitted: false,
        serverStatus: "VALID",
      }),
    ).toBeNull();
  });
});

describe("isCustomerRequestUnavailableError", () => {
  it("groups procedural link states separately from system errors", () => {
    expect(isCustomerRequestUnavailableError("TOKEN_NOT_FOUND")).toBe(true);
    expect(isCustomerRequestUnavailableError("TOKEN_EXPIRED")).toBe(true);
    expect(isCustomerRequestUnavailableError("ALREADY_SUBMITTED")).toBe(true);
    expect(isCustomerRequestUnavailableError("INTERNAL_ERROR")).toBe(false);
  });
});
