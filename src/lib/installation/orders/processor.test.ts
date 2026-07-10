import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashInstallationCustomerToken } from "@/lib/installation/customer/token";
import {
  createCustomerInputRequestsForInstallationOrders,
  processPendingInstallationOrders,
} from "@/lib/installation/orders/processor";
import { decryptPii, encryptPii } from "@/lib/piiCrypto";

const {
  transaction,
  findMany,
  findUnique,
  updateOrder,
  createStatusEvent,
  createCustomerRequest,
  createNotification,
  createInstallationIssue,
} = vi.hoisted(() => ({
  transaction: vi.fn(),
  findMany: vi.fn(),
  findUnique: vi.fn(),
  updateOrder: vi.fn(),
  createStatusEvent: vi.fn(),
  createCustomerRequest: vi.fn(),
  createNotification: vi.fn(),
  createInstallationIssue: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    installationOrder: {
      findMany,
    },
    $transaction: transaction,
  },
}));

vi.mock("@/lib/installation/orders/issues/create", () => ({
  createInstallationIssue,
}));

function createTx() {
  return {
    installationOrder: {
      findUnique,
      update: updateOrder,
    },
    installationOrderStatusEvent: {
      create: createStatusEvent,
    },
    installationCustomerRequest: {
      create: createCustomerRequest,
    },
    installationNotification: {
      create: createNotification,
    },
  };
}

