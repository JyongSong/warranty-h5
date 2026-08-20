import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  getInstallationCustomerRequestByToken,
  submitInstallationCustomerRequest,
} from "@/lib/installation/customer/request";
import { decryptPii, encryptPii, hmacPii } from "@/lib/piiCrypto";

const {
  transaction,
  findUniqueRequest,
  updateRequest,
  createStatusEvent,
  findUniqueOrder,
  updateOrder,
  dispatchReadyInstallationOrders,
} = vi.hoisted(() => ({
  transaction: vi.fn(),
  findUniqueRequest: vi.fn(),
  updateRequest: vi.fn(),
  createStatusEvent: vi.fn(),
  findUniqueOrder: vi.fn(),
  updateOrder: vi.fn(),
  dispatchReadyInstallationOrders: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    installationCustomerRequest: {
      findUnique: findUniqueRequest,
    },
    $transaction: transaction,
  },
}));

vi.mock("@/lib/installation/installer/dispatch", () => ({
  dispatchReadyInstallationOrders,
}));

function createTx() {
  return {
    installationCustomerRequest: {
      findUnique: findUniqueRequest,
      update: updateRequest,
    },
    installationOrder: {
      findUnique: findUniqueOrder,
      update: updateOrder,
    },
    installationOrderStatusEvent: {
      create: createStatusEvent,
    },
  };
}

