import { beforeEach, describe, expect, it, vi } from "vitest";
import { decryptPii, encryptPii } from "@/lib/piiCrypto";
import { updateCustomerRequestByAdmin } from "@/lib/installation/customer/admin-edit";

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  findOrder: vi.fn(),
  updateOrder: vi.fn(),
  findRequest: vi.fn(),
  findFirstRequest: vi.fn(),
  updateRequest: vi.fn(),
  findAttempt: vi.fn(),
  updateAttempt: vi.fn(),
  createStatusEvent: vi.fn(),
  dispatchReadyInstallationOrders: vi.fn(),
}));

function createTx() {
  return {
    installationOrder: { findUnique: mocks.findOrder, update: mocks.updateOrder },
    installationCustomerRequest: {
      findUnique: mocks.findRequest,
      findFirst: mocks.findFirstRequest,
      update: mocks.updateRequest,
    },
    installationInstallerAssignmentAttempt: { findUnique: mocks.findAttempt, update: mocks.updateAttempt },
    installationOrderStatusEvent: { create: mocks.createStatusEvent },
    installationIssue: { updateMany: vi.fn(), count: vi.fn() },
  };
}

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    installationOrder: { findUnique: mocks.findOrder },
  },
}));

vi.mock("@/lib/installation/installer/dispatch", () => ({
  dispatchReadyInstallationOrders: mocks.dispatchReadyInstallationOrders,
}));

const NOW = new Date("2026-11-04T01:00:00.000Z");

function baseInput(overrides: Partial<Parameters<typeof updateCustomerRequestByAdmin>[0]> = {}) {
  return {
    adminId: "admin-1",
    orderId: "order-1",
    installAddress: "서울 서초구 강남대로53길 8",
    installAddressDetail: "101동 202호",
    installDate: "2026-11-10",
    installTimeSlot: "오전 09:00 - 12:00",
    customerPhone: "010-1234-5678",
    reason: "고객 요청",
    now: NOW,
    ...overrides,
  };
}

function storedRequest() {
  return {
    id: "request-1",
    installAddressEncrypted: encryptPii("서울 서초구 강남대로53길 8"),
    installAddressDetailEncrypted: encryptPii("101동 202호"),
    installDate: "2026-11-08",
    installTimeSlot: "오전 09:00 - 12:00",
    customerPhoneEncrypted: encryptPii("01012345678"),
  };
}

describe("updateCustomerRequestByAdmin", () => {
  beforeEach(() => {
    process.env.PII_ENCRYPTION_KEY = "test-pii-key";
    Object.values(mocks).forEach((mock) => mock.mockReset());
    mocks.transaction.mockImplementation(async (callback) => callback(createTx()));
    mocks.findRequest.mockResolvedValue(storedRequest());
    mocks.dispatchReadyInstallationOrders.mockResolvedValue({ dispatchedCount: 0, skippedCount: 0, failedCount: 0 });
  });

  it("refuses once the order has been sent to an installer", async () => {
    mocks.findOrder.mockResolvedValue({
      id: "order-1",
      status: "WAITING_INSTALLER_RESPONSE",
      activeCustomerRequestId: "request-1",
      activeAssignmentId: "attempt-1",
    });

    await expect(updateCustomerRequestByAdmin(baseInput())).rejects.toThrow("ORDER_NOT_EDITABLE");
    expect(mocks.updateRequest).not.toHaveBeenCalled();
  });

  it("requires a reason and rejects 050 safe numbers", async () => {
    await expect(updateCustomerRequestByAdmin(baseInput({ reason: " " }))).rejects.toThrow("EDIT_REASON_REQUIRED");
    await expect(updateCustomerRequestByAdmin(baseInput({ customerPhone: "050-1234-56789" }))).rejects.toThrow(
      "CUSTOMER_PHONE_IS_SAFE_NUMBER",
    );
  });

  it("edits in place while waiting for candidate selection and dispatches when the date is near", async () => {
    mocks.findOrder.mockResolvedValue({
      id: "order-1",
      status: "READY_FOR_CANDIDATE_SELECTION",
      activeCustomerRequestId: "request-1",
      activeAssignmentId: null,
    });

    const result = await updateCustomerRequestByAdmin(baseInput({ customerPhone: "010-9999-8888" }));

    const data = mocks.updateRequest.mock.calls[0][0].data;
    expect(decryptPii(data.customerPhoneEncrypted)).toBe("01099998888");
    expect(data.customerPhoneSource).toBe("ADMIN");
    expect(data.installDate).toBe("2026-11-10");
    const event = mocks.createStatusEvent.mock.calls[0][0].data;
    expect(event.eventType).toBe("ADMIN_EDITED_CUSTOMER_REQUEST");
    expect(event.metadata.changedFields).toEqual(["installDate", "customerPhone"]);
    // 개인정보는 이력에 평문으로 남기지 않는다.
    expect(JSON.stringify(event.metadata)).not.toContain("01099998888");
    expect(mocks.updateOrder).not.toHaveBeenCalled();
    expect(mocks.dispatchReadyInstallationOrders).toHaveBeenCalledWith({ now: NOW, limit: 1, orderId: "order-1" });
    expect(result.candidateReselected).toBe(false);
  });

  it("voids the pending admin-review candidate when the address changes", async () => {
    mocks.findOrder.mockResolvedValue({
      id: "order-1",
      status: "WAITING_ADMIN_REVIEW",
      activeCustomerRequestId: "request-1",
      activeAssignmentId: "attempt-1",
    });
    mocks.findAttempt.mockResolvedValue({ id: "attempt-1", status: "WAITING_ADMIN_REVIEW", selectionSnapshot: {} });

    const result = await updateCustomerRequestByAdmin(baseInput({ installAddress: "부산 해운대구 센텀중앙로 79" }));

    expect(mocks.updateAttempt.mock.calls[0][0]).toMatchObject({
      where: { id: "attempt-1" },
      data: { status: "ADMIN_MANUAL_OVERRIDDEN", cancelledByAdminId: "admin-1" },
    });
    expect(mocks.updateOrder.mock.calls[0][0].data).toMatchObject({
      status: "READY_FOR_CANDIDATE_SELECTION",
      activeAssignmentId: null,
    });
    expect(result.candidateReselected).toBe(true);
    expect(mocks.dispatchReadyInstallationOrders).toHaveBeenCalled();
  });

  it("keeps the admin-review candidate when only the phone changes", async () => {
    mocks.findOrder.mockResolvedValue({
      id: "order-1",
      status: "WAITING_ADMIN_REVIEW",
      activeCustomerRequestId: "request-1",
      activeAssignmentId: "attempt-1",
    });

    const result = await updateCustomerRequestByAdmin(
      baseInput({ installDate: "2026-11-08", customerPhone: "010-9999-8888" }),
    );

    expect(mocks.updateAttempt).not.toHaveBeenCalled();
    expect(mocks.updateOrder).not.toHaveBeenCalled();
    expect(result.candidateReselected).toBe(false);
    expect(mocks.dispatchReadyInstallationOrders).not.toHaveBeenCalled();
  });

  it("reports when nothing changed", async () => {
    mocks.findOrder.mockResolvedValue({
      id: "order-1",
      status: "READY_FOR_CANDIDATE_SELECTION",
      activeCustomerRequestId: "request-1",
      activeAssignmentId: null,
    });

    await expect(updateCustomerRequestByAdmin(baseInput({ installDate: "2026-11-08" }))).rejects.toThrow(
      "NOTHING_CHANGED",
    );
  });
});