describe("processPendingInstallationOrders", () => {
  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = "test-pii-key";
    transaction.mockReset();
    findMany.mockReset();
    findUnique.mockReset();
    updateOrder.mockReset();
    createStatusEvent.mockReset();
    createCustomerRequest.mockReset();
    createNotification.mockReset();
    createInstallationIssue.mockReset();

    transaction.mockImplementation(async (callback) => callback(createTx()));
  });

  it("creates a customer request and pending notification for each waiting order without a request", async () => {
    const now = new Date("2026-06-11T00:00:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "order-1",
        status: "CUSTOMER_INPUT_SMS_REQUIRED",
        source: {
          sourceKey: "SO20260611001",
          customerNameEncrypted: encryptPii("홍길동"),
          phoneEncrypted: encryptPii("010-1234-5678"),
          memo: "Aqara 스마트 도어락 K100 x1 / 용역 출장비 x1",
        },
      },
    ]);
    findUnique.mockResolvedValue({ id: "order-1", status: "CUSTOMER_INPUT_SMS_REQUIRED" });
    createCustomerRequest.mockResolvedValue({ id: "request-1" });
    createNotification.mockResolvedValue({ id: "notification-1" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "CUSTOMER_INPUT_SMS_REQUIRED" });

    const result = await processPendingInstallationOrders({
      limit: 10,
      baseUrl: "https://example.com",
      now,
      tokenFactory: () => "raw-token",
    });

    expect(result).toEqual({
      processedCount: 1,
      skippedDuplicateCount: 0,
      failedCount: 0,
    });
    expect(findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        source: {
          select: {
            sourceKey: true,
            customerNameEncrypted: true,
            phoneEncrypted: true,
            memo: true,
          },
        },
      },
      where: {
        status: "CUSTOMER_INPUT_SMS_REQUIRED",
        activeCustomerRequestId: null,
      },
      orderBy: { createdAt: "asc" },
      take: 10,
    });
    const requestData = createCustomerRequest.mock.calls[0][0].data;
    expect(requestData).toMatchObject({
      installationOrderId: "order-1",
      requestNumber: 1,
      customerPhoneEncrypted: null,
      customerPhoneHash: null,
      customerPhoneSource: "PENDING_CUSTOMER",
      installAddressEncrypted: null,
      customerTokenHash: hashInstallationCustomerToken("raw-token"),
      customerTokenExpiresAt: new Date("2026-06-14T00:00:00.000Z"),
      status: "PENDING_INPUT",
    });
    expect(requestData.customerNameEncrypted).toMatch(/^enc:v1:/);
    expect(decryptPii(requestData.customerNameEncrypted)).toBe("홍길동");

    const notificationData = createNotification.mock.calls[0][0].data;
    expect(notificationData).toMatchObject({
      installationOrderId: "order-1",
      customerRequestId: "request-1",
      smsType: "CUSTOMER_INPUT_LINK",
      recipientType: "CUSTOMER",
      smsTemplateKey: "customer_reservation_link",
      provider: "solapi",
      status: "PENDING",
      idempotencyKey: "customer-reservation-link:order-1:1",
    });
    expect(notificationData.recipientPhoneEncrypted).toMatch(/^enc:v1:/);
    expect(decryptPii(notificationData.recipientPhoneEncrypted)).toBe("01012345678");
    expect(createNotification.mock.calls[0][0].data.smsBody).toContain("Aqara 스마트 도어락 K100 x1 외");
    expect(createNotification.mock.calls[0][0].data.smsBody).toContain(
      "https://example.com/i/c/raw-token",
    );
    expect(updateOrder).toHaveBeenCalledWith({
      where: { id: "order-1" },
      data: {
        activeCustomerRequestId: "request-1",
        status: "WAITING_CUSTOMER_INPUT",
        statusChangedAt: now,
      },
    });
    expect(createStatusEvent).toHaveBeenCalledWith({
      data: {
        installationOrderId: "order-1",
        fromStatus: "CUSTOMER_INPUT_SMS_REQUIRED",
        toStatus: "WAITING_CUSTOMER_INPUT",
        eventType: "CUSTOMER_INPUT_SMS_QUEUED",
        actorType: "SYSTEM",
        actorId: null,
        reason: null,
        metadata: { customerRequestId: "request-1" },
        createdAt: now,
      },
    });
  });

  it("queues customer input SMS notifications for 050 safe numbers", async () => {
    findMany.mockResolvedValue([
      {
        id: "order-1",
        status: "CUSTOMER_INPUT_SMS_REQUIRED",
        source: {
          sourceKey: "SO20260611001",
          customerNameEncrypted: encryptPii("홍길동"),
          phoneEncrypted: encryptPii("0503-1111-2222"),
          memo: "Aqara 스마트 도어락 K100 x1",
        },
      },
    ]);
    findUnique.mockResolvedValue({ id: "order-1", status: "CUSTOMER_INPUT_SMS_REQUIRED" });
    createCustomerRequest.mockResolvedValue({ id: "request-1" });
    createNotification.mockResolvedValue({ id: "notification-1" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "CUSTOMER_INPUT_SMS_REQUIRED" });

    const result = await processPendingInstallationOrders({
      baseUrl: "https://example.com",
      tokenFactory: () => "raw-token",
    });

    expect(result).toEqual({
      processedCount: 1,
      skippedDuplicateCount: 0,
      failedCount: 0,
    });
    const notificationData = createNotification.mock.calls[0][0].data;
    expect(decryptPii(notificationData.recipientPhoneEncrypted)).toBe("050311112222");
    expect(notificationData.recipientPhoneHash).toBeDefined();
    expect(createInstallationIssue).not.toHaveBeenCalled();
  });

  it("uses source items JSON instead of source memo for customer reservation product SMS", async () => {
    findMany.mockResolvedValue([
      {
        id: "order-1",
        status: "CUSTOMER_INPUT_SMS_REQUIRED",
        source: {
          sourceKey: "SO20260611001",
          customerNameEncrypted: encryptPii("홍길동"),
          phoneEncrypted: encryptPii("010-1234-5678"),
          memo: "[지니스펙트럼PICK_앱 설치] 잘못된 메모 상품 x1",
        },
      },
    ]);
    findUnique.mockResolvedValue({ id: "order-1", status: "CUSTOMER_INPUT_SMS_REQUIRED" });
    createCustomerRequest.mockResolvedValue({ id: "request-1" });
    createNotification.mockResolvedValue({ id: "notification-1" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "CUSTOMER_INPUT_SMS_REQUIRED" });

    await processPendingInstallationOrders({
      baseUrl: "https://example.com",
      tokenFactory: () => "raw-token",
    });

    expect(createNotification.mock.calls[0][0].data.smsBody).toContain("잘못된 메모 상품 x1");
  });

  it("skips duplicate customer request creation conflicts without failing the whole batch", async () => {
    findMany.mockResolvedValue([
      {
        id: "order-1",
        status: "CUSTOMER_INPUT_SMS_REQUIRED",
        source: {
          sourceKey: "SO20260611001",
          customerNameEncrypted: encryptPii("홍길동"),
          phoneEncrypted: encryptPii("010-1234-5678"),
          memo: null,
        },
      },
    ]);
    createCustomerRequest.mockRejectedValue({ code: "P2002" });

    const result = await processPendingInstallationOrders({
      baseUrl: "https://example.com",
      tokenFactory: () => "raw-token",
    });

    expect(result).toEqual({
      processedCount: 0,
      skippedDuplicateCount: 1,
      failedCount: 0,
    });
    expect(createNotification).not.toHaveBeenCalled();
    expect(updateOrder).not.toHaveBeenCalled();
  });

  it("counts per-order failures and continues processing the rest of the batch", async () => {
    findMany.mockResolvedValue([
      {
        id: "order-1",
        status: "CUSTOMER_INPUT_SMS_REQUIRED",
        source: {
          sourceKey: "SO20260611001",
          customerNameEncrypted: encryptPii("홍길동"),
          phoneEncrypted: encryptPii("010-1234-5678"),
          memo: null,
        },
      },
      {
        id: "order-2",
        status: "CUSTOMER_INPUT_SMS_REQUIRED",
        source: {
          sourceKey: "SO20260611002",
          customerNameEncrypted: encryptPii("김철수"),
          phoneEncrypted: encryptPii("010-2222-3333"),
          memo: null,
        },
      },
    ]);
    createCustomerRequest
      .mockRejectedValueOnce(new Error("TEMPORARY_DB_ERROR"))
      .mockResolvedValueOnce({ id: "request-2" });
    findUnique.mockResolvedValue({ id: "order-2", status: "CUSTOMER_INPUT_SMS_REQUIRED" });
    createNotification.mockResolvedValue({ id: "notification-2" });
    updateOrder.mockResolvedValue({ id: "order-2", status: "CUSTOMER_INPUT_SMS_REQUIRED" });

    const result = await processPendingInstallationOrders({
      baseUrl: "https://example.com",
      tokenFactory: () => "raw-token",
    });

    expect(result).toEqual({
      processedCount: 1,
      skippedDuplicateCount: 0,
      failedCount: 1,
    });
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(updateOrder).toHaveBeenCalledTimes(1);
  });

  it("creates an open issue when source phone format prevents customer SMS request creation", async () => {
    const now = new Date("2026-06-11T00:00:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "order-1",
        status: "CUSTOMER_INPUT_SMS_REQUIRED",
        source: {
          sourceKey: "SO20260611001",
          customerNameEncrypted: encryptPii("홍길동"),
          phoneEncrypted: encryptPii("02-123-4567"),
          memo: "Aqara 스마트 도어락 K100 x1",
        },
      },
    ]);

    const result = await processPendingInstallationOrders({
      baseUrl: "https://example.com",
      now,
      tokenFactory: () => "raw-token",
    });

    expect(result).toEqual({
      processedCount: 0,
      skippedDuplicateCount: 0,
      failedCount: 1,
    });
    expect(createInstallationIssue).toHaveBeenCalledWith({
      installationOrderId: "order-1",
      type: "ORDER_CUSTOMER_PHONE_INVALID",
      title: "고객 전화번호 형식 오류",
      description: "원천 주문 고객 전화번호가 모바일 번호 형식이 아니어서 고객 입력 안내 문자를 발송할 수 없습니다.",
      metadata: {
        sourceKey: "SO20260611001",
        errorCode: "PHONE_11_DIGITS_REQUIRED",
      },
      now,
    });
    expect(createCustomerRequest).not.toHaveBeenCalled();
    expect(createNotification).not.toHaveBeenCalled();
  });

  it("manually creates customer input SMS notifications only for selected waiting orders without requests", async () => {
    const now = new Date("2026-06-11T00:00:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "order-1",
        status: "CUSTOMER_INPUT_SMS_REQUIRED",
        activeCustomerRequestId: null,
        source: {
          sourceKey: "SO20260611001",
          customerNameEncrypted: encryptPii("홍길동"),
          phoneEncrypted: encryptPii("010-1234-5678"),
          memo: "Aqara 스마트 도어락 K100 x1",
        },
      },
      {
        id: "order-2",
        status: "READY_FOR_CANDIDATE_SELECTION",
        activeCustomerRequestId: null,
        source: {
          sourceKey: "SO20260611002",
          customerNameEncrypted: encryptPii("김철수"),
          phoneEncrypted: encryptPii("010-2222-3333"),
          memo: null,
        },
      },
      {
        id: "order-3",
        status: "CUSTOMER_INPUT_SMS_REQUIRED",
        activeCustomerRequestId: "request-existing",
        source: {
          sourceKey: "SO20260611003",
          customerNameEncrypted: encryptPii("이영희"),
          phoneEncrypted: encryptPii("010-3333-4444"),
          memo: null,
        },
      },
    ]);
    findUnique.mockResolvedValue({ id: "order-1", status: "CUSTOMER_INPUT_SMS_REQUIRED" });
    createCustomerRequest.mockResolvedValue({ id: "request-1" });
    createNotification.mockResolvedValue({ id: "notification-1" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "CUSTOMER_INPUT_SMS_REQUIRED" });

    const result = await createCustomerInputRequestsForInstallationOrders({
      orderIds: [" order-1 ", "order-2", "order-3", "order-1"],
      baseUrl: "https://example.com",
      now,
      tokenFactory: () => "manual-token",
    });

    expect(result).toEqual({
      processedCount: 1,
      skippedAlreadyRequestedCount: 1,
      skippedDuplicateCount: 0,
      skippedInvalidStateCount: 1,
      failedCount: 0,
    });
    expect(findMany).toHaveBeenCalledWith({
      select: {
        id: true,
        status: true,
        activeCustomerRequestId: true,
        source: {
          select: {
            sourceKey: true,
            customerNameEncrypted: true,
            phoneEncrypted: true,
            memo: true,
          },
        },
      },
      where: {
        id: { in: ["order-1", "order-2", "order-3"] },
      },
      orderBy: { createdAt: "asc" },
    });
    expect(createNotification).toHaveBeenCalledTimes(1);
    expect(createNotification.mock.calls[0][0].data).toMatchObject({
      installationOrderId: "order-1",
      customerRequestId: "request-1",
      smsType: "CUSTOMER_INPUT_LINK",
      recipientType: "CUSTOMER",
      smsTemplateKey: "customer_reservation_link",
      provider: "solapi",
      status: "PENDING",
      idempotencyKey: "customer-reservation-link:order-1:1",
    });
    expect(createNotification.mock.calls[0][0].data.smsBody).toContain(
      "https://example.com/i/c/manual-token",
    );
    expect(updateOrder).toHaveBeenCalledTimes(1);
  });
});
