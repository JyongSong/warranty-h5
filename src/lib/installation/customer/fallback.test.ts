import { beforeEach, describe, expect, it, vi } from "vitest";
import { fallbackExpiredInstallationCustomerRequests } from "@/lib/installation/customer/fallback";
import { decryptPii, hmacPii } from "@/lib/piiCrypto";

const {
  transaction,
  findMany,
  updateRequest,
  findUniqueOrder,
  updateOrder,
  findIssue,
  createIssue,
  updateIssue,
  createStatusEvent,
} = vi.hoisted(() => ({
  transaction: vi.fn(),
  findMany: vi.fn(),
  updateRequest: vi.fn(),
  findUniqueOrder: vi.fn(),
  updateOrder: vi.fn(),
  findIssue: vi.fn(),
  createIssue: vi.fn(),
  updateIssue: vi.fn(),
  createStatusEvent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    installationCustomerRequest: {
      findMany,
    },
    $transaction: transaction,
  },
}));

function createTx() {
  return {
    installationCustomerRequest: {
      update: updateRequest,
    },
    installationOrder: {
      findUnique: findUniqueOrder,
      update: updateOrder,
    },
    installationIssue: {
      findFirst: findIssue,
      create: createIssue,
      update: updateIssue,
    },
    installationOrderStatusEvent: {
      create: createStatusEvent,
    },
  };
}

describe("fallbackExpiredInstallationCustomerRequests", () => {
  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = "test-pii-key";
    transaction.mockReset();
    findMany.mockReset();
    updateRequest.mockReset();
    findUniqueOrder.mockReset();
    updateOrder.mockReset();
    findIssue.mockReset();
    createIssue.mockReset();
    updateIssue.mockReset();
    createStatusEvent.mockReset();
    findIssue.mockResolvedValue(null);

    transaction.mockImplementation(async (callback) => callback(createTx()));
  });

  it("uses source address, phone, and valid source install date for requests still unsubmitted after 24 hours", async () => {
    const now = new Date("2026-06-11T12:00:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "request-1",
        installationOrderId: "order-1",
        installationOrder: {
          source: {
            phoneEncrypted: "010-1234-5678",
            addressEncrypted: "서울 강남구 테헤란로 1",
            dueDate: "20260615",
          },
        },
      },
    ]);
    updateRequest.mockResolvedValue({ id: "request-1", status: "FALLBACK_USED" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "WAITING_CUSTOMER_INPUT" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "READY_FOR_CANDIDATE_SELECTION" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    const result = await fallbackExpiredInstallationCustomerRequests({
      now,
      limit: 10,
    });

    expect(result).toEqual({ fallbackCount: 1, manualRequiredCount: 0, skippedCount: 0 });
    expect(findMany).toHaveBeenCalledWith({
      where: {
        status: "PENDING_INPUT",
        customerSubmittedAt: null,
        fallbackUsed: false,
        createdAt: {
          lte: new Date("2026-06-10T12:00:00.000Z"),
        },
        installationOrder: {
          status: "WAITING_CUSTOMER_INPUT",
          issues: {
            none: {
              type: "CUSTOMER_INPUT_NOT_SUBMITTED",
              status: "OPEN",
            },
          },
          statusEvents: {
            none: {
              eventType: "CUSTOMER_FALLBACK_FAILED",
            },
          },
        },
      },
      orderBy: { createdAt: "asc" },
      take: 10,
      select: {
        id: true,
        installationOrderId: true,
        installationOrder: {
          select: {
            source: {
              select: {
                phoneEncrypted: true,
                addressEncrypted: true,
                dueDate: true,
              },
            },
          },
        },
      },
    });
    const updateData = updateRequest.mock.calls[0][0].data;
    expect(updateRequest).toHaveBeenCalledWith({
      where: { id: "request-1" },
      data: expect.objectContaining({
        installAddressEncrypted: expect.stringMatching(/^enc:v1:/),
        installAddress1Encrypted: expect.stringMatching(/^enc:v1:/),
        installAddress2Encrypted: expect.stringMatching(/^enc:v1:/),
        installDate: "2026-06-15",
        customerPhoneEncrypted: expect.stringMatching(/^enc:v1:/),
        customerPhoneHash: hmacPii("01012345678"),
        customerPhoneSource: "ORDER",
        customerNote: null,
        customerSubmittedAt: now,
        fallbackUsed: true,
        status: "FALLBACK_USED",
      }),
    });
    expect(decryptPii(updateData.installAddressEncrypted)).toBe("서울 강남구 테헤란로 1");
    expect(decryptPii(updateData.installAddress1Encrypted)).toBe("서울 강남구");
    expect(decryptPii(updateData.installAddress2Encrypted)).toBe("테헤란로 1");
    expect(decryptPii(updateData.customerPhoneEncrypted)).toBe("01012345678");
    expect(createIssue).not.toHaveBeenCalled();
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
        eventType: "CUSTOMER_FALLBACK_USED",
        actorType: "SYSTEM",
        actorId: null,
        reason: "CUSTOMER_NO_INPUT_24H_SOURCE_ORDER_USED",
        metadata: {
          customerRequestId: "request-1",
          sourceInstallDate: "2026-06-15",
        },
        createdAt: now,
      },
    });
  });

  it("moves to manual review when source order data is insufficient for fallback", async () => {
    const now = new Date("2026-06-11T12:00:00.000Z");
    findMany.mockResolvedValue([
      {
        id: "request-1",
        installationOrderId: "order-1",
        installationOrder: {
          source: {
            phoneEncrypted: "010-1234-5678",
            addressEncrypted: "주소 확인 필요",
            dueDate: "2026-06-15",
          },
        },
      },
    ]);
    createIssue.mockResolvedValue({ id: "issue-1" });
    findUniqueOrder.mockResolvedValue({ id: "order-1", status: "WAITING_CUSTOMER_INPUT" });
    updateOrder.mockResolvedValue({ id: "order-1", status: "WAITING_CUSTOMER_INPUT" });
    createStatusEvent.mockResolvedValue({ id: "event-1" });

    const result = await fallbackExpiredInstallationCustomerRequests({
      now,
      limit: 10,
    });

    expect(result).toEqual({ fallbackCount: 0, manualRequiredCount: 1, skippedCount: 1 });
    expect(updateRequest).not.toHaveBeenCalled();
    expect(createIssue).toHaveBeenCalledWith({
      data: expect.objectContaining({
        installationOrderId: "order-1",
        type: "CUSTOMER_INPUT_NOT_SUBMITTED",
        title: "고객 정보 확인 필요",
        description:
          "고객 미입력 24시간 경과 후 주문 배송지와 연락처를 폴백할 수 없어 확인이 필요합니다.",
        metadata: {
          customerRequestId: "request-1",
          fallbackUsed: false,
        },
      }),
      select: { id: true },
    });
    expect(updateOrder).toHaveBeenNthCalledWith(2, {
      where: { id: "order-1" },
      data: expect.objectContaining({
        status: "WAITING_CUSTOMER_INPUT",
      }),
    });
  });
});