describe("installation customer request", () => {
  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = "test-pii-key";
    transaction.mockReset();
    findUniqueRequest.mockReset();
    updateRequest.mockReset();
    createStatusEvent.mockReset();
    findUniqueOrder.mockReset();
    updateOrder.mockReset();
    dispatchReadyInstallationOrders.mockReset();
    dispatchReadyInstallationOrders.mockResolvedValue({
      dispatchedCount: 0,
      skippedCount: 0,
      failedCount: 0,
    });

    transaction.mockImplementation(async (callback) => callback(createTx()));
  });

  it("returns request details for a valid token", async () => {
    const now = new Date("2026-06-11T00:00:00.000Z");
    findUniqueRequest.mockResolvedValue({
      id: "request-1",
      installationOrderId: "order-1",
      requestNumber: 1,
      customerNameEncrypted: encryptPii("홍길동"),
      customerPhoneEncrypted: encryptPii("010-1234-5678"),
      installAddressEncrypted: encryptPii("서울 강남구 테헤란로 1"),
      installDate: null,
      customerNote: null,
      customerTokenExpiresAt: new Date("2026-06-12T00:00:00.000Z"),
      customerSubmittedAt: null,
      status: "PENDING_INPUT",
      installationOrder: {
        id: "order-1",
        source: {
          sourceKey: "SO20260611001",
          memo: "[잇섭PICK_앱 설치] 스마트 도어락 L100 x1 / 용역 출장비 x1",
          customerNameEncrypted: encryptPii("홍길동"),
          phoneEncrypted: encryptPii("010-1234-5678"),
          addressEncrypted: encryptPii("서울 강남구 테헤란로 1"),
        },
        status: "WAITING_CUSTOMER_INPUT",
      },
    });

    const result = await getInstallationCustomerRequestByToken("raw-token", { now });

    expect(result.status).toBe("VALID");
    expect(result.request?.id).toBe("request-1");
    expect(result.request?.customerName).toBe("홍길동");
    expect(result.request?.customerPhone).toBe("010-1234-5678");
    expect(result.request?.installAddress).toBe("서울 강남구 테헤란로 1");
    expect(result.request?.installationOrder.sourceCustomerName).toBe("홍길동");
    expect(result.request?.installationOrder.sourcePhone).toBe("010-1234-5678");
    expect(result.request?.installationOrder.sourceAddress).toBe("서울 강남구 테헤란로 1");
    expect(result.request?.installationOrder.sourceMemo).toBe(
      "[잇섭PICK_앱 설치] 스마트 도어락 L100 x1 / 용역 출장비 x1",
    );
    expect(findUniqueRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          customerTokenHash:
            "34d328009b123fbbb0dc93f18b3e6de1ecf7b1a5783c33dff7ffe1926f09e943",
        },
        select: expect.objectContaining({
          installationOrder: expect.objectContaining({
            select: expect.objectContaining({
              source: expect.objectContaining({
                select: expect.objectContaining({
                  memo: true,
                }),
              }),
            }),
          }),
        }),
      }),
    );
  });

  it("returns not found when the customer token does not exist", async () => {
    findUniqueRequest.mockResolvedValue(null);

    const result = await getInstallationCustomerRequestByToken("missing-token", {
      now: new Date("2026-06-11T00:00:00.000Z"),
    });

    expect(result).toEqual({ status: "NOT_FOUND", request: null });
  });

  it("returns expired when the customer token is past its expiry time", async () => {
    const now = new Date("2026-06-12T00:00:01.000Z");
    findUniqueRequest.mockResolvedValue({
      id: "request-1",
      installationOrderId: "order-1",
      requestNumber: 1,
      customerNameEncrypted: encryptPii("홍길동"),
      customerPhoneEncrypted: encryptPii("010-1234-5678"),
      installAddressEncrypted: encryptPii("서울 강남구 테헤란로 1"),
      installDate: null,
      customerNote: null,
      customerTokenExpiresAt: new Date("2026-06-12T00:00:00.000Z"),
      customerSubmittedAt: null,
      status: "PENDING_INPUT",
      installationOrder: {
        id: "order-1",
        source: {
          sourceKey: "SO20260611001",
          customerNameEncrypted: encryptPii("홍길동"),
          phoneEncrypted: encryptPii("010-1234-5678"),
          addressEncrypted: encryptPii("서울 강남구 테헤란로 1"),
        },
        status: "WAITING_CUSTOMER_INPUT",
      },
    });

    const result = await getInstallationCustomerRequestByToken("raw-token", { now });

    expect(result.status).toBe("EXPIRED");
  });

  it("returns cancelled when the linked order was cancelled", async () => {
    const now = new Date("2026-06-11T00:00:00.000Z");
    findUniqueRequest.mockResolvedValue({
      id: "request-1",
      installationOrderId: "order-1",
      requestNumber: 1,
      customerNameEncrypted: encryptPii("홍길동"),
      customerPhoneEncrypted: encryptPii("010-1234-5678"),
      installAddressEncrypted: encryptPii("서울 강남구 테헤란로 1"),
      installDate: null,
      customerNote: null,
      customerTokenExpiresAt: new Date("2026-06-12T00:00:00.000Z"),
      customerSubmittedAt: null,
      status: "PENDING_INPUT",
      installationOrder: {
        id: "order-1",
        source: {
          sourceKey: "SO20260611001",
          customerNameEncrypted: encryptPii("홍길동"),
          phoneEncrypted: encryptPii("010-1234-5678"),
          addressEncrypted: encryptPii("서울 강남구 테헤란로 1"),
        },
        status: "CANCELLED",
      },
    });

    const result = await getInstallationCustomerRequestByToken("raw-token", { now });

    expect(result.status).toBe("CANCELLED");
  });

  it("rejects submit when the customer token is missing or expired", async () => {
    findUniqueRequest.mockResolvedValueOnce(null);

    await expect(
      submitInstallationCustomerRequest("missing-token", {
        installAddress: "서울 강남구 봉은사로 10",
        installDate: "2026-06-20",
        customerPhone: "010-9999-0000",
        now: new Date("2026-06-11T01:00:00.000Z"),
      }),
    ).rejects.toThrow("TOKEN_NOT_FOUND");

    findUniqueRequest.mockResolvedValueOnce({
      id: "request-1",
      installationOrderId: "order-1",
      customerTokenExpiresAt: new Date("2026-06-11T00:00:00.000Z"),
      customerSubmittedAt: null,
      status: "PENDING_INPUT",
    });

    await expect(
      submitInstallationCustomerRequest("raw-token", {
        installAddress: "서울 강남구 봉은사로 10",
        installDate: "2026-06-20",
        customerPhone: "010-9999-0000",
        now: new Date("2026-06-11T01:00:00.000Z"),
      }),
    ).rejects.toThrow("TOKEN_EXPIRED");

    expect(updateRequest).not.toHaveBeenCalled();
  });

  it("rejects duplicate submit when the request was already submitted", async () => {
    findUniqueRequest.mockResolvedValue({
      id: "request-1",
      installationOrderId: "order-1",
      customerTokenExpiresAt: new Date("2026-06-20T00:00:00.000Z"),
      customerSubmittedAt: new Date("2026-06-11T01:00:00.000Z"),
      status: "SUBMITTED",
    });

    await expect(
      submitInstallationCustomerRequest("raw-token", {
        installAddress: "서울 강남구 봉은사로 10",
        installDate: "2026-06-20",
        customerPhone: "010-9999-0000",
        now: new Date("2026-06-11T02:00:00.000Z"),
      }),
    ).rejects.toThrow("ALREADY_SUBMITTED");

    expect(updateRequest).not.toHaveBeenCalled();
    expect(updateOrder).not.toHaveBeenCalled();
    expect(createStatusEvent).not.toHaveBeenCalled();
  });

  it("rejects submit when the customer request was cancelled", async () => {
    findUniqueRequest.mockResolvedValue({
      id: "request-1",
      installationOrderId: "order-1",
      customerTokenExpiresAt: new Date("2026-06-20T00:00:00.000Z"),
      customerSubmittedAt: null,
      status: "CANCELLED",
    });

    await expect(
      submitInstallationCustomerRequest("raw-token", {
        installAddress: "서울 강남구 봉은사로 10",
        installDate: "2026-06-20",
        customerPhone: "010-9999-0000",
        now: new Date("2026-06-11T02:00:00.000Z"),
      }),
    ).rejects.toThrow("REQUEST_CANCELLED");

    expect(updateRequest).not.toHaveBeenCalled();
    expect(updateOrder).not.toHaveBeenCalled();
    expect(createStatusEvent).not.toHaveBeenCalled();
  });

  it("rejects submit when the linked order was cancelled", async () => {
    findUniqueRequest.mockResolvedValue({
      id: "request-1",
      installationOrderId: "order-1",
      customerTokenExpiresAt: new Date("2026-06-20T00:00:00.000Z"),
      customerSubmittedAt: null,
      status: "PENDING_INPUT",
      installationOrder: {
        status: "CANCELLED",
      },
    });

    await expect(
      submitInstallationCustomerRequest("raw-token", {
        installAddress: "서울 강남구 봉은사로 10",
        installDate: "2026-06-20",
        customerPhone: "010-9999-0000",
        now: new Date("2026-06-11T02:00:00.000Z"),
      }),
    ).rejects.toThrow("REQUEST_CANCELLED");

    expect(updateRequest).not.toHaveBeenCalled();
    expect(updateOrder).not.toHaveBeenCalled();
    expect(createStatusEvent).not.toHaveBeenCalled();
  });

  it("marks a valid request submitted, transitions the order, and writes a status event", async () => {
    const now = new Date("2026-06-11T01:00:00.000Z");
    findUniqueRequest.mockResolvedValue({
      id: "request-1",
      installationOrderId: "order-1",
      customerTokenExpiresAt: new Date("2026-06-12T00:00:00.000Z"),
      customerSubmittedAt: null,
      status: "PENDING_INPUT",
    });
    updateRequest.mockResolvedValue({ id: "request-1", status: "SUBMITTED" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "WAITING_CUSTOMER_INPUT" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    const result = await submitInstallationCustomerRequest("raw-token", {
      installAddress: "서울 강남구 봉은사로 10",
      installAddressDetail: "101동 1203호 공동현관 #1234",
      installDate: "2026-06-20",
      installTimeSlot: "오후 12:00 - 15:00",
      customerPhone: "010-9999-0000",
      customerNote: "오후 희망",
      now,
    });

    expect(result).toMatchObject({
      id: "request-1",
      installationOrderId: "order-1",
      status: "SUBMITTED",
    });
    const updateCall = updateRequest.mock.calls[0]?.[0];
    expect(updateCall).toMatchObject({
      where: { id: "request-1" },
      data: {
        installDate: "2026-06-20",
        installTimeSlot: "오후 12:00 - 15:00",
        customerPhoneSource: "CUSTOMER",
        customerNote: "오후 희망",
        customerSubmittedAt: now,
        status: "SUBMITTED",
      },
    });
    expect(updateCall.data.installAddressEncrypted).toMatch(/^enc:v1:/);
    expect(decryptPii(updateCall.data.installAddressEncrypted)).toBe("서울 강남구 봉은사로 10");
    expect(updateCall.data.installAddressDetailEncrypted).toMatch(/^enc:v1:/);
    expect(updateCall.data.customerPhoneEncrypted).toMatch(/^enc:v1:/);
    expect(decryptPii(updateCall.data.installAddressDetailEncrypted)).toBe("101동 1203호 공동현관 #1234");
    expect(decryptPii(updateCall.data.installAddress1Encrypted)).toBe("서울 강남구");
    expect(decryptPii(updateCall.data.installAddress2Encrypted)).toBe("봉은사로 10");
    expect(decryptPii(updateCall.data.customerPhoneEncrypted)).toBe("01099990000");
    expect(updateCall.data.customerPhoneHash).toBe(hmacPii("01099990000"));
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        status: "READY_FOR_CANDIDATE_SELECTION",
        statusChangedAt: now,
      },
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: {
        installationOrderId: "order-1",
        fromStatus: "WAITING_CUSTOMER_INPUT",
        toStatus: "READY_FOR_CANDIDATE_SELECTION",
        eventType: "CUSTOMER_SUBMITTED",
        actorType: "CUSTOMER",
        actorId: null,
        reason: null,
        metadata: {
          customerRequestId: "request-1",
        },
        createdAt: now,
      },
    });
  });

  it("immediately dispatches the order when the submitted install date is inside the T-10 window", async () => {
    const now = new Date("2026-06-11T01:00:00.000Z");
    findUniqueRequest.mockResolvedValue({
      id: "request-1",
      installationOrderId: "order-1",
      customerTokenExpiresAt: new Date("2026-06-12T00:00:00.000Z"),
      customerSubmittedAt: null,
      status: "PENDING_INPUT",
    });
    updateRequest.mockResolvedValue({ id: "request-1", status: "SUBMITTED" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "WAITING_CUSTOMER_INPUT" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await submitInstallationCustomerRequest("raw-token", {
      installAddress: "서울 강남구 봉은사로 10",
      installDate: "2026-06-20",
      customerPhone: "010-9999-0000",
      now,
    });

    expect(dispatchReadyInstallationOrders).toHaveBeenCalledWith({
      now,
      limit: 1,
      orderId: "order-1",
    });
  });

  it("does not immediately dispatch when the submitted install date is outside the T-10 window", async () => {
    const now = new Date("2026-06-11T01:00:00.000Z");
    findUniqueRequest.mockResolvedValue({
      id: "request-1",
      installationOrderId: "order-1",
      customerTokenExpiresAt: new Date("2026-06-12T00:00:00.000Z"),
      customerSubmittedAt: null,
      status: "PENDING_INPUT",
    });
    updateRequest.mockResolvedValue({ id: "request-1", status: "SUBMITTED" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "WAITING_CUSTOMER_INPUT" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await submitInstallationCustomerRequest("raw-token", {
      installAddress: "서울 강남구 봉은사로 10",
      installDate: "2026-06-22",
      customerPhone: "010-9999-0000",
      now,
    });

    expect(dispatchReadyInstallationOrders).not.toHaveBeenCalled();
  });

  it("rejects install dates earlier than KST today plus two days", async () => {
    await expect(
      submitInstallationCustomerRequest("raw-token", {
        installAddress: "서울 강남구 봉은사로 10",
        installDate: "2026-06-12",
        customerPhone: "010-9999-0000",
        now: new Date("2026-06-10T15:00:00.000Z"),
      }),
    ).rejects.toThrow("INSTALL_DATE_OUT_OF_RANGE");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("accepts install dates from KST today plus two through today plus thirty", async () => {
    const now = new Date("2026-06-10T15:00:00.000Z");
    findUniqueRequest.mockResolvedValue({
      id: "request-1",
      installationOrderId: "order-1",
      customerTokenExpiresAt: new Date("2026-06-20T00:00:00.000Z"),
      customerSubmittedAt: null,
      status: "PENDING_INPUT",
    });
    updateRequest.mockResolvedValue({ id: "request-1", status: "SUBMITTED" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "WAITING_CUSTOMER_INPUT" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    await submitInstallationCustomerRequest("raw-token", {
      installAddress: "서울 강남구 봉은사로 10",
      installDate: "2026-07-11",
      customerPhone: "010-9999-0000",
      now,
    });

    expect(updateRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          installAddress1Encrypted: expect.stringMatching(/^enc:v1:/),
          installAddress2Encrypted: expect.stringMatching(/^enc:v1:/),
          installDate: "2026-07-11",
        }),
      }),
    );
  });

  it("rejects addresses that cannot be parsed into sido and sigungu", async () => {
    await expect(
      submitInstallationCustomerRequest("raw-token", {
        installAddress: "주소 모름",
        installDate: "2026-06-20",
        customerPhone: "010-9999-0000",
        now: new Date("2026-06-11T01:00:00.000Z"),
      }),
    ).rejects.toThrow("INSTALL_ADDRESS_UNPARSEABLE");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("rejects customer phone numbers that cannot normalize to 11 digits", async () => {
    await expect(
      submitInstallationCustomerRequest("raw-token", {
        installAddress: "서울 강남구 봉은사로 10",
        installDate: "2026-06-20",
        customerPhone: "02-123-4567",
        now: new Date("2026-06-11T01:00:00.000Z"),
      }),
    ).rejects.toThrow("PHONE_11_DIGITS_REQUIRED");
    expect(transaction).not.toHaveBeenCalled();
  });

  // KST 오늘 = 2026-06-11 → 허용 범위는 06-13 ~ 09-09 (모레 ~ 90일).
  it("rejects install dates later than KST today plus ninety days", async () => {
    await expect(
      submitInstallationCustomerRequest("raw-token", {
        installAddress: "서울 강남구 봉은사로 10",
        installDate: "2026-09-10",
        customerPhone: "010-9999-0000",
        now: new Date("2026-06-10T15:00:00.000Z"),
      }),
    ).rejects.toThrow("INSTALL_DATE_OUT_OF_RANGE");
    expect(transaction).not.toHaveBeenCalled();
  });

  it("lets the ninetieth day past date validation", async () => {
    // 날짜 검증은 토큰 조회보다 먼저 돈다. 범위 오류가 아니라 토큰 오류로
    // 떨어진다는 것은 90일째가 범위 안으로 받아들여졌다는 뜻이다.
    await expect(
      submitInstallationCustomerRequest("raw-token", {
        installAddress: "서울 강남구 봉은사로 10",
        installDate: "2026-09-09",
        customerPhone: "010-9999-0000",
        now: new Date("2026-06-10T15:00:00.000Z"),
      }),
    ).rejects.toThrow("TOKEN_NOT_FOUND");
  });

  it("rejects non-calendar install dates", async () => {
    await expect(
      submitInstallationCustomerRequest("raw-token", {
        installAddress: "서울 강남구 봉은사로 10",
        installDate: "2026-02-31",
        customerPhone: "010-9999-0000",
        now: new Date("2026-02-01T00:00:00.000Z"),
      }),
    ).rejects.toThrow("INSTALL_DATE_INVALID");
    expect(transaction).not.toHaveBeenCalled();
  });
});
