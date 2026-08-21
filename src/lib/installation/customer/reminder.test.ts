import { beforeEach, describe, expect, it, vi } from "vitest";
import { hashInstallationCustomerToken } from "@/lib/installation/customer/token";
import { remindExpiredInstallationCustomerRequests } from "@/lib/installation/customer/reminder";
import { decryptPii } from "@/lib/piiCrypto";

const {
  transaction,
  findMany,
  updateRequest,
  createNotification,
  createInstallationIssue,
} = vi.hoisted(() => ({
  transaction: vi.fn(),
  findMany: vi.fn(),
  updateRequest: vi.fn(),
  createNotification: vi.fn(),
  createInstallationIssue: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    installationCustomerRequest: {
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
    installationCustomerRequest: {
      update: updateRequest,
    },
    installationNotification: {
      create: createNotification,
    },
  };
}

describe("remindExpiredInstallationCustomerRequests", () => {
  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = "test-pii-key";
    transaction.mockReset();
    findMany.mockReset();
    updateRequest.mockReset();
    createNotification.mockReset();
    createInstallationIssue.mockReset();
    createInstallationIssue.mockResolvedValue({ id: "issue-1" });

    transaction.mockImplementation(async (callback) => callback(createTx()));
  });

  it("creates one reminder notification with a renewed customer token", async () => {
    const now = new Date("2026-06-11T12:00:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "request-1",
        installationOrderId: "order-1",
        customerName: "홍길동",
        customerPhoneEncrypted: "010-1234-5678",
        installationOrder: {
          source: {
            phoneEncrypted: "010-0000-0000",
            memo: "Aqara 스마트 도어락 K100 x1",
          },
        },
      },
    ]);
    updateRequest.mockResolvedValue({ id: "request-1" });
    createNotification.mockResolvedValue({ id: "notification-1" });

    const result = await remindExpiredInstallationCustomerRequests({
      now,
      limit: 10,
      baseUrl: "https://example.com",
      tokenFactory: () => "reminder-token",
    });

    expect(result).toEqual({ remindedCount: 1, skippedCount: 0, failedCount: 0 });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: "PENDING_INPUT",
        customerSubmittedAt: null,
        fallbackUsed: false,
        createdAt: {
          lte: new Date("2026-06-11T00:00:00.000Z"),
        },
        installationOrder: {
          status: "WAITING_CUSTOMER_INPUT",
          hasOpenIssue: false,
        },
      },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: expect.any(Object),
    });
    expect(updateRequest).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: {
        customerTokenHash: hashInstallationCustomerToken("reminder-token"),
        customerTokenExpiresAt: new Date("2026-06-14T12:00:00.000Z"),
      },
    });
    expect(createNotification).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        customerRequestId: "request-1",
        smsType: "CUSTOMER_INPUT_REMINDER",
        recipientType: "CUSTOMER",
        smsTemplateKey: "customer_reservation_reminder",
        provider: "solapi",
        status: "PENDING",
        idempotencyKey: "customer-reservation-reminder:request-1:1",
      }),
    });
    expect(createNotification.mock.calls[0][0].data.recipientPhoneEncrypted).toMatch(/^enc:v1:/);
    expect(decryptPii(createNotification.mock.calls[0][0].data.recipientPhoneEncrypted)).toBe("01012345678");
    expect(createNotification.mock.calls[0][0].data.smsBody).toContain(
      "주문 상품: Aqara 스마트 도어락 K100 x1",
    );
    expect(createNotification.mock.calls[0][0].data.smsBody).toContain(
      "https://example.com/i/c/reminder-token",
    );
  });

  it("skips requests without a customer or source phone", async () => {
    findMany.mockResolvedValue([
      {
        id: "request-1",
        installationOrderId: "order-1",
        customerName: "홍길동",
        customerPhone: null,
        installationOrder: {
          source: {
            phoneEncrypted: null,
            memo: null,
          },
        },
      },
    ]);

    const result = await remindExpiredInstallationCustomerRequests({
      baseUrl: "https://example.com",
    });

    expect(result).toEqual({ remindedCount: 0, skippedCount: 1, failedCount: 0 });
    expect(transaction).not.toHaveBeenCalled();
  });

  it("does not count an already-created reminder as reminded again", async () => {
    findMany.mockResolvedValue([
      {
        id: "request-1",
        installationOrderId: "order-1",
        customerName: "홍길동",
        customerPhoneEncrypted: "010-1234-5678",
        installationOrder: {
          source: {
            phoneEncrypted: null,
            memo: null,
          },
        },
      },
    ]);
    createNotification.mockRejectedValue({ code: "P2002" });

    const result = await remindExpiredInstallationCustomerRequests({
      baseUrl: "https://example.com",
      tokenFactory: () => "reminder-token",
    });

    expect(result).toEqual({ remindedCount: 0, skippedCount: 1, failedCount: 0 });
  });

  it("counts an unexpected reminder creation error as a failure", async () => {
    const now = new Date("2026-06-11T12:00:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "request-1",
        installationOrderId: "order-1",
        customerPhoneEncrypted: "010-1234-5678",
        installationOrder: {
          source: {
            phoneEncrypted: null,
            memo: null,
          },
        },
      },
    ]);
    createNotification.mockRejectedValue(new Error("notification insert failed"));

    const result = await remindExpiredInstallationCustomerRequests({
      now,
      baseUrl: "https://example.com",
      tokenFactory: () => "reminder-token",
    });

    expect(result).toEqual({ remindedCount: 0, skippedCount: 1, failedCount: 1 });
    expect(createInstallationIssue).toHaveBeenCalledWith(
      expect.objectContaining({
        installationOrderId: "order-1",
        type: "INSTALLATION_AUTOMATION_FAILED",
        description: "notification insert failed",
        now,
      }),
    );
  });
});
